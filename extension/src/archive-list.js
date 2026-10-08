import { api, escapeHtml } from "./shared.js";

const styles = `
.saa { max-width:860px; margin:0 auto; padding:16px; font:14px/1.5 system-ui,sans-serif; color:#202124 }
.saa h2 { font-size:20px; margin:0 0 12px }
.saa input { padding:8px 10px; border:1px solid #dadce0; border-radius:8px; font:inherit; width:100% }
.saa .row { display:block; width:100%; text-align:left; border:0; border-top:1px solid #e8eaed; background:transparent; padding:10px 4px; cursor:pointer; font:inherit; color:inherit }
.saa .row:hover { background:#f6f8fc }
.saa .top { display:flex; justify-content:space-between; gap:8px }
.saa .subject { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.saa .mute { color:#5f6368; font-size:12px }
.saa .button { padding:6px 12px; border:0; border-radius:16px; background:#e8f0fe; color:#1a73e8; cursor:pointer; font:inherit }
.saa iframe { width:100%; min-height:420px; border:1px solid #dadce0; border-radius:8px; background:#fff }
.saa pre { white-space:pre-wrap; word-break:break-word; margin:0; font:inherit }
.saa dl { display:grid; grid-template-columns:auto 1fr; gap:2px 12px; font-size:13px }
.saa dt { color:#5f6368 } .saa dd { margin:0; word-break:break-word }
`;

const when = (ms) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const recipients = (list) => (list.length ? list.join(", ") : "no recipient");

function shell(container, body) {
  container.innerHTML = `<style>${styles}</style><div class="saa">${body}</div>`;
  return container.querySelector(".saa");
}

export async function showList(container, query = "", before = null, appendTo = null) {
  const params = new URLSearchParams({ direction: "sent" });
  if (query) params.set("q", query);
  if (before) params.set("before", before);
  const result = await api("/mail?" + params);
  if (!result?.ok) return shell(container, `<h2>Sent as alias</h2><p>${escapeHtml(result?.error || "No reply from the extension.")}</p>`);
  const { items, next } = result.data;
  const rows = items.map((mail) => rowHtml(mail)).join("");
  if (appendTo) return appendTo.insertAdjacentHTML("beforeend", rows), updateMore(container, appendTo, next, query);
  const view = shell(
    container,
    `<h2>Sent as alias</h2><input class="search" type="search" placeholder="Search subject, sender or recipient" value="${escapeHtml(query)}">` +
      `<div class="rows">${rows || '<p class="mute">Nothing sent yet.</p>'}</div><div class="more"></div>`
  );
  const list = view.querySelector(".rows");
  view.querySelector(".search").addEventListener("keydown", (event) => event.key === "Enter" && showList(container, event.target.value.trim()));
  list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (row) showMail(container, row.dataset.id, query);
  });
  updateMore(container, list, next, query);
}

function updateMore(container, list, next, query) {
  const slot = container.querySelector(".more");
  slot.innerHTML = next ? '<button class="button">Load more</button>' : "";
  if (next) slot.firstElementChild.addEventListener("click", () => showList(container, query, next, list));
}

const rowHtml = (mail) =>
  `<button class="row" data-id="${escapeHtml(mail.id)}"><div class="top"><span class="subject">${escapeHtml(mail.subject || "(no subject)")}</span>` +
  `<span class="mute">${escapeHtml(when(mail.created_at))}</span></div>` +
  `<div class="mute">${escapeHtml(mail.from_address)} to ${escapeHtml(recipients(mail.to_addresses))}</div>` +
  `<div class="mute">${escapeHtml(mail.preview || "")}</div></button>`;

async function showMail(container, id, query) {
  const result = await api("/mail/" + id);
  if (!result?.ok) return shell(container, `<p>${escapeHtml(result?.error || "Could not open this message.")}</p>`);
  const mail = result.data;
  const files = mail.attachments.map((file) => `${escapeHtml(file.filename)} (${Math.max(1, Math.round(file.size / 1024))} KB)`).join(", ");
  const body = mail.html_body ? '<iframe sandbox="" referrerpolicy="no-referrer"></iframe>' : `<pre>${escapeHtml(mail.text_body || "")}</pre>`;
  const view = shell(
    container,
    `<p><button class="button back">Back to list</button></p><h2>${escapeHtml(mail.subject || "(no subject)")}</h2>` +
      `<dl><dt>From</dt><dd>${escapeHtml(mail.from_address)}</dd><dt>To</dt><dd>${escapeHtml(recipients(mail.to_addresses))}</dd>` +
      (mail.cc_addresses.length ? `<dt>Cc</dt><dd>${escapeHtml(mail.cc_addresses.join(", "))}</dd>` : "") +
      `<dt>Sent</dt><dd>${escapeHtml(when(mail.created_at))}</dd>${files ? `<dt>Files</dt><dd>${files}</dd>` : ""}</dl>${body}`
  );
  if (mail.html_body) view.querySelector("iframe").srcdoc = mail.html_body;
  view.querySelector(".back").addEventListener("click", () => showList(container, query));
}

