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

1. **Enable first:** turn on the Apps Script API once at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
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

## Sending accounts

Manage the addresses you send from in the dashboard's **Sending accounts** card. The Gmail add-on and the Chrome extension only need the Worker URL and admin password; they load the accounts from `GET /api/accounts`.

## Mail archive (optional)

Every message sent through the Worker is saved to a D1 database, and the dashboard shows a **Sent mail** list you can search and open. HTML mail renders in a sandboxed frame.

```
npx wrangler d1 create gmail-cloudflare-mail
npx wrangler d1 execute gmail-cloudflare-mail --remote --file schema.sql
```

Add the binding printed by the first command to `wrangler.toml`, then deploy:

```
[[d1_databases]]
binding = "DB"
database_name = "gmail-cloudflare-mail"
database_id = "<id from the create command>"
```

Without the binding, sending still works and nothing is saved. The `mail` table already has a `direction` column, so received mail can be added later.

## Chrome extension (optional)

No library or app ID needed. The extension adds a **Send as alias** button next to Send in Gmail's compose window (pick an account, tap, sent). Click the extension's toolbar icon to open your sent-mail archive in a new tab.

```
cd extension
npm install
npm run build
```

1. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `extension/dist`.
2. Open the extension's options, enter the Worker URL and admin password, and click **Connect**. Your sending accounts load automatically.
3. Reload Gmail.

### Sent copies in Gmail (optional)

Without this, every extension send is silently BCC'd to `DEFAULT_DESTINATION`, so a copy still reaches your inbox.
With it, the extension saves a real copy in Gmail's **Sent**, in the right conversation, and replies thread for the recipient.

1. Create `extension/local.json` (not committed) with a fixed extension key; `npm run build` reads it. The key's extension ID is what Google needs.
2. In [Google Cloud console](https://console.cloud.google.com): enable the **Gmail API**; set up the **OAuth consent screen** (External, Testing) and add your Gmail as a test user; then **Credentials > Create credentials > OAuth client ID > Chrome extension** with that extension ID.
3. Put the client ID in `local.json` as `oauthClientId`, rebuild, reload the extension. The first send asks for Gmail access once.

Limits: the button finds Gmail's compose window by its page structure, so a Gmail redesign can break it. It sends text and HTML only; for messages with attachments use the add-on's **Send via custom domain** action.

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
