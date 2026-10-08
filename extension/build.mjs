import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watching = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("static", "dist", { recursive: true });
await cp("../docs/logo.png", "dist/icon.png");

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
