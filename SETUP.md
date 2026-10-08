# Setup

Time: about 15 minutes. You need a domain on Cloudflare, a Gmail account and Node.js 18+.

## 1. Create the Cloudflare API token

Cloudflare dashboard > My Profile > API Tokens > Create Token > Custom token.

| Scope | Permission |
| --- | --- |
| Account | Email Routing Addresses: Edit |
| Account | Email Sending: Edit |
| Zone | Email Routing Rules: Edit |
| Zone | Zone Settings: Edit |
| Zone | DNS: Edit |
| Zone | Zone: Read |

Set Zone Resources to the domain(s) you want to use (or all zones). Copy the token. The exact permission names can differ slightly in the token UI.

## 2. Deploy the Worker

```
npm install
```

Optionally set `DEFAULT_DESTINATION` in `wrangler.toml` to your Gmail. It is only a default and placeholder in the dashboard.

```
npx wrangler login
npx wrangler secret put CF_API_TOKEN      # paste the token from step 1
npx wrangler secret put ADMIN_PASSWORD    # choose a strong password
npx wrangler deploy
```

Note the Worker URL it prints, e.g. `https://gmail-cloudflare.you.workers.dev`.

## 3. Configure receiving (dashboard)

Open the Worker URL and sign in with `ADMIN_PASSWORD`.

1. **Inboxes:** enter `abcd@gmail.com` and click Add inbox. Open the verification email from Cloudflare and click the link. The list shows "verified" after a refresh.
2. **Domain:** choose your domain and click Enable Email Routing. Cloudflare adds the MX and SPF records and replaces existing MX records.
3. **Catch-all:** pick the inbox and toggle it on to forward every address.
4. **Special addresses:** type a name such as `billing`, pick an inbox, click Add. Specific addresses take priority over the catch-all.

Test by emailing `anything@yourdomain.com` from another account.

## 4. Configure sending

### 4a. Cloudflare

In the Cloudflare dashboard open Email Service > Email Sending and onboard your domain. Cloudflare adds the SPF and DKIM records. Wait until the domain shows as verified.

### 4b. Gmail add-on

Automated (uses [clasp](https://github.com/google/clasp), Google's Apps Script CLI):

1. Turn on the Apps Script API once at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
2. Run `npm run addon:setup`. It logs you in, creates the Apps Script project and pushes `addon/` to it. Re-running only pushes.
3. Run `npm run addon:open`, then Deploy > Test deployments > Install. Installing is the one step with no CLI. Reload Gmail and approve the permissions (external requests, read and compose drafts).

After editing `addon/`, run `npm run addon:push`.

Manual alternative: at [script.google.com](https://script.google.com) create a project, tick "Show appsscript.json manifest file in editor" in Project Settings, paste in `addon/Code.gs` and `addon/appsscript.json`, then Deploy > Test deployments > Install.

### 4c. Add-on settings

In Gmail open the "Send as alias" icon in the right side panel > Settings and enter:
   - Worker URL
   - Admin password
   - From address, e.g. `Me <hello@yourdomain.com>`

## 5. Send

- **From a normal compose window:** write the message, wait a few seconds for Gmail to save the draft, then use the add-on menu in the compose window and choose **Send via custom domain**. The draft (subject, body, attachments) is sent from your domain address and removed from Drafts.
- **From the side panel:** open the add-on, fill To, Subject and Message, click Send.
- **Reply to a message:** open the message, open the add-on, edit and send.

Recipients who reply write to your domain address, which Cloudflare forwards to Gmail.

## Local development

Create `.dev.vars`:

```
CF_API_TOKEN=...
ADMIN_PASSWORD=...
```

Run `npm run dev` and open the printed local URL.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Dashboard says Unauthorized | Password does not match `ADMIN_PASSWORD`. Clear site data and sign in again. |
| Cloudflare error about permissions | Recheck the token scopes in step 1 and the zone resources. |
| Inbox stays "pending verification" | Check spam for the Cloudflare email, or Add inbox again to resend. |
| "Domain ... is not in this Cloudflare account" on send | The From address domain must be a zone the token can read. |
| Send fails with a Cloudflare error | Confirm the domain finished Email Sending onboarding (step 4a). |
| "No draft found" | Wait a few seconds after typing, then try again. |
| Compose action shows a card or an error | Use the side panel form instead. Gmail's handling of compose actions is a Google limitation. |
