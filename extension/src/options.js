import { api, identitiesFrom, loadSettings } from "./shared.js";

const $ = (id) => document.getElementById(id);
const fields = ["workerUrl", "password", "addresses"];

const say = (text) => ($("status").textContent = text);

async function init() {
  await chrome.runtime.sendMessage({ type: "sync-addresses" });
  const settings = await loadSettings();
  fields.forEach((field) => ($(field).value = settings[field]));
}

async function save() {
  const values = Object.fromEntries(fields.map((field) => [field, $(field).value.trim()]));
  const lines = values.addresses.split("\n").map((line) => line.trim()).filter(Boolean);
  if (identitiesFrom(values.addresses).length !== lines.length) {
    say("Each From address line needs an email address, like BN Habitat · hello@bnhabitat.com");
    return false;
  }
  await chrome.storage.local.set({ workerUrl: values.workerUrl.replace(/\/$/, ""), password: values.password });
  const saved = await api("/addresses", "PUT", { addresses: lines });
  if (!saved?.ok) {
    say("Not saved: " + (saved?.error || "no reply"));
    return false;
  }
  await chrome.storage.local.set({ addresses: saved.data.addresses.join("\n") });
  $("addresses").value = saved.data.addresses.join("\n");
  say("Saved. The Gmail add-on picks this up too.");
  return true;
}

async function testConnection() {
  if (!(await save())) return;
  const zones = await api("/zones");
  if (!zones?.ok) return say("Could not connect: " + (zones?.error || "no reply"));
  const domains = zones.data.map((zone) => zone.name);
  const unknown = identitiesFrom($("addresses").value)
    .map((identity) => identity.email.split("@")[1].toLowerCase())
    .filter((domain) => !domains.includes(domain));
  say(unknown.length ? "Connected, but not on your Cloudflare account: " + unknown.join(", ") : "Connected. Domains: " + domains.join(", "));
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", testConnection);
init();
