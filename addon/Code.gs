// Gmail Add-on: send mail from your Cloudflare-routed domain address.
// Settings live in Script Properties: WORKER_URL, ADMIN_PASSWORD, FROM_ADDRESS.

const props = () => PropertiesService.getUserProperties();

function onHome() {
  return props().getProperty("WORKER_URL") ? composeCard({}) : settingsCard();
}

// Opened from the compose window: prefill recipients from the draft.
function onCompose(e) {
  const d = (e && e.draftMetadata) || {};
  return composeCard({ to: (d.toRecipients || []).join(", "), cc: (d.ccRecipients || []).join(", ") });
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

function send(e) {
  const f = e.formInput;
  const p = props().getProperties();
  if (!p.WORKER_URL || !p.FROM_ADDRESS) return notify("Open Settings first.");
  if (!list(f.to).length) return notify("Add a recipient.");
  const res = UrlFetchApp.fetch(p.WORKER_URL + "/api/send", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + p.ADMIN_PASSWORD },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      from: p.FROM_ADDRESS,
      to: list(f.to),
      cc: list(f.cc),
      subject: f.subject || "",
      text: f.body || "",
    }),
  });
  if (res.getResponseCode() !== 200) {
    let err = "HTTP " + res.getResponseCode();
    try { err = JSON.parse(res.getContentText()).error || err; } catch (x) {}
    return notify("Send failed: " + err);
  }
  return notify("Sent from " + p.FROM_ADDRESS, true);
}

function notify(text, pop) {
  const r = CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text));
  if (pop) r.setNavigation(CardService.newNavigation().popToRoot());
  return r.build();
}
