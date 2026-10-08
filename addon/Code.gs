// Gmail Add-on: send mail from your Cloudflare-routed domain addresses.
// You enter only WORKER_URL and ADMIN_PASSWORD. Sending accounts are managed on the Worker dashboard and cached
// here in FROM_ADDRESSES; LAST_FROM remembers the last account used.

const props = () => PropertiesService.getUserProperties();
const list = (s) => (s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
const LOGO_URL = "https://raw.githubusercontent.com/charanjit-singh/gmail-cloudflare/main/docs/logo.png";
const lines = (s) => (s || "").split("\n").map((x) => x.trim()).filter(Boolean);

// ---------- Settings and identities ----------

const EMAIL_PATTERN = /[^\s<>,;"]+@[^\s<>,;"]+/;

// Accepts "Name <a@b.com>", "Name · a@b.com" or "a@b.com". Gmail strips <...> from card text, so
// screens use the "Name · email" label and the Worker gets the "Name <email>" value.
function parseIdentity(line) {
  const match = line.match(EMAIL_PATTERN);
  if (!match) return null;
  const email = match[0];
  const name = line.replace(email, " ").replace(/[<>"·|]/g, " ").replace(/\s+/g, " ").trim();
  return { email, value: name ? name + " <" + email + ">" : email, label: name ? name + " · " + email : email };
}

function identities() {
  const p = props().getProperties();
  return lines(p.FROM_ADDRESSES || p.FROM_ADDRESS).map(parseIdentity).filter(Boolean);
}

const labelFor = (value) => (parseIdentity(value) || { label: value }).label;

// Calls the Worker. Returns { status, body }, with status 0 when it cannot be reached.
function workerRequest(method, path, body) {
  const p = props().getProperties();
  if (!p.WORKER_URL || !p.ADMIN_PASSWORD) return { status: 0, body: {} };
  try {
    const response = UrlFetchApp.fetch(p.WORKER_URL + path, {
      method,
      contentType: "application/json",
      headers: { Authorization: "Bearer " + p.ADMIN_PASSWORD },
      muteHttpExceptions: true,
      payload: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.getResponseCode(), body: JSON.parse(response.getContentText() || "{}") };
  } catch (error) {
    console.error("Worker request failed: " + error);
    return { status: 0, body: {} };
  }
}

// Loads the accounts from the Worker and caches them. Uploads this add-on's old list once if the Worker has none.
function syncAccounts() {
  const remote = workerRequest("get", "/api/accounts");
  if (remote.status !== 200) return { error: remote.body.error || "Couldn't reach the Worker. Check the URL and password." };
  const local = identities().map((identity) => identity.value);
  if (!remote.body.accounts.length && local.length) {
    const uploaded = workerRequest("put", "/api/accounts", { accounts: local });
    return uploaded.status === 200 ? uploaded.body : { error: uploaded.body.error };
  }
  props().setProperty("FROM_ADDRESSES", remote.body.accounts.map((account) => account.value).join("\n"));
  return remote.body;
}

function chosenFrom(formInput) {
  const from = (formInput.from || "").trim() || (identities()[0] || {}).value;
  if (from) props().setProperty("LAST_FROM", from);
  return from;
}

// ---------- Building blocks ----------

const icon = (name) => CardService.newIconImage().setIcon(CardService.Icon[name]);
const action = (functionName, parameters) => {
  const built = CardService.newAction().setFunctionName(functionName);
  return parameters ? built.setParameters(parameters) : built;
};
const filledButton = (text, onClick) =>
  CardService.newTextButton().setText(text).setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOnClickAction(onClick);
const textButton = (text, onClick) => CardService.newTextButton().setText(text).setOnClickAction(onClick);
const textInput = (name, title, value, multiline) =>
  CardService.newTextInput().setFieldName(name).setTitle(title).setValue(value || "").setMultiline(!!multiline);
// Gmail renders card text as HTML and drops anything inside <...>.
const plain = (text) => String(text || "").replace(/</g, "(").replace(/>/g, ")");
const note = (text) => CardService.newTextParagraph().setText(text);
const showCard = (card) =>
  CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(card)).build();

function notify(text, pop) {
  const response = CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text));
  if (pop) response.setNavigation(CardService.newNavigation().popToRoot());
  return response.build();
}

function fromDropdown(selected) {
  const chosen = selected || props().getProperty("LAST_FROM");
  const dropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName("from")
    .setTitle("Send from");
  identities().forEach((identity) => dropdown.addItem(identity.label, identity.value, identity.value === chosen));
  return dropdown;
}

function header(title, subtitle) {
  const built = CardService.newCardHeader().setTitle(title).setImageUrl(LOGO_URL);
  return subtitle ? built.setSubtitle(subtitle) : built;
}

function resultCard(title, detail, ok) {
  const row = CardService.newDecoratedText()
    .setText("<b>" + plain(title) + "</b>")
    .setBottomLabel(plain(detail))
    .setWrapText(true)
    .setStartIcon(icon(ok ? "CONFIRMATION_NUMBER_ICON" : "DESCRIPTION"));
  return CardService.newCardBuilder().addSection(CardService.newCardSection().addWidget(row)).build();
}

// ---------- Entry points ----------

function onHome() {
  syncAccounts();
  return props().getProperty("WORKER_URL") && identities().length ? composeCard({}) : settingsCard();
}

// Opened on a message: reply to the sender from one of your addresses.
function onMessage(e) {
  syncAccounts();
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const message = GmailApp.getMessageById(e.gmail.messageId);
  const subject = message.getSubject();
  return composeCard(
    {
      to: message.getReplyTo() || message.getFrom(),
      subject: /^re:/i.test(subject) ? subject : "Re: " + subject,
    },
    "Replying to " + message.getFrom()
  );
}

// ---------- Side panel: compose ----------

function composeCard(values, context) {
  const sender = CardService.newCardSection().setHeader(context || "New message").addWidget(fromDropdown());
  const recipients = CardService.newCardSection()
    .addWidget(textInput("to", "To", values.to))
    .addWidget(textInput("subject", "Subject", values.subject));
  const copy = CardService.newCardSection()
    .setHeader("Cc")
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(0)
    .addWidget(textInput("cc", "Cc", values.cc));
  const body = CardService.newCardSection().addWidget(textInput("body", "Message", values.body, true));
  const footer = CardService.newFixedFooter()
    .setPrimaryButton(filledButton("Send", action("send")))
    .setSecondaryButton(textButton("Settings", action("openSettings")));
  return CardService.newCardBuilder()
    .setHeader(header("Send as alias", identities().length + " address" + (identities().length === 1 ? "" : "es")))
    .addSection(sender)
    .addSection(recipients)
    .addSection(copy)
    .addSection(body)
    .setFixedFooter(footer)
    .build();
}

function send(e) {
  const form = e.formInput;
  const from = chosenFrom(form);
  const payload = { to: list(form.to), cc: list(form.cc), subject: form.subject || "", text: form.body || "" };
  const result = post(from, payload);
  if (result.error) return notify("Send failed: " + result.error);
  const copyError = saveSentCopy(buildRaw(from, payload, result.messageId));
  return notify(copyError ? "Sent, but not copied to Sent: " + copyError : "Sent!", true);
}

// ---------- Compose window ----------

// Compose-window action (see composeTrigger in appsscript.json): pick an account, tap it, sent.
function sendDraft() {
  syncAccounts();
  const accounts = identities();
  if (!accounts.length) return resultCard("Set up your addresses", "Open the add-on and save at least one From address in Settings.", false);
  const draft = GmailApp.getDrafts().sort((x, y) => y.getMessage().getDate() - x.getMessage().getDate())[0];
  if (!draft) return resultCard("No draft found", "Wait a few seconds for Gmail to auto-save, then try again.", false);
  if (accounts.length === 1) return deliverDraft(draft, accounts[0].value);
  return accountPickerCard(draft, accounts);
}

function accountPickerCard(draft, accounts) {
  const message = draft.getMessage();
  const last = props().getProperty("LAST_FROM");
  const ordered = accounts.slice().sort((x, y) => (y.value === last) - (x.value === last));
  const summary = CardService.newCardSection()
    .addWidget(CardService.newDecoratedText().setTopLabel("To").setText(plain(message.getTo()) || "No recipient").setWrapText(true))
    .addWidget(CardService.newDecoratedText().setTopLabel("Subject").setText(plain(message.getSubject()) || "No subject").setWrapText(true));
  const picker = CardService.newCardSection().setHeader("Send from");
  ordered.forEach((account) => {
    picker.addWidget(
      CardService.newDecoratedText()
        .setText(plain(account.label))
        .setStartIcon(icon("EMAIL"))
        .setOnClickAction(action("sendDraftFrom", { draftId: draft.getId(), from: account.value }))
    );
  });
  return CardService.newCardBuilder()
    .setHeader(header("Which account?", "Tap one to send"))
    .addSection(summary)
    .addSection(picker)
    .build();
}

function sendDraftFrom(e) {
  props().setProperty("LAST_FROM", e.parameters.from);
  return showCard(deliverDraft(GmailApp.getDraft(e.parameters.draftId), e.parameters.from));
}

// Sends the draft, keeps a copy in Gmail's Sent folder, and returns the card to show.
function deliverDraft(draft, from) {
  const message = draft.getMessage();
  const result = post(from, {
    to: list(message.getTo()),
    cc: list(message.getCc()),
    bcc: list(message.getBcc()),
    subject: message.getSubject(),
    text: message.getPlainBody(),
    html: message.getBody(),
    attachments: message.getAttachments().map((file) => ({
      filename: file.getName(),
      type: file.getContentType(),
      content: Utilities.base64Encode(file.getBytes()),
    })),
  });
  if (result.error) return resultCard("Could not send", result.error, false);
  const copyError = saveSentCopy(rawWithSender(message.getRawContent(), from, result.messageId));
  draft.deleteDraft();
  const detail = "From " + labelFor(from) + "\nTo " + (message.getTo() || "recipient");
  return resultCard("Sent!", copyError ? detail + "\nNot copied to Sent: " + copyError : detail, true);
}

// ---------- Sent copy ----------

function setHeader(raw, name, value) {
  const split = raw.search(/\r?\n\r?\n/);
  const head = raw.slice(0, split).replace(new RegExp("^" + name + ":.*(\\r?\\n[ \\t].*)*\\r?\\n?", "gim"), "");
  return name + ": " + value + "\r\n" + head + raw.slice(split);
}

const encodeWord = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : "=?UTF-8?B?" + Utilities.base64Encode(text, Utilities.Charset.UTF_8) + "?=");

