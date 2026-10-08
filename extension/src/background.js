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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "api") {
    callWorker(message).then(sendResponse);
    return true;
  }
  if (message?.type === "open-options") chrome.runtime.openOptionsPage();
  if (message?.type === "open-archive") chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") });
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") }));
