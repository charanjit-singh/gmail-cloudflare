const MAX_BODY_CHARS = 900_000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const PREVIEW_CHARS = 140;
const BASE64_BYTES_PER_CHAR = 3 / 4;

const clip = (text) =>
  text && text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) + "\n...(truncated)" : text || null;

function database(env) {
  if (!env.DB) throw Object.assign(new Error("D1 is not set up. See the Mail archive section in SETUP.md."), { status: 503 });
  return env.DB;
}

const attachmentSummary = (attachments) =>
  (attachments || []).map((file) => ({
    filename: file.filename,
    size: Math.floor((file.content || "").length * BASE64_BYTES_PER_CHAR),
  }));

export async function saveSentMail(env, mail) {
  const db = database(env);
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO mail (id, direction, message_id, from_address, to_addresses, cc_addresses, bcc_addresses,
         subject, text_body, html_body, attachments, status, created_at)
       VALUES (?, 'sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`
    )
    .bind(
      id,
      mail.messageId || null,
      mail.from,
      JSON.stringify(mail.to),
      JSON.stringify(mail.cc || []),
      JSON.stringify(mail.bcc || []),
      mail.subject,
      clip(mail.text),
      clip(mail.html),
      JSON.stringify(attachmentSummary(mail.attachments)),
      Date.now()
    )
    .run();
  return id;
}

const likePattern = (text) => "%" + text.replace(/[\\%_]/g, (char) => "\\" + char) + "%";

export async function listMail(env, { direction, q, before, limit }) {
  const db = database(env);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const conditions = [];
  const values = [];
  if (direction === "sent" || direction === "received") {
    conditions.push("direction = ?");
    values.push(direction);
  }
  if (before) {
    conditions.push("created_at < ?");
    values.push(Number(before));
  }
  if (q) {
    conditions.push("(subject LIKE ? ESCAPE '\\' OR from_address LIKE ? ESCAPE '\\' OR to_addresses LIKE ? ESCAPE '\\')");
    values.push(likePattern(q), likePattern(q), likePattern(q));
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const { results } = await db
    .prepare(
      `SELECT id, direction, from_address, to_addresses, subject, status, created_at,
              substr(text_body, 1, ${PREVIEW_CHARS}) AS preview
       FROM mail ${where} ORDER BY created_at DESC LIMIT ?`
    )
    .bind(...values, pageSize)
    .all();
  const items = results.map((row) => ({ ...row, to_addresses: JSON.parse(row.to_addresses) }));
  const next = items.length === pageSize ? items[items.length - 1].created_at : null;
  return { items, next };
}

export async function getMail(env, id) {
  const row = await database(env).prepare("SELECT * FROM mail WHERE id = ?").bind(id).first();
  if (!row) return null;
  return {
    ...row,
    to_addresses: JSON.parse(row.to_addresses),
    cc_addresses: JSON.parse(row.cc_addresses || "[]"),
    bcc_addresses: JSON.parse(row.bcc_addresses || "[]"),
    attachments: JSON.parse(row.attachments || "[]"),
  };
}
