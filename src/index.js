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

async function route(request, env, url) {
  const { pathname: p } = url;
  const m = request.method;
  let parts;

  if (p === "/api/config" && m === "GET") {
    return json({ defaultDestination: env.DEFAULT_DESTINATION, canSend: true });
  }

  if (p === "/api/zones" && m === "GET") {
    const zones = await cf(env, "/zones?per_page=50");
    return json(zones.map((z) => ({ id: z.id, name: z.name, accountId: z.account.id })));
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
    const { from, to, cc, bcc, subject, text, html, replyTo, attachments } = await request.json();
    if (!from || !to?.length || !subject) return json({ error: "from, to and subject are required" }, 400);
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
        attachments: attachments?.length ? attachments : undefined,
      }),
    });
    return json({ ok: true, result });
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
