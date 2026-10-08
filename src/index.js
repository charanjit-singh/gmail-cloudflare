import { saveSentMail, listMail, getMail } from "./mail-store.js";
import { getAccounts, saveAccounts, normalizeAddress } from "./settings-store.js";

const CF = "https://api.cloudflare.com/client/v4";

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, DELETE, PUT, OPTIONS",
};

async function cf(env, path, init = {}) {
  const res = await fetch(CF + path, {
    ...init,
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      "content-type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).join("; ") || `Cloudflare error ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status || 500 });
  }
  return body.result;
}

function authorized(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (given.length !== env.ADMIN_PASSWORD.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ env.ADMIN_PASSWORD.charCodeAt(i);
  return diff === 0;
}

const forwardRule = (name, match, dests) => ({
  name,
  enabled: true,
  matchers: [match],
  actions: [{ type: "forward", value: dests }],
});

const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
const BASE64_BYTES_PER_CHAR = 3 / 4;
const MIME_BY_EXTENSION = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", txt: "text/plain", csv: "text/csv", html: "text/html", json: "application/json",
  zip: "application/zip", doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Cloudflare needs content, filename, type and disposition on every attachment.
function cloudflareAttachments(attachments) {
  return (attachments || []).map((file) => {
    const extension = (file.filename.split(".").pop() || "").toLowerCase();
    return {
      content: file.content,
      filename: file.filename,
      type: file.type || file.contentType || MIME_BY_EXTENSION[extension] || "application/octet-stream",
      disposition: file.disposition || "attachment",
    };
  });
}

const attachmentBytes = (attachments) =>
  (attachments || []).reduce((total, file) => total + Math.floor((file.content || "").length * BASE64_BYTES_PER_CHAR), 0);

// Silently copies a send to our own inbox (for clients that can't save into Gmail's Sent folder).
function withInboxCopy(bcc, visibleRecipients, inbox) {
  const list = bcc || [];
  if (!inbox || [...visibleRecipients, ...list].some((address) => address.toLowerCase().includes(inbox.toLowerCase()))) return list;
  return [...list, inbox];
}

// The mail has already been sent, so a failed save is reported to the caller instead of failing the send.
async function recordSentMail(env, mail) {
  if (!env.DB) return { stored: false, storeError: "D1 is not set up" };
  try {
    return { stored: true, mailId: await saveSentMail(env, mail) };
  } catch (error) {
    console.error("Could not save sent mail: " + error.message);
    return { stored: false, storeError: error.message };
  }
}

async function route(request, env, url) {
  const { pathname: p } = url;
  const m = request.method;
  let parts;

  if (p === "/api/config" && m === "GET") {
    return json({ defaultDestination: env.DEFAULT_DESTINATION, canSend: true, canStoreMail: Boolean(env.DB) });
  }

  if (p === "/api/zones" && m === "GET") {
    const zones = await cf(env, "/zones?per_page=50");
    return json(zones.map((z) => ({ id: z.id, name: z.name, accountId: z.account.id })));
  }

  if (p === "/api/accounts" && m === "GET") {
    const [saved, zones] = await Promise.all([getAccounts(env), cf(env, "/zones?per_page=50")]);
    const routing = await Promise.all(zones.map((zone) => cf(env, `/zones/${zone.id}/email/routing`).catch(() => null)));
    const receivingDomains = zones.filter((zone, index) => routing[index]?.enabled).map((zone) => zone.name.toLowerCase());
    return json({ ...saved, domains: zones.map((zone) => zone.name.toLowerCase()), receivingDomains });
  }

  if (p === "/api/accounts" && m === "PUT") {
    const { accounts } = await request.json();
    const parsed = (Array.isArray(accounts) ? accounts : []).map((account) => normalizeAddress(account?.value ?? account));
    if (parsed.some((account) => !account)) {
      return json({ error: "Each account needs an email, like BN Habitat · hello@bnhabitat.com" }, 400);
    }
    const domains = (await cf(env, "/zones?per_page=50")).map((zone) => zone.name.toLowerCase());
    const unknown = [...new Set(parsed.map((account) => account.email.split("@")[1].toLowerCase()))].filter((domain) => !domains.includes(domain));
    if (unknown.length) return json({ error: `Not on your Cloudflare account: ${unknown.join(", ")}. Add the domain there first.` }, 400);
    return json({ ...(await saveAccounts(env, parsed.map((account) => account.value))), domains });
  }

  if (p === "/api/destinations" && m === "GET") {
    const account = url.searchParams.get("account");
    return json(await cf(env, `/accounts/${account}/email/routing/addresses`));
  }
  if (p === "/api/destinations" && m === "POST") {
    const { account, email } = await request.json();
    return json(await cf(env, `/accounts/${account}/email/routing/addresses`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }));
  }

  if (p === "/api/destinations" && m === "DELETE") {
    const account = url.searchParams.get("account");
    return json(await cf(env, `/accounts/${account}/email/routing/addresses/${url.searchParams.get("id")}`, { method: "DELETE" }));
  }

  if ((parts = p.match(/^\/api\/zones\/([a-f0-9]+)\/(status|enable|rules|catch-all)$/))) {
    const [, zone, what] = parts;
    const base = `/zones/${zone}/email/routing`;
    if (what === "status" && m === "GET") return json(await cf(env, base));
    if (what === "enable" && m === "POST") {
      return json(await cf(env, `${base}/enable`, { method: "POST", body: "{}" }));
    }
    if (what === "rules" && m === "GET") return json(await cf(env, `${base}/rules?per_page=50`));
    if (what === "rules" && m === "POST") {
      const { alias, destination } = await request.json();
      const dest = destination || env.DEFAULT_DESTINATION;
      return json(await cf(env, `${base}/rules`, {
        method: "POST",
        body: JSON.stringify(forwardRule(`${alias} -> ${dest}`, { type: "literal", field: "to", value: alias }, [dest])),
      }));
    }
    if (what === "catch-all" && m === "GET") return json(await cf(env, `${base}/rules/catch_all`));
    if (what === "catch-all" && m === "PUT") {
      const { enabled, destination } = await request.json();
      const dest = destination || env.DEFAULT_DESTINATION;
      return json(await cf(env, `${base}/rules/catch_all`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Catch-all",
          enabled: !!enabled,
          matchers: [{ type: "all" }],
          actions: [{ type: "forward", value: [dest] }],
        }),
      }));
    }
  }

  if ((parts = p.match(/^\/api\/zones\/([a-f0-9]+)\/rules\/([a-f0-9]+)$/)) && m === "DELETE") {
    return json(await cf(env, `/zones/${parts[1]}/email/routing/rules/${parts[2]}`, { method: "DELETE" }));
  }

  if (p === "/api/send" && m === "POST") {
    let { from, to, cc, bcc, subject, text, html, replyTo, attachments, copyToInbox, inReplyTo, references } = await request.json();
    if (!from) return json({ error: "Pick an account to send from." }, 400);
    if (!to?.length) return json({ error: "Add at least one recipient in To." }, 400);
    subject = (subject || "").trim() || "(no subject)";
    bcc = withInboxCopy(bcc, [...to, ...(cc || [])], copyToInbox && env.DEFAULT_DESTINATION);
    if (!text?.trim() && !html?.trim()) return json({ error: "Message is empty. Type something in the Message box and send again." }, 400);
    if (attachmentBytes(attachments) > MAX_MESSAGE_BYTES) {
      return json({ error: "Attachments are over 5 MB in total. Send smaller files or share a link." }, 413);
    }
    const [, name, addr] = from.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/) || [, "", from.trim()];
    const domain = addr.split("@")[1];
    const [zone] = await cf(env, `/zones?name=${encodeURIComponent(domain)}`);
    if (!zone) return json({ error: `Domain ${domain} is not in this Cloudflare account` }, 400);
    const result = await cf(env, `/accounts/${zone.account.id}/email/sending/send`, {
      method: "POST",
      body: JSON.stringify({
        from: name ? { address: addr, name } : addr,
        to, cc: cc?.length ? cc : undefined, bcc: bcc?.length ? bcc : undefined,
        subject, text, html,
        reply_to: replyTo || addr,
        attachments: attachments?.length ? cloudflareAttachments(attachments) : undefined,
        headers: inReplyTo ? { "In-Reply-To": inReplyTo, References: references || inReplyTo } : undefined,
      }),
    });
    const stored = await recordSentMail(env, { from, to, cc, bcc, subject, text, html, attachments, messageId: result?.message_id });
    return json({ ok: true, result, ...stored });
  }

  if (p === "/api/mail" && m === "GET") return json(await listMail(env, Object.fromEntries(url.searchParams)));

  if ((parts = p.match(/^\/api\/mail\/([\w-]+)$/)) && m === "GET") {
    const mail = await getMail(env, parts[1]);
    return mail ? json(mail) : json({ error: "Not found" }, 404);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401, CORS);
    try {
      const res = await route(request, env, url);
      Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      return json({ error: e.message }, e.status || 500, CORS);
    }
  },
};
