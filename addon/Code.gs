// Gmail Add-on: send mail from your Cloudflare-routed domain addresses.
// Settings live in User Properties: WORKER_URL, ADMIN_PASSWORD, FROM_ADDRESSES (one per line), LAST_FROM.

const props = () => PropertiesService.getUserProperties();
const list = (s) => (s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
const lines = (s) => (s || "").split("\n").map((x) => x.trim()).filter(Boolean);

// ---------- Settings and identities ----------

function identities() {
  const p = props().getProperties();
  return lines(p.FROM_ADDRESSES || p.FROM_ADDRESS).map((value) => {
    const match = value.match(/<([^>]+)>/);
    return { value, email: match ? match[1] : value };
  });
}

const domainOf = (email) => (email.split("@")[1] || "").toLowerCase();

// Domains the Worker's Cloudflare token can send from. Empty when the Worker is unreachable.
function cloudflareDomains() {
  const p = props().getProperties();
  if (!p.WORKER_URL || !p.ADMIN_PASSWORD) return [];
  try {
    const res = UrlFetchApp.fetch(p.WORKER_URL + "/api/zones", {
      headers: { Authorization: "Bearer " + p.ADMIN_PASSWORD },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return [];
    return JSON.parse(res.getContentText()).map((zone) => zone.name.toLowerCase());
  } catch (error) {
    console.error("Could not load domains: " + error);
    return [];
  }
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
  identities().forEach((identity) => dropdown.addItem(identity.value, identity.value, identity.value === chosen));
  return dropdown;
}

function header(title, subtitle) {
  const built = CardService.newCardHeader().setTitle(title);
  return subtitle ? built.setSubtitle(subtitle) : built;
}

function resultCard(title, detail, ok) {
  const row = CardService.newDecoratedText()
    .setText("<b>" + title + "</b>")
    .setBottomLabel(detail)
    .setWrapText(true)
    .setStartIcon(icon(ok ? "CONFIRMATION_NUMBER_ICON" : "DESCRIPTION"));
  return CardService.newCardBuilder().addSection(CardService.newCardSection().addWidget(row)).build();
}

// ---------- Entry points ----------

function onHome() {
  return props().getProperty("WORKER_URL") && identities().length ? composeCard({}) : settingsCard();
}

// Opened on a message: reply to the sender from one of your addresses.
function onMessage(e) {
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
  const error = post(from, { to: list(form.to), cc: list(form.cc), subject: form.subject || "", text: form.body || "" });
  return error ? notify("Send failed: " + error) : notify("Sent from " + from, true);
}

// ---------- Compose window ----------

// Compose-window action (see composeTrigger in appsscript.json): sends the open draft from a chosen address.
function sendDraft() {
  if (!identities().length) return resultCard("Set up your addresses", "Open the add-on and save at least one From address in Settings.", false);
  const draft = GmailApp.getDrafts().sort((x, y) => y.getMessage().getDate() - x.getMessage().getDate())[0];
  if (!draft) return resultCard("No draft found", "Wait a few seconds for Gmail to auto-save, then try again.", false);
  if (identities().length === 1) return deliverDraft(draft, chosenFrom({}));
  return draftChooserCard(draft);
}

function draftChooserCard(draft) {
  const message = draft.getMessage();
  const summary = CardService.newCardSection()
    .addWidget(CardService.newDecoratedText().setTopLabel("To").setText(message.getTo() || "No recipient").setStartIcon(icon("EMAIL")).setWrapText(true))
    .addWidget(CardService.newDecoratedText().setTopLabel("Subject").setText(message.getSubject() || "No subject").setStartIcon(icon("DESCRIPTION")).setWrapText(true));
  const chooser = CardService.newCardSection().addWidget(fromDropdown());
  const footer = CardService.newFixedFooter().setPrimaryButton(
    filledButton("Send", action("sendDraftFrom", { draftId: draft.getId() }))
  );
  return CardService.newCardBuilder()
    .setHeader(header("Send this message", "Choose the address to send from"))
    .addSection(summary)
    .addSection(chooser)
    .setFixedFooter(footer)
    .build();
}

function sendDraftFrom(e) {
  const draft = GmailApp.getDraft(e.parameters.draftId);
  return showCard(deliverDraft(draft, chosenFrom(e.formInput)));
}

// Sends the draft and returns the card to show.
function deliverDraft(draft, from) {
  const message = draft.getMessage();
  const error = post(from, {
    to: list(message.getTo()),
    cc: list(message.getCc()),
    bcc: list(message.getBcc()),
    subject: message.getSubject(),
    text: message.getPlainBody(),
    html: message.getBody(),
    attachments: message.getAttachments().map((file) => ({
      filename: file.getName(),
      content: Utilities.base64Encode(file.getBytes()),
    })),
  });
  if (error) return resultCard("Could not send", error, false);
  draft.deleteDraft();
  return resultCard("Sent", "From " + from + "\nTo " + (message.getTo() || "recipient"), true);
}

// ---------- Settings ----------

function openSettings() {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(settingsCard())).build();
}

function settingsCard() {
  const p = props();
  const domains = cloudflareDomains();
  const connection = CardService.newCardSection()
    .setHeader("Connection")
    .addWidget(textInput("WORKER_URL", "Worker URL", p.getProperty("WORKER_URL")))
    .addWidget(textInput("ADMIN_PASSWORD", "Admin password", p.getProperty("ADMIN_PASSWORD")));
  const addresses = CardService.newCardSection().setHeader("Sending addresses");
  if (domains.length) {
    addresses.addWidget(
      CardService.newDecoratedText().setTopLabel("Domains you can send from").setText(domains.join(", ")).setStartIcon(icon("EMAIL")).setWrapText(true)
    );
  }
  addresses
    .addWidget(textInput("FROM_ADDRESSES", "From addresses, one per line", p.getProperty("FROM_ADDRESSES") || p.getProperty("FROM_ADDRESS"), true))
    .addWidget(note("Example: BN Habitat <hello@bnhabitat.com>"));
  const footer = CardService.newFixedFooter().setPrimaryButton(filledButton("Save", action("saveSettings")));
  return CardService.newCardBuilder()
    .setHeader(header("Settings"))
    .addSection(connection)
    .addSection(addresses)
    .setFixedFooter(footer)
    .build();
}

function saveSettings(e) {
  const form = e.formInput;
  props().setProperties({
    WORKER_URL: (form.WORKER_URL || "").trim().replace(/\/$/, ""),
    ADMIN_PASSWORD: (form.ADMIN_PASSWORD || "").trim(),
  });
  const addresses = lines(form.FROM_ADDRESSES);
  const domains = cloudflareDomains();
  const unknown = addresses.map((line) => domainOf((line.match(/<([^>]+)>/) || [, line])[1])).filter((domain) => domains.length && !domains.includes(domain));
  if (unknown.length) return notify("Not on your Cloudflare account: " + unknown.join(", ") + ". Add the domain there first.");
  props().setProperty("FROM_ADDRESSES", addresses.join("\n"));
  props().deleteProperty("FROM_ADDRESS");
  return notify("Saved", true);
}

// ---------- Worker ----------

// Posts to the Worker. Returns an error string, or null on success.
function post(from, payload) {
  const p = props().getProperties();
  if (!p.WORKER_URL || !from) return "Open Settings first.";
  if (!payload.to.length) return "Add a recipient.";
  const response = UrlFetchApp.fetch(p.WORKER_URL + "/api/send", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + p.ADMIN_PASSWORD },
    muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({ from }, payload)),
  });
  if (response.getResponseCode() === 200) return null;
  try {
    return JSON.parse(response.getContentText()).error;
  } catch (error) {
    return "HTTP " + response.getResponseCode();
  }
}