function rawWithSender(raw, from, messageId) {
  const withFrom = setHeader(raw, "From", from);
  return messageId ? setHeader(withFrom, "Message-ID", messageId) : withFrom;
}

function buildRaw(from, payload, messageId) {
  const headers = [
    "From: " + from,
    "To: " + payload.to.join(", "),
    payload.cc && payload.cc.length ? "Cc: " + payload.cc.join(", ") : null,
    "Subject: " + encodeWord(payload.subject),
    "Date: " + Utilities.formatDate(new Date(), "UTC", "EEE, dd MMM yyyy HH:mm:ss Z"),
    messageId ? "Message-ID: " + messageId : null,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  return headers.join("\r\n") + "\r\n\r\n" + Utilities.base64Encode(payload.text, Utilities.Charset.UTF_8);
}

// Puts a copy of the sent mail in Gmail's Sent folder. Returns an error string, or null.
function saveSentCopy(raw) {
  try {
    Gmail.Users.Messages.insert({ raw: Utilities.base64EncodeWebSafe(raw), labelIds: ["SENT"] }, "me");
    return null;
  } catch (error) {
    console.error("Could not save the sent copy: " + error);
    return String(error.message || error);
  }
}

// ---------- Settings ----------

function openSettings() {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(settingsCard())).build();
}

