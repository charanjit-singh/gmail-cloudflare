import { api, escapeHtml, identitiesFrom, loadSettings } from "./shared.js";

const SEND_BUTTON = 'div[role="button"][data-tooltip^="Send"]';
const BODY = 'div[aria-label="Message Body"], div[g_editable="true"]';
const MORE_SEND_OPTIONS = '[aria-label^="More send options"], [data-tooltip^="More send options"]';
const DISCARD = '[aria-label^="Discard draft"], [data-tooltip^="Discard draft"]';
const ATTACHMENT_CHIP = ".aZo, .dL";
const EMAIL_PATTERN = /[^\s<>,;"]+@[^\s<>,;"]+/;
const CLOSE_DELAY_MS = 900;
const MARK = "data-alias-button";

const rowStyle =
  "display:block;width:100%;text-align:left;padding:8px 10px;margin:2px 0;border:0;border-radius:6px;background:#f1f3f4;cursor:pointer;font:inherit;color:#202124";

let popup = null;

export function registerComposeButton() {
  addButtons();
  new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (popup && !popup.contains(event.target) && !event.target.closest(`[${MARK}]`)) closePopup();
  });
}

function addButtons() {
  document.querySelectorAll(SEND_BUTTON).forEach((send) => {
    const toolbar = send.closest("td") || send.parentElement;
    if (!toolbar || toolbar.querySelector(`[${MARK}]`)) return;
    const button = document.createElement("div");
    button.setAttribute(MARK, "");
    button.setAttribute("role", "button");
    button.title = "Send from one of your domain addresses";
    button.textContent = "Send as alias";
    button.style.cssText =
      "display:inline-block;margin-left:8px;padding:0 14px;height:36px;line-height:36px;border-radius:18px;background:#e8f0fe;color:#1a73e8;font:500 14px system-ui,sans-serif;cursor:pointer;user-select:none;vertical-align:middle";
    button.addEventListener("click", () => openPicker(button, composeRootOf(send)));
    sendControl(send, toolbar).after(button);
  });
}

// Gmail's Send is a split button: Send plus a dropdown arrow. Climb until both are inside, so we land after the pair.
function sendControl(send, toolbar) {
  let control = send;
  while (!control.querySelector(MORE_SEND_OPTIONS) && control.parentElement && control.parentElement !== toolbar) {
    control = control.parentElement;
  }
  return control;
}

const composeRootOf = (send) => send.closest('div[role="dialog"]') || send.closest("form") || send.closest(".M9, .iN, .nH");

const emailsOf = (root, name) =>
  [...root.querySelectorAll(`input[name="${name}"]`)]
    .map((input) => (input.value.match(EMAIL_PATTERN) || [])[0])
    .filter(Boolean);

function readDraft(root) {
  const body = root.querySelector(BODY);
  return {
    to: emailsOf(root, "to"),
    cc: emailsOf(root, "cc"),
    bcc: emailsOf(root, "bcc"),
    subject: root.querySelector('input[name="subjectbox"]')?.value || "",
    text: body?.innerText || "",
    html: body?.innerHTML || "",
    hasAttachments: Boolean(root.querySelector(ATTACHMENT_CHIP)),
  };
}

function closePopup() {
  popup?.remove();
  popup = null;
}

function showPopup(anchor, html) {
  closePopup();
  popup = document.createElement("div");
  const rect = anchor.getBoundingClientRect();
  popup.style.cssText =
    `position:fixed;z-index:2147483647;left:${Math.max(8, rect.left)}px;top:${rect.bottom + 6}px;min-width:260px;max-width:340px;` +
    "padding:12px 16px;background:#fff;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.25);font:13px/1.5 system-ui,sans-serif;color:#202124";
  popup.innerHTML = html;
  document.body.append(popup);
  return popup;
}

const message = (anchor, title, detail) =>
  showPopup(anchor, `<div style="font-weight:600">${escapeHtml(title)}</div><div style="color:#5f6368">${escapeHtml(detail)}</div>`);

async function openPicker(anchor, root) {
  const settings = await loadSettings();
  const accounts = identitiesFrom(settings.addresses);
  if (!accounts.length) {
    const view = showPopup(
      anchor,
      `<div style="margin-bottom:8px">Add your From addresses in the extension settings first.</div><button data-open style="${rowStyle}">Open settings</button>`
    );
    return view.querySelector("[data-open]").addEventListener("click", () => chrome.runtime.sendMessage({ type: "open-options" }));
  }
  const ordered = accounts.slice().sort((a, b) => (b.value === settings.lastFrom) - (a.value === settings.lastFrom));
  const rows = ordered.map((account, index) => `<button data-index="${index}" style="${rowStyle}">${escapeHtml(account.label)}</button>`).join("");
  const view = showPopup(anchor, `<div style="font-weight:600;margin-bottom:6px">Send from which account?</div>${rows}`);
  view.addEventListener("click", (event) => {
    const row = event.target.closest("[data-index]");
    if (row) sendNow(anchor, root, ordered[Number(row.dataset.index)]);
  });
}

function problemWith(draft) {
  if (!draft.to.length) return "Add a recipient first.";
  if (draft.hasAttachments) return "This message has attachments. Use the add-on's Send via custom domain action for files, or remove them.";
  if (!draft.text.trim()) return "The message is empty.";
  return null;
}

async function sendNow(anchor, root, account) {
  const draft = readDraft(root);
  const problem = problemWith(draft);
  if (problem) return message(anchor, "Not sent", problem);
  message(anchor, "Sending...", account.label);
  const result = await api("/send", "POST", {
    from: account.value,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    text: draft.text,
    html: draft.html,
  });
  if (!result?.ok) return message(anchor, "Could not send", result?.error || "No reply from the extension.");
  await chrome.storage.local.set({ lastFrom: account.value });
  const note = result.data.stored ? "" : " Not saved to the archive: " + (result.data.storeError || "unknown reason");
  message(anchor, "Sent!", "From " + account.label + "." + note);
  setTimeout(() => {
    root.querySelector(DISCARD)?.click();
    closePopup();
  }, CLOSE_DELAY_MS);
}
