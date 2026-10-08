import * as InboxSDK from "@inboxsdk/core";
import { loadSettings } from "./shared.js";
import { registerComposeButton } from "./compose-button.js";
import { registerArchivePage } from "./archive-page.js";

const PLACEHOLDER_APP_ID = "Hello World!";

async function start() {
  const { appId } = await loadSettings();
  const sdk = await InboxSDK.load(2, appId || PLACEHOLDER_APP_ID);
  registerComposeButton(sdk);
  registerArchivePage(sdk);
}

start();
