# gmail-cloudflare

Receive on a custom domain, read and send from your everyday Gmail.

- **Receive:** Cloudflare Email Routing forwards `anything@yourdomain.com` to `abcd@gmail.com`.
- **Dashboard:** a small Cloudflare Worker + static page to verify your Gmail, enable routing, set a catch-all and manage aliases.
- **Send:** a Gmail Add-on (side panel, works on web and mobile) lets you compose or reply from your domain address. It posts to the Worker, which sends via Resend.

```
src/index.js    Worker: Cloudflare API proxy + /api/send
public/         Dashboard (served by the same Worker)
addon/          Gmail Add-on (Apps Script)
```

## Setup

1. `npm install`
2. Create a Cloudflare API token with:
   - Account: Email Routing Addresses: Edit
   - Zone: Email Routing Rules: Edit
   - Zone: Zone Settings: Edit, DNS: Edit (needed to enable routing)
   - Zone: Zone: Read
3. Edit `DEFAULT_DESTINATION` in `wrangler.toml`.
4. Set secrets and deploy:
   ```
   npx wrangler secret put CF_API_TOKEN
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put RESEND_API_KEY   # optional, for sending
   npx wrangler deploy
   ```
5. Open the Worker URL, sign in, add your Gmail as a destination (click the verification link Cloudflare emails you), pick the domain, enable routing, add aliases or the catch-all.

## Sending

1. Create a [Resend](https://resend.com) account, verify your domain, create an API key.
2. Go to [script.google.com](https://script.google.com), create a project, enable "Show appsscript.json" in Project Settings, and paste in `addon/Code.gs` and `addon/appsscript.json`.
3. Deploy > Test deployments > Install (Gmail Add-on). Later you can publish it privately.
4. In Gmail, open the "Send as alias" icon in the right side panel, then Settings: Worker URL, admin password, From address (e.g. `Me <hello@yourdomain.com>`).
5. In a normal Gmail compose window, open the add-on and click **Send via custom domain**. It sends the auto-saved draft (subject, body, attachments) from your alias and deletes the draft. You can also compose in the side panel, or open any message and reply from the alias. Replies land on your domain and are forwarded to Gmail.

## Notes

- Add-ons cannot read the live compose box, so the button uses the most recent auto-saved draft. Wait a few seconds after typing before clicking.
- Replies sent this way are not threaded in the recipient's client (no In-Reply-To header yet).
- Alternative to the add-on: Gmail's built-in Settings > Accounts > "Send mail as" with Resend's SMTP (`smtp.resend.com`, user `resend`, password = API key).
- Email Routing needs the domain's DNS on Cloudflare. It replaces existing MX records.
- The Worker is protected by a single shared password. For stricter access put it behind Cloudflare Access.
- Local dev: put secrets in `.dev.vars`, run `npm run dev`.
