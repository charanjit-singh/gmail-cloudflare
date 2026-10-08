const $ = (id) => document.getElementById(id);
let zones = [], catchAll = null, config = {};

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
  $("dest").value = config.defaultDestination || "";
  zones = await api("/zones");
  $("zone").innerHTML = zones.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join("");
  await loadDestinations();
  await loadZone();
}

async function loadDestinations() {
  const list = await api("/destinations?account=" + zone().accountId);
  $("destList").innerHTML = list.map((d) =>
    `<div class="row"><span>${esc(d.email)}</span>` +
    `<span class="pill ${d.verified ? "ok" : "bad"}">${d.verified ? "verified" : "pending verification"}</span></div>`
  ).join("") || '<div class="mute">No destination addresses yet.</div>';
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
  await api("/destinations", "POST", { account: zone().accountId, email: $("dest").value });
  toast("Verification email sent. Check your inbox.");
  await loadDestinations();
});
$("enable").onclick = run(async () => { await api(`/zones/${zone().id}/enable`, "POST"); await loadZone(); });
$("toggleCatch").onclick = run(async () => {
  const on = catchAll.enabled && catchAll.actions?.[0]?.type === "forward";
  await api(`/zones/${zone().id}/catch-all`, "PUT", { enabled: !on, destination: $("dest").value });
  await loadZone();
});
$("addAlias").onclick = run(async () => {
  const local = $("alias").value.trim();
  if (!local) return;
  await api(`/zones/${zone().id}/rules`, "POST", { alias: `${local}@${zone().name}`, destination: $("dest").value });
  $("alias").value = "";
  await loadRules();
});
$("rules").onclick = run(async (e) => {
  const id = e.target.dataset?.del;
  if (!id) return;
  await api(`/zones/${zone().id}/rules/${id}`, "DELETE");
  await loadRules();
});

init().catch((e) => { if (e.message !== "Unauthorized") toast(e.message); });
