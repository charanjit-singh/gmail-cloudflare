// Gmail Add-on: send mail from your Cloudflare-routed domain address.
// Settings live in Script Properties: WORKER_URL, ADMIN_PASSWORD, FROM_ADDRESS.

const props = () => PropertiesService.getUserProperties();

function onHome() {
  return props().getProperty("WORKER_URL") ? composeCard({}) : settingsCard();
}

// Opened from the compose window: a second "Send" button that sends the open draft from the alias.
function onCompose() {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Send as alias"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(
        "Sends your current draft from <b>" + (props().getProperty("FROM_ADDRESS") || "not set") +
        "</b> and removes it from Drafts. Wait a few seconds after typing so Gmail can auto-save."))
      .addWidget(CardService.newTextButton().setText("Send via custom domain")
        .setOnClickAction(CardService.newAction().setFunctionName("sendDraft")))
      .addWidget(CardService.newTextButton().setText("Settings")
        .setOnClickAction(CardService.newAction().setFunctionName("openSettings"))))
    .build();
}

function sendDraft(e) {
  const draft = GmailApp.getDrafts().sort((x, y) => y.getMessage().getDate() - x.getMessage().getDate())[0];
  if (!draft) return notify("No draft found. Wait for Gmail to auto-save, then try again.");
  const m = draft.getMessage();
  const err = post({
    to: list(m.getTo()),
    cc: list(m.getCc()),
    bcc: list(m.getBcc()),
    subject: m.getSubject(),
    text: m.getPlainBody(),
    html: m.getBody(),
    attachments: m.getAttachments().map((a) => ({
      filename: a.getName(),
      content: Utilities.base64Encode(a.getBytes()),
    })),
  });
  if (err) return notify("Send failed: " + err);
  draft.deleteDraft();
  return notify("Sent from " + props().getProperty("FROM_ADDRESS"), true);
}

// Opened on a message: reply to the sender from the alias.
function onMessage(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const msg = GmailApp.getMessageById(e.gmail.messageId);
  const subject = msg.getSubject();
  return composeCard({
    to: msg.getReplyTo() || msg.getFrom(),
    subject: /^re:/i.test(subject) ? subject : "Re: " + subject,
  });
}

function composeCard(v) {
  const input = (name, title, value, multiline) =>
    CardService.newTextInput().setFieldName(name).setTitle(title).setValue(value || "").setMultiline(!!multiline);
  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText("From: <b>" + (props().getProperty("FROM_ADDRESS") || "not set") + "</b>"))
    .addWidget(input("to", "To", v.to))
    .addWidget(input("cc", "Cc", v.cc))
    .addWidget(input("subject", "Subject", v.subject))
    .addWidget(input("body", "Message", v.body, true))
    .addWidget(CardService.newTextButton().setText("Send").setOnClickAction(CardService.newAction().setFunctionName("send")));
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Send as alias"))
    .addSection(section)
    .addSection(CardService.newCardSection().addWidget(
      CardService.newTextButton().setText("Settings").setOnClickAction(CardService.newAction().setFunctionName("openSettings"))))
    .build();
}

function settingsCard() {
  const p = props();
  const input = (name, title, hint) =>
    CardService.newTextInput().setFieldName(name).setTitle(title).setHint(hint).setValue(p.getProperty(name) || "");
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Settings"))
    .addSection(CardService.newCardSection()
      .addWidget(input("WORKER_URL", "Worker URL", "https://gmail-cloudflare.you.workers.dev"))
      .addWidget(input("ADMIN_PASSWORD", "Admin password", "same as the dashboard"))
      .addWidget(input("FROM_ADDRESS", "From address", "Me <hello@yourdomain.com>"))
      .addWidget(CardService.newTextButton().setText("Save").setOnClickAction(CardService.newAction().setFunctionName("saveSettings"))))
    .build();
}

function openSettings() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(settingsCard())).build();
}

function saveSettings(e) {
  const f = e.formInput;
  props().setProperties({
    WORKER_URL: (f.WORKER_URL || "").trim().replace(/\/$/, ""),
    ADMIN_PASSWORD: (f.ADMIN_PASSWORD || "").trim(),
    FROM_ADDRESS: (f.FROM_ADDRESS || "").trim(),
  });
  return notify("Saved", true);
}

const list = (s) => (s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);

// Posts to the Worker. Returns an error string, or null on success.
function post(payload) {
  const p = props().getProperties();
  if (!p.WORKER_URL || !p.FROM_ADDRESS) return "Open Settings first.";
  if (!payload.to.length) return "Add a recipient.";
  const res = UrlFetchApp.fetch(p.WORKER_URL + "/api/send", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + p.ADMIN_PASSWORD },
    muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({ from: p.FROM_ADDRESS }, payload)),
  });
  if (res.getResponseCode() === 200) return null;
  try { return JSON.parse(res.getContentText()).error; } catch (x) { return "HTTP " + res.getResponseCode(); }
}

function send(e) {
  const f = e.formInput;
  const err = post({ to: list(f.to), cc: list(f.cc), subject: f.subject || "", text: f.body || "" });
  return err ? notify("Send failed: " + err) : notify("Sent from " + props().getProperty("FROM_ADDRESS"), true);
}

function notify(text, pop) {
  const r = CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text));
  if (pop) r.setNavigation(CardService.newNavigation().popToRoot());
  return r.build();
}
