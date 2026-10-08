import { api, identitiesFrom, loadSettings } from "./shared.js";

const $ = (id) => document.getElementById(id);
const fields = ["workerUrl", "password", "addresses", "appId"];

const say = (text) => ($("status").textContent = text);

async function init() {
  const settings = await loadSettings();
  fields.forEach((field) => ($(field).value = settings[field]));
}

async function save() {
  const values = Object.fromEntries(fields.map((field) => [field, $(field).value.trim()]));
  const lines = values.addresses.split("\n").filter((line) => line.trim());
  if (identitiesFrom(values.addresses).length !== lines.length) {
    return say("Each From address line needs an email address, like BN Habitat · hello@bnhabitat.com");
  }
  await chrome.storage.local.set({ ...values, workerUrl: values.workerUrl.replace(/\/$/, "") });
  say("Saved. Reload Gmail to apply a new InboxSDK app ID.");
}

async function testConnection() {
  await save();
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
