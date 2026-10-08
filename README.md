# gmail-cloudflare

Receive on a custom domain, read and send from your everyday Gmail.

- **Receive:** Cloudflare Email Routing forwards `anything@yourdomain.com` to `abcd@gmail.com`.
- **Dashboard:** a small Cloudflare Worker + static page to verify your Gmail, enable routing, set a catch-all and manage aliases.
- **Send:** a Chrome extension adds a "Send as alias" button to Gmail compose. It posts to the Worker, which sends via Resend from your domain address.

```
src/index.js    Worker: Cloudflare API proxy + /api/send
public/         Dashboard (served by the same Worker)
extension/      Chrome MV3 extension for Gmail
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
2. In `chrome://extensions` enable Developer mode, "Load unpacked", select `extension/`.
3. Open the extension options and set Worker URL, admin password and From address (e.g. `Me <hello@yourdomain.com>`).
4. In Gmail compose, click **Send as alias**. Replies go to your domain address and are forwarded to Gmail.

## Notes

- Gmail's DOM is obfuscated and changes, so the compose selectors in `extension/content.js` may need tweaks.
- Alternative to the extension: Gmail's built-in Settings > Accounts > "Send mail as" with Resend's SMTP (`smtp.resend.com`, user `resend`, password = API key).
- Email Routing needs the domain's DNS on Cloudflare. It replaces existing MX records.
- The Worker is protected by a single shared password. For stricter access put it behind Cloudflare Access.
- Local dev: put secrets in `.dev.vars`, run `npm run dev`.
