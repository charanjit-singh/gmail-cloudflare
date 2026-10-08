import { api, escapeHtml } from "./shared.js";

const styles = `
.saa { max-width:960px; margin:0 auto; padding:24px 16px; font:14px/20px "Google Sans",Roboto,Arial,sans-serif; color:#1f1f1f }
.saa h2 { font-size:22px; font-weight:400; margin:0 0 16px }
.saa input { width:100%; box-sizing:border-box; height:48px; padding:0 20px; border:0; border-radius:24px; background:#eaf1fb; font:inherit; font-size:16px; outline:none; margin-bottom:12px }
.saa input:focus { background:#fff; box-shadow:0 1px 1px rgba(65,69,73,.3), 0 1px 3px 1px rgba(65,69,73,.15) }
.saa .rows { border-radius:16px; overflow:hidden; background:#fff }
.saa .row { display:block; width:100%; box-sizing:border-box; text-align:left; border:0; border-bottom:1px solid #f1f3f4; background:#fff; padding:12px 16px; cursor:pointer; font:inherit; color:inherit }
.saa .row:hover { box-shadow:inset 1px 0 0 #dadce0, inset -1px 0 0 #dadce0, 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15); position:relative; z-index:1 }
.saa .top { display:flex; justify-content:space-between; gap:12px }
.saa .subject { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.saa .mute { color:#5e5e5e; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.saa .button { height:36px; padding:0 24px; border:1px solid #747775; border-radius:18px; background:#fff; color:#0b57d0; cursor:pointer; font:500 14px "Google Sans",Roboto,Arial,sans-serif; margin-top:12px }
.saa .button:hover { background:#f0f4fb }
.saa iframe { width:100%; min-height:480px; border:0; border-radius:12px; background:#fff }
.saa pre { white-space:pre-wrap; word-break:break-word; margin:0; font:inherit }
.saa dl { display:grid; grid-template-columns:auto 1fr; gap:4px 16px; font-size:13px; margin:0 0 16px }
.saa dt { color:#5e5e5e } .saa dd { margin:0; word-break:break-word }
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

