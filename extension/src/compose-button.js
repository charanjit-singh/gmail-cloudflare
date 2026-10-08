import { api, escapeHtml, identitiesFrom, loadSettings } from "./shared.js";
import { STYLES, CHEVRON, CHECK, avatarColor } from "./compose-styles.js";

const SEND_BUTTON = 'div[role="button"][data-tooltip^="Send"]';
const MORE_SEND_OPTIONS = '[aria-label^="More send options"], [data-tooltip^="More send options"]';
const BODY = 'div[aria-label="Message Body"], div[g_editable="true"]';
const DISCARD = '[aria-label^="Discard draft"], [data-tooltip^="Discard draft"]';
const ATTACHMENT_CHIP = ".aZo, .dL";
const EMAIL_PATTERN = /[^\s<>,;"]+@[^\s<>,;"]+/;
const SNACKBAR_MS = 6000;
const MARK = "data-alias-button";

// Gmail's tooltip is "Send" or "Send (⌘Enter)". Add-on icons such as "Send as alias" also start with "Send".
const isGmailSend = (element) => /^Send(\s*[(‪]|$)/.test(element.getAttribute("data-tooltip") || "");

let menu = null;

export function registerComposeButton() {
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  addButtons();
  new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("mousedown", (event) => menu && !menu.contains(event.target) && !event.target.closest(".saa-arrow") && closeMenu(), true);
  document.addEventListener("keydown", (event) => event.key === "Escape" && closeMenu(), true);
  chrome.storage.onChanged.addListener(refreshLabels);
  chrome.runtime.sendMessage({ type: "sync-accounts" });
}

async function currentAccount() {
  const settings = await loadSettings();
  const accounts = identitiesFrom(settings.addresses);
  return { accounts, current: accounts.find((account) => account.value === settings.lastFrom) || accounts[0] };
}

async function refreshLabels() {
  const { current } = await currentAccount();
  const name = current ? current.label.split(" · ")[0] : "your domain";
  document.querySelectorAll(".saa-name").forEach((label) => (label.textContent = name));
}

// Gmail's Send is a split button: Send plus a dropdown arrow. Climb until both are inside, so we land after the pair.
function sendControl(send, toolbar) {
  let control = send;
  while (!control.querySelector(MORE_SEND_OPTIONS) && control.parentElement && control.parentElement !== toolbar) {
    control = control.parentElement;
  }
  return control;
}

function addButtons() {
  [...document.querySelectorAll(SEND_BUTTON)].filter(isGmailSend).forEach((send) => {
    const toolbar = send.closest("td") || send.parentElement;
    if (!toolbar || toolbar.querySelector(`[${MARK}]`)) return;
    const split = document.createElement("div");
    split.className = "saa-split";
    split.setAttribute(MARK, "");
    split.innerHTML =
      '<div role="button" tabindex="0" class="saa-main" data-tooltip="Send from your domain address"><span>Send as</span><span class="saa-name">…</span></div>' +
      `<div role="button" tabindex="0" class="saa-arrow" aria-haspopup="menu" data-tooltip="Choose the address">${CHEVRON}</div>`;
    const root = composeRootOf(send);
    activate(split.querySelector(".saa-main"), () => sendWithCurrent(split, root));
    activate(split.querySelector(".saa-arrow"), () => (menu ? closeMenu() : openMenu(split, root)));
    sendControl(send, toolbar).after(split);
  });
  refreshLabels();
}

function activate(element, handler) {
  element.addEventListener("click", handler);
  element.addEventListener("keydown", (event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), handler()));
}

// The smallest ancestor of Send that also holds the message body: the pop-up window or the in-thread reply box.
function composeRootOf(send) {
  let root = send.parentElement;
  while (root && !root.querySelector(BODY)) root = root.parentElement;
  return root || document.body;
}

function closeMenu() {
  menu?.remove();
  menu = null;
}

const accountRow = (account, index, isCurrent) =>
  `<button class="saa-item" role="menuitem" data-index="${index}">` +
  `<span class="saa-avatar" style="background:${avatarColor(account.email)}">${escapeHtml(account.label[0].toUpperCase())}</span>` +
  `<span class="saa-text"><b>${escapeHtml(account.label.split(" · ")[0])}</b><span>${escapeHtml(account.email)}</span></span>` +
  `<span class="saa-check">${isCurrent ? CHECK : ""}</span></button>`;

async function openMenu(split, root) {
  chrome.runtime.sendMessage({ type: "sync-accounts" });
  const { accounts, current } = await currentAccount();
  if (!accounts.length) return chrome.runtime.sendMessage({ type: "open-options" });
  menu = document.createElement("div");
  menu.className = "saa-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML =
    '<div class="saa-menu-title">Send from</div>' +
    accounts.map((account, index) => accountRow(account, index, account === current)).join("") +
    '<div class="saa-divider"></div><button class="saa-item saa-link" data-action="archive">Sent mail</button>' +
    '<button class="saa-item saa-link" data-action="options">Manage addresses</button>';
  document.body.append(menu);
  placeMenu(split);
  menu.addEventListener("click", (event) => onMenuClick(event, split, root, accounts));
  menu.addEventListener("keydown", moveFocus);
  menu.querySelector(".saa-item").focus();
}

