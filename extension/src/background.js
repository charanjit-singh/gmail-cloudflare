import { saveSentCopy, threadContext } from "./gmail-copy.js";

async function callWorker({ path, method, body }) {
  const { workerUrl, password } = await chrome.storage.local.get({ workerUrl: "", password: "" });
  if (!workerUrl || !password) {
    return { ok: false, error: "Open the extension settings and enter your Worker URL and admin password." };
  }
  try {
    const response = await fetch(workerUrl.replace(/\/$/, "") + "/api" + path, {
      method,
      headers: { authorization: "Bearer " + password, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, data } : { ok: false, error: data.error || "HTTP " + response.status };
  } catch (error) {
    return { ok: false, error: "Could not reach the Worker: " + error.message };
  }
}

// Loads the accounts from the Worker and caches them. Uploads this extension's old list once if the Worker has none.
async function syncAccounts() {
  const remote = await callWorker({ path: "/accounts", method: "GET" });
  if (!remote.ok) return remote;
  const { addresses: local } = await chrome.storage.local.get({ addresses: "" });
  const localLines = local.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!remote.data.accounts.length && localLines.length) {
    return callWorker({ path: "/accounts", method: "PUT", body: { accounts: localLines } });
  }
  const shared = remote.data.accounts.map((account) => account.value).join("\n");
  if (shared !== local) await chrome.storage.local.set({ addresses: shared });
  return remote;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "api") {
    callWorker(message).then(sendResponse);
    return true;
  }
  if (message?.type === "sync-accounts") {
    syncAccounts().then(sendResponse);
    return true;
  }
  if (message?.type === "thread-context") {
    threadContext(message.threadId)
      .then((context) => sendResponse({ ok: true, ...context }))
      .catch((error) => sendResponse({ ok: false, canSaveToGmail: true, error: error.message }));
    return true;
  }
  if (message?.type === "save-sent-copy") {
    saveSentCopy(message.mail)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "open-options") chrome.runtime.openOptionsPage();
  if (message?.type === "open-archive") chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") });
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") }));
