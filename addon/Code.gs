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
  const labelError = labelsNeedSetup(remote.body.receivingDomains) ? setupDomainLabels(remote.body.receivingDomains) : null;
  return Object.assign({ labelError }, remote.body);
}

// ---------- Domain labels ----------

// Gmail only accepts colours from its own palette.
const LABEL_COLORS = ["#4a86e8", "#16a766", "#ffad47", "#a479e2", "#f691b3", "#2da2bb"];
const BACKFILL_LIMIT = 500;

const domainLabelIds = () => JSON.parse(props().getProperty("DOMAIN_LABELS") || "{}");

function createDomainLabel(domain, index) {
  const label = { name: domain, labelListVisibility: "labelShow", messageListVisibility: "show" };
  try {
    return Gmail.Users.Labels.create(
      Object.assign({ color: { backgroundColor: LABEL_COLORS[index % LABEL_COLORS.length], textColor: "#ffffff" } }, label),
      "me"
    );
  } catch (error) {
    console.error("Label colour rejected, creating without colour: " + error);
    return Gmail.Users.Labels.create(label, "me");
  }
}

function ensureDomainFilter(domain, labelId, filters) {
  const query = "to:@" + domain;
  const exists = filters.some((filter) => filter.criteria && filter.criteria.query === query && (filter.action.addLabelIds || []).indexOf(labelId) >= 0);
  if (!exists) Gmail.Users.Settings.Filters.create({ criteria: { query }, action: { addLabelIds: [labelId] } }, "me");
}

function labelExistingMail(domain, labelId) {
  const found = Gmail.Users.Messages.list("me", { q: "to:@" + domain + " OR from:@" + domain, maxResults: BACKFILL_LIMIT });
  const ids = ((found || {}).messages || []).map((message) => message.id);
  if (ids.length) Gmail.Users.Messages.batchModify({ ids, addLabelIds: [labelId] }, "me");
}

// Gives every receiving domain a Gmail label and a filter, and labels mail already in the inbox. Returns an error string or null.
function setupDomainLabels(domains) {
  try {
    const labels = (Gmail.Users.Labels.list("me") || {}).labels || [];
    // Gmail returns null, not an empty list, when the account has no filters yet.
    const filters = (Gmail.Users.Settings.Filters.list("me") || {}).filter || [];
    const ids = {};
    domains.forEach((domain, index) => {
      const label = labels.find((existing) => existing.name === domain) || createDomainLabel(domain, index);
      ids[domain] = label.id;
      ensureDomainFilter(domain, label.id, filters);
      labelExistingMail(domain, label.id);
    });
    props().setProperty("DOMAIN_LABELS", JSON.stringify(ids));
    props().deleteProperty("LABEL_ERROR");
    return null;
  } catch (error) {
    console.error("Could not set up domain labels: " + error);
    const message = String(error.message || error);
    props().setProperty("LABEL_ERROR", /permission/i.test(message) ? PERMISSION_ERROR : message);
    return message;
  }
}

