import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const watching = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("static", "dist", { recursive: true });
await cp("../docs/logo.png", "dist/icon.png");
await addLocalSettings();

const options = {
  entryPoints: { content: "src/content.js", background: "src/background.js", options: "src/options.js", archive: "src/archive.js" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
};

if (watching) await (await context(options)).watch();
else await build(options);

// local.json (not committed) pins the extension ID and turns on saving copies into Gmail's Sent folder.
async function addLocalSettings() {
  if (!existsSync("local.json")) return;
  const local = JSON.parse(await readFile("local.json", "utf8"));
  const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
  if (local.key) manifest.key = local.key;
  if (local.oauthClientId) {
    manifest.oauth2 = {
      client_id: local.oauthClientId,
      scopes: [
        "https://www.googleapis.com/auth/gmail.insert",
        "https://www.googleapis.com/auth/gmail.labels",
        "https://www.googleapis.com/auth/gmail.metadata",
      ],
    };
    manifest.permissions = [...new Set([...manifest.permissions, "identity"])];
    manifest.host_permissions = [...new Set([...manifest.host_permissions, "https://gmail.googleapis.com/"])];
  }
  await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
}
