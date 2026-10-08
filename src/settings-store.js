const ADDRESSES_KEY = "from_addresses";
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
  return { email, value: name ? `${name} <${email}>` : email };
}

export async function getAddresses(env) {
  const row = await database(env).prepare("SELECT value, updated_at FROM settings WHERE key = ?").bind(ADDRESSES_KEY).first();
  return { addresses: row ? JSON.parse(row.value) : [], updatedAt: row ? row.updated_at : null };
}

export async function saveAddresses(env, addresses) {
  const updatedAt = Date.now();
  await database(env)
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(ADDRESSES_KEY, JSON.stringify(addresses), updatedAt)
    .run();
  return { addresses, updatedAt };
}
