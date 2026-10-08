// Adds a "Send as alias" button next to Gmail's Send button in every compose window.
// Gmail's DOM is obfuscated and changes; selectors below are best effort.
const SEND_SEL = 'div[role="button"][data-tooltip^="Send"]';

function recipients(form, field) {
  const chips = [...form.querySelectorAll(`div[name="${field}"] [email], [name="${field}"] [email]`)]
    .map((n) => n.getAttribute("email"));
  const typed = form.querySelector(`input[name="${field}"], textarea[name="${field}"]`)?.value;
  return [...new Set([...chips, ...(typed ? typed.split(/[,;]/) : [])].map((s) => s.trim()).filter(Boolean))];
}

function toast(msg) {
  const t = Object.assign(document.createElement("div"), { textContent: msg });
  Object.assign(t.style, { position: "fixed", bottom: "24px", left: "24px", background: "#222", color: "#fff", padding: "10px 16px", borderRadius: "8px", zIndex: 99999, font: "14px Roboto, Arial" });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function handle(btn) {
  const root = btn.closest("[role='dialog']") || btn.closest("form") || document;
  const { fromAddress } = await chrome.storage.sync.get("fromAddress");
  if (!fromAddress) return toast("Set your From address in the extension options first.");

  const to = recipients(root, "to");
  if (!to.length) return toast("Add at least one recipient.");
  const body = root.querySelector('div[aria-label="Message Body"][contenteditable="true"]');
  const payload = {
    from: fromAddress,
    to,
    cc: recipients(root, "cc"),
    bcc: recipients(root, "bcc"),
    subject: root.querySelector('input[name="subjectbox"]')?.value || "",
    text: body?.innerText || "",
    html: body?.innerHTML || "",
  };

  btn.disabled = true;
  const res = await chrome.runtime.sendMessage({ type: "send", payload });
  btn.disabled = false;
  if (!res?.ok) return toast("Send failed: " + (res?.error || "unknown error"));
  toast("Sent from " + fromAddress);
  root.querySelector('[aria-label^="Discard draft"]')?.click();
}

function inject() {
  document.querySelectorAll(SEND_SEL).forEach((send) => {
    if (send.parentElement.querySelector(".gca-btn")) return;
    const btn = Object.assign(document.createElement("button"), { className: "gca-btn", textContent: "Send as alias", type: "button" });
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); handle(btn); });
    send.parentElement.appendChild(btn);
  });
}

new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
inject();
