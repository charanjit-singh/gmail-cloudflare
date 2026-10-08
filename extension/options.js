const keys = ["workerUrl", "password", "fromAddress"];
chrome.storage.sync.get(keys).then((v) => keys.forEach((k) => (document.getElementById(k).value = v[k] || "")));
document.getElementById("save").onclick = async () => {
  await chrome.storage.sync.set(Object.fromEntries(keys.map((k) => [k, document.getElementById(k).value.trim()])));
  document.getElementById("msg").textContent = "Saved";
};