function placeMenu(split) {
  const rect = split.getBoundingClientRect();
  const height = menu.offsetHeight;
  const top = rect.top - height - 8 > 0 ? rect.top - height - 8 : rect.bottom + 8;
  menu.style.top = top + "px";
  menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + "px";
}

function moveFocus(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = [...menu.querySelectorAll(".saa-item")];
  const step = event.key === "ArrowDown" ? 1 : -1;
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
}

function onMenuClick(event, split, root, accounts) {
  const item = event.target.closest(".saa-item");
  if (!item) return;
  closeMenu();
  if (item.dataset.action === "archive") return chrome.runtime.sendMessage({ type: "open-archive" });
  if (item.dataset.action === "options") return chrome.runtime.sendMessage({ type: "open-options" });
  send(split, root, accounts[Number(item.dataset.index)]);
}

async function sendWithCurrent(split, root) {
  const { current } = await currentAccount();
  if (!current) return chrome.runtime.sendMessage({ type: "open-options" });
  send(split, root, current);
}

const firstEmail = (text) => (String(text || "").match(EMAIL_PATTERN) || [])[0];
const CHIP = "[data-hovercard-id], [email]";
const chipEmail = (chip) => firstEmail(chip.getAttribute("data-hovercard-id") || chip.getAttribute("email"));

// Gmail keeps recipients in hidden inputs (pop-up compose) or only as chips (in-thread replies), depending on the layout.
function emailsOf(root, name) {
  const fromInputs = [...root.querySelectorAll(`input[name="${name}"]`)].map((input) => firstEmail(input.value));
  const fromChips = [...root.querySelectorAll(`[name="${name}"] :is(${CHIP})`)].map(chipEmail);
  const found = [...fromInputs, ...fromChips].filter(Boolean);
  if (found.length || name !== "to") return [...new Set(found)];
  return [...new Set(recipientChipsOutsideCopies(root).map(chipEmail).filter(Boolean))];
}

function recipientChipsOutsideCopies(root) {
  return [...root.querySelectorAll(CHIP)].filter(
    (chip) => !chip.closest('[name="cc"], [name="bcc"]') && !chip.closest(BODY) && !chip.closest(".gmail_quote")
  );
}

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

function problemWith(draft) {
  if (!draft.to.length) return "Add at least one recipient.";
  if (draft.hasAttachments) return "Attachments can't be sent this way yet. Use the add-on's Send via custom domain.";
  if (!draft.text.trim()) return "Your message is empty.";
  return null;
}

function setBusy(split, busy) {
  split.setAttribute("aria-busy", String(busy));
  const main = split.querySelector(".saa-main");
  main.innerHTML = busy ? '<span class="saa-spinner"></span><span>Sending…</span>' : '<span>Send as</span><span class="saa-name"></span>';
  if (!busy) refreshLabels();
}

// In an open conversation Gmail tags the subject with the thread ID the Gmail API understands.
function threadIdOf(root) {
  if (root.closest('div[role="dialog"]')) return null;
  return document.querySelector("h2[data-legacy-thread-id], [data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id") || null;
}

async function send(split, root, account) {
  if (split.getAttribute("aria-busy") === "true") return;
  const draft = readDraft(root);
  const problem = problemWith(draft);
  if (problem) return snackbar(problem);
  setBusy(split, true);
  const threadId = threadIdOf(root);
  const context = (await chrome.runtime.sendMessage({ type: "thread-context", threadId })) || {};
  const { hasAttachments, ...message } = draft;
  const outgoing = { from: account.value, ...message, inReplyTo: context.inReplyTo, references: context.references };
  const result = await api("/send", "POST", { ...outgoing, copyToInbox: !context.canSaveToGmail });
  if (!result?.ok) {
    setBusy(split, false);
    return snackbar("Couldn't send: " + (result?.error || "no reply from the extension"));
  }
  await chrome.storage.local.set({ lastFrom: account.value });
  const copy = context.canSaveToGmail
    ? await chrome.runtime.sendMessage({ type: "save-sent-copy", mail: { ...outgoing, threadId, messageId: result.data.result?.message_id } })
    : { ok: true };
  root.querySelector(DISCARD)?.click();
  const sent = "Message sent from " + account.email;
  snackbar(copy?.ok ? sent : sent + ". Not saved to Gmail Sent: " + (copy?.error || "unknown reason"), "View", () =>
    chrome.runtime.sendMessage({ type: "open-archive" })
  );
}

function snackbar(text, actionLabel, onAction) {
  document.querySelector(".saa-snackbar")?.remove();
  const bar = document.createElement("div");
  bar.className = "saa-snackbar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span>${escapeHtml(text)}</span>` + (actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : "");
  if (actionLabel) bar.querySelector("button").addEventListener("click", () => (bar.remove(), onAction()));
  document.body.append(bar);
  setTimeout(() => bar.remove(), SNACKBAR_MS);
}
