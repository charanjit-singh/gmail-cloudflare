import { api, escapeHtml, identitiesFrom, loadSettings } from "./shared.js";

const ATTACHMENT_CHIP_SELECTOR = ".aZo, .dL";
const CLOSE_DELAY_MS = 900;

const emails = (contacts) => contacts.map((contact) => contact.emailAddress);

export function registerComposeButton(sdk) {
  sdk.Compose.registerComposeViewHandler((composeView) => {
    composeView.addButton({
      title: "Send as alias",
      iconUrl: chrome.runtime.getURL("icon.png"),
      hasDropdown: true,
      type: "MODIFIER",
      onClick: (event) => showAccountPicker(event.dropdown.el, event.composeView),
    });
  });
}

function panel(container, html) {
  container.innerHTML = `<div style="padding:12px 16px;min-width:260px;max-width:340px;font:13px/1.5 system-ui,sans-serif;color:#202124">${html}</div>`;
  return container.firstElementChild;
}

async function showAccountPicker(container, composeView) {
  const settings = await loadSettings();
  const accounts = identitiesFrom(settings.addresses);
  if (!accounts.length) return showSetupNeeded(container);
  const ordered = accounts.slice().sort((a, b) => (b.value === settings.lastFrom) - (a.value === settings.lastFrom));
  const rows = ordered
    .map((account, index) => `<button data-index="${index}" style="${rowStyle}">${escapeHtml(account.label)}</button>`)
    .join("");
  const view = panel(container, `<div style="font-weight:600;margin-bottom:6px">Send from which account?</div>${rows}`);
  view.addEventListener("click", (event) => {
    const row = event.target.closest("[data-index]");
    if (row) sendNow(container, composeView, ordered[Number(row.dataset.index)]);
  });
}

const rowStyle =
  "display:block;width:100%;text-align:left;padding:8px 10px;margin:2px 0;border:0;border-radius:6px;background:#f1f3f4;cursor:pointer;font:inherit";

function showSetupNeeded(container) {
  const view = panel(
    container,
    `<div style="margin-bottom:8px">Add your From addresses in the extension settings first.</div><button data-open style="${rowStyle}">Open settings</button>`
  );
  view.querySelector("[data-open]").addEventListener("click", () => chrome.runtime.sendMessage({ type: "open-options" }));
}

function showMessage(container, title, detail) {
  panel(container, `<div style="font-weight:600">${escapeHtml(title)}</div><div style="color:#5f6368">${escapeHtml(detail)}</div>`);
}

function problemBeforeSending(composeView) {
  if (!composeView.getToRecipients().length) return "Add a recipient first.";
  if (composeView.getElement().querySelector(ATTACHMENT_CHIP_SELECTOR)) {
    return "This message has attachments. Use the add-on's Send via custom domain action for files, or remove them.";
  }
  return null;
}

async function sendNow(container, composeView, account) {
  const problem = problemBeforeSending(composeView);
  if (problem) return showMessage(container, "Not sent", problem);
  showMessage(container, "Sending...", account.label);
  const result = await api("/send", "POST", {
    from: account.value,
    to: emails(composeView.getToRecipients()),
    cc: emails(composeView.getCcRecipients()),
    bcc: emails(composeView.getBccRecipients()),
    subject: composeView.getSubject(),
    text: composeView.getTextContent(),
    html: composeView.getHTMLContent(),
  });
  if (!result?.ok) return showMessage(container, "Could not send", result?.error || "No reply from the extension.");
  await chrome.storage.local.set({ lastFrom: account.value });
  const archiveNote = result.data.stored ? "" : " Not saved to the archive: " + (result.data.storeError || "unknown reason");
  showMessage(container, "Sent!", "From " + account.label + "." + archiveNote);
  setTimeout(() => composeView.discard(), CLOSE_DELAY_MS);
}
