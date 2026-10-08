const $ = (id) => document.getElementById(id);
let zones = [], catchAll = null, config = {}, verified = [];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const zone = () => zones.find((z) => z.id === $("zone").value);

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";
  setTimeout(() => ($("toast").style.display = "none"), 3500);
}

async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    headers: { authorization: "Bearer " + localStorage.pw, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

function showLogin() {
  $("login").hidden = false;
  $("app").hidden = true;
}

async function init() {
  if (!localStorage.pw) return showLogin();
  config = await api("/config");
  $("login").hidden = true;
  $("app").hidden = false;
  $("dest").placeholder = config.defaultDestination || "abcd@gmail.com";
  zones = await api("/zones");
  $("zone").innerHTML = zones.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join("");
  await loadDestinations();
  await loadZone();
  if (config.canStoreMail) await showMailCard();
}

async function loadDestinations() {
  const list = await api("/destinations?account=" + zone().accountId);
  $("destList").innerHTML = list.map((d) =>
    `<div class="row between"><span>${esc(d.email)} ` +
    `<span class="pill ${d.verified ? "ok" : "bad"}">${d.verified ? "verified" : "pending verification"}</span></span>` +
    `<button class="ghost" data-deldest="${d.tag}">Remove</button></div>`
  ).join("") || '<div class="mute">No inboxes yet.</div>';
  verified = list.filter((d) => d.verified).map((d) => d.email);
  const opts = verified.map((e) => `<option>${esc(e)}</option>`).join("") || "<option value=''>no verified inbox</option>";
  $("aliasDest").innerHTML = opts;
  $("catchDest").innerHTML = opts;
}

async function loadZone() {
  const z = zone();
  if (!z) return;
  $("atDomain").textContent = "@" + z.name;
  const s = await api(`/zones/${z.id}/status`);
  $("status").innerHTML = s.enabled
    ? '<span class="ok">Email Routing is enabled.</span>'
    : '<span class="bad">Email Routing is not enabled for this domain.</span>';
  $("enable").hidden = !!s.enabled;
  $("zoneArea").hidden = !s.enabled;
  if (!s.enabled) return;
  catchAll = await api(`/zones/${z.id}/catch-all`);
  const dest = catchAll.actions?.[0]?.value?.[0];
  if (dest && verified.includes(dest)) $("catchDest").value = dest;
  $("catchState").innerHTML = catchAll.enabled && catchAll.actions?.[0]?.type === "forward"
    ? `<span class="ok">On</span> - everything@${esc(z.name)} goes to ${esc(dest)}`
    : '<span class="mute">Off</span>';
  await loadRules();
}

async function loadRules() {
  const rules = (await api(`/zones/${zone().id}/rules`)).filter((r) => r.matchers?.[0]?.type === "literal");
  $("rules").innerHTML = rules.map((r) =>
    `<div class="row between"><span>${esc(r.matchers[0].value)} <span class="mute">to ${esc(r.actions[0].value[0])}</span></span>` +
    `<button class="ghost" data-del="${r.tag}">Delete</button></div>`
  ).join("") || '<div class="mute">No aliases yet.</div>';
}

$("loginBtn").onclick = run(async () => { localStorage.pw = $("pw").value; await init(); });
$("zone").onchange = run(async () => { await loadDestinations(); await loadZone(); });
$("addDest").onclick = run(async () => {
  await api("/destinations", "POST", { account: zone().accountId, email: $("dest").value || config.defaultDestination });
  $("dest").value = "";
  toast("Verification email sent. Check your inbox.");
  await loadDestinations();
});
$("enable").onclick = run(async () => { await api(`/zones/${zone().id}/enable`, "POST"); await loadZone(); });
$("toggleCatch").onclick = run(async () => {
  const on = catchAll.enabled && catchAll.actions?.[0]?.type === "forward";
  await api(`/zones/${zone().id}/catch-all`, "PUT", { enabled: !on, destination: $("catchDest").value });
  await loadZone();
});
$("addAlias").onclick = run(async () => {
  const local = $("alias").value.trim();
  if (!local) return;
  await api(`/zones/${zone().id}/rules`, "POST", { alias: `${local}@${zone().name}`, destination: $("aliasDest").value });
  $("alias").value = "";
  await loadRules();
});
$("destList").onclick = run(async (e) => {
  const id = e.target.dataset?.deldest;
  if (!id || !confirm("Remove this inbox? Rules using it will stop forwarding.")) return;
  await api(`/destinations?account=${zone().accountId}&id=${id}`, "DELETE");
  await loadDestinations();
});
$("rules").onclick = run(async (e) => {
  const id = e.target.dataset?.del;
  if (!id) return;
  await api(`/zones/${zone().id}/rules/${id}`, "DELETE");
  await loadRules();
});

init().catch((e) => { if (e.message !== "Unauthorized") toast(e.message); });

// ---------- Sent mail ----------

let mailNext = null;

const when = (ms) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const recipients = (list) => (list.length ? list.join(", ") : "no recipient");

async function showMailCard() {
  $("mailCard").hidden = false;
  await loadMail(true);
}

async function loadMail(reset) {
  if (reset) mailNext = null;
  const query = new URLSearchParams({ direction: "sent" });
  if ($("mailSearch").value.trim()) query.set("q", $("mailSearch").value.trim());
  if (!reset && mailNext) query.set("before", mailNext);
  const page = await api("/mail?" + query);
  const rows = page.items.map((mail) =>
    `<button class="mail-row" data-mail="${esc(mail.id)}"><div class="top"><span class="subject">${esc(mail.subject || "(no subject)")}</span>` +
    `<span class="when">${esc(when(mail.created_at))}</span></div>` +
    `<div class="mute">${esc(mail.from_address)} to ${esc(recipients(mail.to_addresses))}</div>` +
    `<div class="mute">${esc(mail.preview || "")}</div></button>`
  ).join("");
  $("mailRows").innerHTML = reset ? rows || '<div class="mute">No sent mail yet.</div>' : $("mailRows").innerHTML + rows;
  mailNext = page.next;
  $("mailMore").hidden = !mailNext;
}

async function openMail(id) {
  const mail = await api("/mail/" + id);
  const files = mail.attachments.map((file) => `${esc(file.filename)} (${Math.max(1, Math.round(file.size / 1024))} KB)`).join(", ");
  const body = mail.html_body
    ? '<iframe class="mail-frame" sandbox="" referrerpolicy="no-referrer"></iframe>'
    : `<pre class="mail-text">${esc(mail.text_body || "")}</pre>`;
  $("mailView").innerHTML =
    `<div class="row"><button id="mailBack">Back to list</button></div><h3>${esc(mail.subject || "(no subject)")}</h3>` +
    `<dl><dt>From</dt><dd>${esc(mail.from_address)}</dd><dt>To</dt><dd>${esc(recipients(mail.to_addresses))}</dd>` +
    (mail.cc_addresses.length ? `<dt>Cc</dt><dd>${esc(mail.cc_addresses.join(", "))}</dd>` : "") +
    (mail.bcc_addresses.length ? `<dt>Bcc</dt><dd>${esc(mail.bcc_addresses.join(", "))}</dd>` : "") +
    `<dt>Sent</dt><dd>${esc(when(mail.created_at))}</dd>` + (files ? `<dt>Files</dt><dd>${files}</dd>` : "") + `</dl>` + body;
  if (mail.html_body) $("mailView").querySelector("iframe").srcdoc = mail.html_body;
  $("mailList").hidden = true;
  $("mailView").hidden = false;
}

$("mailRows").addEventListener("click", run((event) => {
  const row = event.target.closest("[data-mail]");
  return row && openMail(row.dataset.mail);
}));
$("mailView").addEventListener("click", (event) => {
  if (!event.target.closest("#mailBack")) return;
  $("mailView").hidden = true;
  $("mailList").hidden = false;
});
$("mailSearchBtn").addEventListener("click", run(() => loadMail(true)));
$("mailSearch").addEventListener("keydown", run((event) => event.key === "Enter" && loadMail(true)));
$("mailMore").addEventListener("click", run(() => loadMail(false)));