function labelsNeedSetup(domains) {
  if (props().getProperty("LABEL_ERROR") === PERMISSION_ERROR) return false;
  return Boolean(domains) && Object.keys(domainLabelIds()).sort().join(",") !== domains.slice().sort().join(",");
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
  const copyError = saveSentCopy(buildRaw(from, payload, result.messageId), from);
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
  const copyError = saveSentCopy(rawWithSender(message.getRawContent(), from, result.messageId), from);
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
function saveSentCopy(raw, from) {
  const email = (from.match(EMAIL_PATTERN) || [""])[0];
  const domainLabel = domainLabelIds()[(email.split("@")[1] || "").toLowerCase()];
  try {
    Gmail.Users.Messages.insert({ raw: Utilities.base64EncodeWebSafe(raw), labelIds: domainLabel ? ["SENT", domainLabel] : ["SENT"] }, "me");
    return null;
  } catch (error) {
    console.error("Could not save the sent copy: " + error);
    return String(error.message || error);
  }
}

// ---------- Settings ----------

const LABEL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.settings.basic"];
const PERMISSION_ERROR = "permission";

function materialIcon(name) {
  try {
    return CardService.newIconImage().setMaterialIcon(CardService.newMaterialIcon().setName(name));
  } catch (error) {
    console.error("Material icons unavailable, using a built-in icon: " + error);
    return icon("EMAIL");
  }
}

const hostOf = (url) => String(url || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const pushCard = (card) => CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();

function openSettings() {
  return pushCard(settingsCard());
}

function settingsCard() {
  const p = props();
  if (!p.getProperty("WORKER_URL") || !p.getProperty("ADMIN_PASSWORD")) return connectionCard();
  const synced = syncAccounts();
  const card = CardService.newCardBuilder().setHeader(header("Settings", "Send as alias")).addSection(connectionSection(synced));
  if (!synced.error) accountSections(synced.accounts).forEach((section) => card.addSection(section));
  if (!synced.error) card.addSection(labelsSection(synced.receivingDomains || []));
  const footer = CardService.newFixedFooter().setPrimaryButton(
    CardService.newTextButton().setText("Manage accounts").setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOpenLink(CardService.newOpenLink().setUrl(p.getProperty("WORKER_URL")))
  );
  return card.setFixedFooter(footer).build();
}

function connectionSection(synced) {
  const row = CardService.newDecoratedText()
    .setTopLabel(synced.error ? "Can't connect" : "Connected to")
    .setText(plain(hostOf(props().getProperty("WORKER_URL"))))
    .setStartIcon(materialIcon(synced.error ? "cloud_off" : "cloud_done"))
    .setButton(CardService.newTextButton().setText("Change").setOnClickAction(action("openConnection")));
  const section = CardService.newCardSection().addWidget(row);
  return synced.error ? section.addWidget(note(plain(synced.error))) : section;
}

function accountSections(accounts) {
  if (!accounts.length) {
    return [CardService.newCardSection().setHeader("Sending accounts").addWidget(note("No accounts yet. Tap Manage accounts to add them."))];
  }
  const byDomain = {};
  accounts.forEach((account) => (byDomain[domainOfEmail(account.email)] = (byDomain[domainOfEmail(account.email)] || []).concat(account)));
  return Object.keys(byDomain).sort().map((domain) => {
    const section = CardService.newCardSection().setHeader(domain);
    byDomain[domain].forEach((account) => {
      section.addWidget(
        CardService.newDecoratedText().setText(plain(account.name || account.email)).setBottomLabel(plain(account.email)).setStartIcon(materialIcon("account_circle"))
      );
    });
    return section;
  });
}

const domainOfEmail = (email) => (email.split("@")[1] || "").toLowerCase();

function labelsSection(domains) {
  const section = CardService.newCardSection().setHeader("Inbox labels");
  const error = props().getProperty("LABEL_ERROR");
  if (error === PERMISSION_ERROR) {
    return section.addWidget(
      CardService.newDecoratedText().setText("Gmail needs one more permission").setBottomLabel("To add a label for each domain")
        .setStartIcon(materialIcon("lock")).setWrapText(true)
        .setButton(CardService.newTextButton().setText("Allow").setOnClickAction(action("allowLabelAccess")))
    );
  }
  if (error) return section.addWidget(note("Couldn't set up labels: " + plain(error)));
  const ready = domainLabelIds();
  domains.forEach((domain) => {
    section.addWidget(
      CardService.newDecoratedText().setText(domain).setBottomLabel(ready[domain] ? "Labelled in your inbox" : "Not set up yet")
        .setStartIcon(materialIcon(ready[domain] ? "label" : "label_off"))
    );
  });
  return section;
}

function allowLabelAccess() {
  if (ScriptApp.requireScopes) ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, LABEL_SCOPES);
  props().deleteProperty("DOMAIN_LABELS");
  props().deleteProperty("LABEL_ERROR");
  const synced = syncAccounts();
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(synced.labelError ? "Labels still failed. See Settings." : "Inbox labels are ready"))
    .setNavigation(CardService.newNavigation().updateCard(settingsCard()))
    .build();
}

function openConnection() {
  return pushCard(connectionCard());
}

function connectionCard() {
  const p = props();
  const hasPassword = Boolean(p.getProperty("ADMIN_PASSWORD"));
  const section = CardService.newCardSection()
    .addWidget(textInput("WORKER_URL", "Worker URL", p.getProperty("WORKER_URL")))
    .addWidget(
      CardService.newTextInput().setFieldName("ADMIN_PASSWORD").setTitle("Admin password")
        .setHint(hasPassword ? "Leave empty to keep the saved password" : "The dashboard password")
    );
  const footer = CardService.newFixedFooter().setPrimaryButton(filledButton("Connect", action("saveSettings")));
  return CardService.newCardBuilder().setHeader(header("Connect", "Your Worker URL and password")).addSection(section).setFixedFooter(footer).build();
}

function saveSettings(e) {
  const form = e.formInput;
  const password = (form.ADMIN_PASSWORD || "").trim() || props().getProperty("ADMIN_PASSWORD") || "";
  const workerUrl = (form.WORKER_URL || "").trim().replace(/\/$/, "");
  if (!workerUrl || !password) return notify("Enter the Worker URL and the admin password.");
  props().setProperties({ WORKER_URL: workerUrl, ADMIN_PASSWORD: password });
  props().deleteProperty("FROM_ADDRESS");
  props().deleteProperty("DOMAIN_LABELS");
  const synced = syncAccounts();
  if (synced.error) return notify(synced.error);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Connected. " + synced.accounts.length + " accounts loaded."))
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(settingsCard()))
    .build();
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

// Run once from the Apps Script editor (Run > authorize) to approve new permissions; test add-ons don't re-prompt.
function authorize() {
  Gmail.Users.Labels.list("me");
  Gmail.Users.Settings.Filters.list("me");
  UrlFetchApp.getRequest("https://example.com");
  console.log("All permissions approved.");
}
