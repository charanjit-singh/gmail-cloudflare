// Content scripts cannot call the dashboard cross-origin, so they message this worker.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== "send") return;
  (async () => {
    const { workerUrl, password } = await chrome.storage.sync.get(["workerUrl", "password"]);
    if (!workerUrl || !password) throw new Error("Open the extension options and set the Worker URL and password.");
    const res = await fetch(workerUrl.replace(/\/$/, "") + "/api/send", {
      method: "POST",
      headers: { authorization: "Bearer " + password, "content-type": "application/json" },
      body: JSON.stringify(msg.payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Send failed (" + res.status + ")");
    return data;
  })().then((d) => reply({ ok: true, data: d }), (e) => reply({ ok: false, error: e.message }));
  return true;
});
