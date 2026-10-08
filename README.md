# gmail-cloudflare

Receive on your own domain, read and send from your everyday Gmail. One Cloudflare token, no other services.

| Part | What it does |
| --- | --- |
| Cloudflare Email Routing | Forwards `anything@yourdomain.com` to `abcd@gmail.com` |
| Dashboard (`public/`) | Manage inboxes, a catch-all and special addresses |
| Worker (`src/index.js`) | Serves the dashboard, proxies the Cloudflare API, sends mail via Cloudflare Email Sending |
| Gmail Add-on (`addon/`) | "Send via custom domain" action in Gmail compose, plus a side panel to compose or reply from your domain address |

```
Incoming:  sender -> you@yourdomain.com -> Cloudflare Email Routing -> abcd@gmail.com
Outgoing:  Gmail add-on -> Worker /api/send -> Cloudflare Email Sending -> recipient
```

## Dashboard

1. **Inboxes you forward to** - add real inboxes (verified once by email), remove them later.
2. **Domain** - pick a zone and enable Email Routing.
3. **Catch-all** - on/off, with a dropdown for which verified inbox gets everything else.
4. **Special addresses** - e.g. `billing@`, each forwarded to the inbox you pick. They win over the catch-all.

## Quick start

See [SETUP.md](SETUP.md) for the full walkthrough. In short:

```
npm install
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler deploy
```

Then open the Worker URL, add your Gmail, enable routing, and install the add-on from `addon/`.

## Limits

- Add-ons cannot read the live compose box, so the compose action sends the most recent auto-saved draft. Wait a few seconds after typing.
- An add-on cannot place a button next to Gmail's own Send. The action lives in the compose window's add-on menu.
- Replies sent this way are not threaded in the recipient's client (no In-Reply-To header yet).
- Email Routing needs the domain's DNS on Cloudflare and replaces existing MX records.
- Email Sending is a newer Cloudflare product. Check what your plan allows.
- The Worker uses one shared password. For stricter access, put it behind Cloudflare Access.
- Alternative with no code: Gmail's Settings > Accounts > "Send mail as" with any SMTP provider.
