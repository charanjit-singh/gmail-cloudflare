const EMAIL_PATTERN = /[^\s<>,;"]+@[^\s<>,;"]+/;

// Accepts "Name <a@b.com>", "Name · a@b.com" or "a@b.com".
export function parseIdentity(line) {
  const match = line.match(EMAIL_PATTERN);
  if (!match) return null;
  const email = match[0];
  const name = line.replace(email, " ").replace(/[<>"·|]/g, " ").replace(/\s+/g, " ").trim();
  return { email, value: name ? name + " <" + email + ">" : email, label: name ? name + " · " + email : email };
}

export const identitiesFrom = (text) =>
  (text || "").split("\n").map((line) => line.trim()).filter(Boolean).map(parseIdentity).filter(Boolean);

export const loadSettings = () =>
  chrome.storage.local.get({ workerUrl: "", password: "", addresses: "", appId: "", lastFrom: "" });

export function api(path, method = "GET", body) {
  return chrome.runtime.sendMessage({ type: "api", path, method, body });
}

export const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
