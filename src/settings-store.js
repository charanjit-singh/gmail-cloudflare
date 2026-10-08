const ACCOUNTS_KEY = "from_addresses";
const EMAIL_PATTERN = /[^\s<>,;"]+@[^\s<>,;"]+/;

function database(env) {
  if (!env.DB) throw Object.assign(new Error("D1 is not set up. See the Mail archive section in SETUP.md."), { status: 503 });
  return env.DB;
}

// Accepts "Name <a@b.com>", "Name · a@b.com" or "a@b.com" and returns the "Name <a@b.com>" form.
export function normalizeAddress(line) {
  const match = String(line || "").match(EMAIL_PATTERN);
  if (!match) return null;
  const email = match[0];
  const name = String(line).replace(email, " ").replace(/[<>"·|]/g, " ").replace(/\s+/g, " ").trim();
  return { name, email, value: name ? `${name} <${email}>` : email };
}

export async function getAccounts(env) {
  const row = await database(env).prepare("SELECT value, updated_at FROM settings WHERE key = ?").bind(ACCOUNTS_KEY).first();
  const values = row ? JSON.parse(row.value) : [];
  return { accounts: values.map(normalizeAddress).filter(Boolean), updatedAt: row ? row.updated_at : null };
}

export async function saveAccounts(env, values) {
  const updatedAt = Date.now();
  await database(env)
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(ACCOUNTS_KEY, JSON.stringify(values), updatedAt)
    .run();
  return { accounts: values.map(normalizeAddress), updatedAt };
}
