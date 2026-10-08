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

// Pulls the shared address list. If the Worker has none yet, uploads this extension's list once.
async function syncAddresses() {
  const remote = await callWorker({ path: "/addresses", method: "GET" });
  if (!remote.ok) return remote;
  const { addresses: local } = await chrome.storage.local.get({ addresses: "" });
  if (remote.data.addresses.length) {
    const shared = remote.data.addresses.join("\n");
    if (shared !== local) await chrome.storage.local.set({ addresses: shared });
    return { ok: true };
  }
  const lines = local.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length ? callWorker({ path: "/addresses", method: "PUT", body: { addresses: lines } }) : { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "api") {
    callWorker(message).then(sendResponse);
    return true;
  }
  if (message?.type === "sync-addresses") {
    syncAddresses().then(sendResponse);
    return true;
  }
  if (message?.type === "open-options") chrome.runtime.openOptionsPage();
  if (message?.type === "open-archive") chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") });
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") }));
