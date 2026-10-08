const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/";

export const canSaveToGmail = () => Boolean(chrome.runtime.getManifest().oauth2?.client_id);

async function googleToken(interactive) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    return typeof result === "string" ? result : result?.token || null;
  } catch (error) {
    console.error("Google sign-in for Gmail copies failed: " + error.message);
    return null;
  }
}

async function gmail(path, init = {}) {
  for (const attempt of [1, 2]) {
    const token = await googleToken(true);
    if (!token) throw new Error("Allow Gmail access to save sent copies.");
    const response = await fetch(GMAIL_API + path, {
      ...init,
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    });
    if (response.status === 401 && attempt === 1) {
      await chrome.identity.removeCachedAuthToken({ token });
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Gmail error " + response.status);
    return data;
  }
}

const headerValue = (message, name) =>
  (message.payload?.headers || []).find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";

// Reply headers for the open conversation, so the reply threads for the recipient and in our Gmail.
export async function threadContext(threadId) {
  if (!canSaveToGmail()) return { canSaveToGmail: false };
  if (!threadId) return { canSaveToGmail: true };
  const headers = ["Message-ID", "References", "From", "Reply-To"].map((name) => "metadataHeaders=" + name).join("&");
  const thread = await gmail(`threads/${threadId}?format=metadata&${headers}`);
  const last = thread.messages?.[thread.messages.length - 1];
  const inReplyTo = last ? headerValue(last, "Message-ID") : "";
  const references = [last ? headerValue(last, "References") : "", inReplyTo].join(" ").trim();
  const replyTo = last ? (headerValue(last, "Reply-To") || headerValue(last, "From")).match(/[^\s<>,;"]+@[^\s<>,;"]+/) : null;
  return { canSaveToGmail: true, threadId, inReplyTo, references, replyRecipients: replyTo ? [replyTo[0]] : [] };
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

const base64Url = (text) => base64(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const wrapped = (text) => base64(text).replace(/.{76}/g, "$&\r\n");
const encodedWord = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64(text)}?=`);

function rawMessage(mail) {
  const boundary = "alias-" + crypto.randomUUID();
  const headers = [
    "From: " + mail.from,
    "To: " + mail.to.join(", "),
    mail.cc?.length ? "Cc: " + mail.cc.join(", ") : null,
    "Subject: " + encodedWord(mail.subject || "(no subject)"),
    "Date: " + new Date().toUTCString(),
    mail.messageId ? "Message-ID: " + mail.messageId : null,
    mail.inReplyTo ? "In-Reply-To: " + mail.inReplyTo : null,
    mail.references ? "References: " + mail.references : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const part = (type, body) =>
    `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapped(body)}\r\n`;
  return headers.join("\r\n") + "\r\n\r\n" + part("text/plain", mail.text || "") + part("text/html", mail.html || "") + `--${boundary}--`;
}

async function domainLabelId(from) {
  const domain = ((from.match(/@([^\s>]+)/) || [])[1] || "").toLowerCase();
  const { labels = [] } = await gmail("labels");
  return labels.find((label) => label.name.toLowerCase() === domain)?.id;
}

// Puts the sent mail in Gmail's Sent folder, in its conversation when we know it.
export async function saveSentCopy(mail) {
  const labelId = await domainLabelId(mail.from);
  const message = { raw: base64Url(rawMessage(mail)), labelIds: labelId ? ["SENT", labelId] : ["SENT"] };
  try {
    return await gmail("messages", { method: "POST", body: JSON.stringify(mail.threadId ? { ...message, threadId: mail.threadId } : message) });
  } catch (error) {
    if (!mail.threadId) throw error;
    console.error("Could not add the copy to its conversation, saving it on its own: " + error.message);
    return gmail("messages", { method: "POST", body: JSON.stringify(message) });
  }
}