function settingsCard() {
  const p = props();
  const synced = p.getProperty("WORKER_URL") ? syncAccounts() : null;
  const connection = CardService.newCardSection()
    .setHeader("Connection")
    .addWidget(textInput("WORKER_URL", "Worker URL", p.getProperty("WORKER_URL")))
    .addWidget(textInput("ADMIN_PASSWORD", "Admin password", p.getProperty("ADMIN_PASSWORD")))
    .addWidget(note("That's all you need. Accounts load from your Worker."));
  const card = CardService.newCardBuilder().setHeader(header("Settings")).addSection(connection);
  if (synced) card.addSection(accountsSection(synced));
  const footer = CardService.newFixedFooter().setPrimaryButton(filledButton("Save", action("saveSettings")));
  if (p.getProperty("WORKER_URL")) {
    footer.setSecondaryButton(
      CardService.newTextButton().setText("Manage accounts").setOpenLink(CardService.newOpenLink().setUrl(p.getProperty("WORKER_URL")))
    );
  }
  return card.setFixedFooter(footer).build();
}

function accountsSection(synced) {
  const section = CardService.newCardSection().setHeader("Sending accounts");
  if (synced.error) return section.addWidget(note(plain(synced.error)));
  if (!synced.accounts.length) return section.addWidget(note("No accounts yet. Add them on the Worker dashboard."));
  synced.accounts.forEach((account) => {
    section.addWidget(
      CardService.newDecoratedText().setText(plain(account.name || account.email)).setBottomLabel(plain(account.email)).setStartIcon(icon("EMAIL"))
    );
  });
  return section;
}

function saveSettings(e) {
  const form = e.formInput;
  props().setProperties({
    WORKER_URL: (form.WORKER_URL || "").trim().replace(/\/$/, ""),
    ADMIN_PASSWORD: (form.ADMIN_PASSWORD || "").trim(),
  });
  props().deleteProperty("FROM_ADDRESS");
  const synced = syncAccounts();
  if (synced.error) return notify(synced.error);
  const count = synced.accounts.length;
  return notify("Connected. " + count + " account" + (count === 1 ? "" : "s") + " loaded.", true);
}

// ---------- Worker ----------

// Posts to the Worker. Returns { messageId } on success or { error }.
function post(from, payload) {
  const p = props().getProperties();
  if (!p.WORKER_URL || !from) return { error: "Open Settings first." };
  if (!payload.to.length) return { error: "Add a recipient." };
  const response = UrlFetchApp.fetch(p.WORKER_URL + "/api/send", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + p.ADMIN_PASSWORD },
    muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({ from }, payload)),
  });
  let body = {};
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    console.error("Worker reply was not JSON: " + error);
  }
  if (response.getResponseCode() === 200) return { messageId: body.result && body.result.message_id };
  return { error: body.error || "HTTP " + response.getResponseCode() };
}
