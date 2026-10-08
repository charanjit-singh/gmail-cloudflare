import { escapeHtml, loadSettings } from "./shared.js";
import { avatarColor } from "./compose-styles.js";

const $ = (id) => document.getElementById(id);
const say = (text) => ($("status").textContent = text);

function showAccounts(accounts, workerUrl) {
  $("manage").hidden = !workerUrl;
  $("manage").href = workerUrl || "#";
  $("accounts").innerHTML = accounts.length
    ? "<h2>Sending accounts</h2>" +
      accounts
        .map(
          (account) =>
            `<div class="account"><span class="avatar" style="background:${avatarColor(account.email)}">${escapeHtml((account.name || account.email)[0].toUpperCase())}</span>` +
            `<span>${escapeHtml(account.name || account.email)}<small>${escapeHtml(account.email)}</small></span></div>`
        )
        .join("")
    : "";
}

async function connect() {
  say("Connecting…");
  const result = await chrome.runtime.sendMessage({ type: "sync-accounts" });
  const { workerUrl } = await loadSettings();
  if (!result?.ok) {
    showAccounts([], workerUrl);
    return say(result?.error || "No reply from the extension.");
  }
  const accounts = result.data.accounts;
  say(accounts.length ? `Connected. ${accounts.length} account${accounts.length === 1 ? "" : "s"} loaded.` : "Connected. Add your accounts on the Worker dashboard.");
  showAccounts(accounts, workerUrl);
}

$("save").addEventListener("click", async () => {
  const workerUrl = $("workerUrl").value.trim().replace(/\/$/, "");
  const password = $("password").value.trim();
  if (!workerUrl || !password) return say("Enter the Worker URL and the admin password.");
  await chrome.storage.local.set({ workerUrl, password });
  connect();
});

loadSettings().then((settings) => {
  $("workerUrl").value = settings.workerUrl;
  $("password").value = settings.password;
  if (settings.workerUrl && settings.password) connect();
});
