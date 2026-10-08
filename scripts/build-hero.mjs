// Renders docs/hero.png with sharp. Icons come from theSVG (https://thesvg.org, MIT) via the `thesvg` npm package.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import gmail from "thesvg/gmail";
import cloudflare from "thesvg/cloudflare";
import workers from "thesvg/cloudflare-workers";
import appsScript from "thesvg/google-apps-script";

const W = 1600, H = 800, TILE = 120;

// Re-nest an icon's svg at a position, keeping its viewBox and root fill.
function icon(i, x, y, size) {
  const root = i.svg.match(/<svg([^>]*)>/)[1];
  const viewBox = root.match(/viewBox="([^"]+)"/)[1];
  const fill = root.match(/\sfill="([^"]+)"/)?.[1];
  const inner = i.svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}" ${fill ? `fill="${fill}"` : ""} preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

const tile = (cx, cy, content, label, sub) => `
  <rect x="${cx - TILE / 2}" y="${cy - TILE / 2}" width="${TILE}" height="${TILE}" rx="26" fill="#fff"/>
  ${content}
  <text x="${cx}" y="${cy + TILE / 2 + 38}" class="lbl" text-anchor="middle">${label}</text>
  <text x="${cx}" y="${cy + TILE / 2 + 64}" class="sub" text-anchor="middle">${sub}</text>`;

const arrow = (x1, x2, y) => `
  <line x1="${x1}" y1="${y}" x2="${x2 - 14}" y2="${y}" stroke="#f6821f" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12"/>
  <path d="M${x2 - 22} ${y - 12} L${x2} ${y} L${x2 - 22} ${y + 12}" fill="none" stroke="#f6821f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

const at = (cx, cy) => `<text x="${cx}" y="${cy + 26}" font-size="76" font-weight="700" fill="#f6821f" text-anchor="middle" font-family="sans-serif">@</text>`;
const pad = 26, ic = TILE - pad * 2;
const place = (i, cx, cy) => icon(i, cx - ic / 2, cy - ic / 2, ic);

const X = [520, 960, 1400];
const R1 = 380, R2 = 620;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1b2740"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7"><stop offset="0" stop-color="#f6821f" stop-opacity="0.32"/><stop offset="1" stop-color="#f6821f" stop-opacity="0"/></radialGradient>
    <style>
      text { font-family: "Helvetica Neue", Arial, "DejaVu Sans", sans-serif; }
      .h1 { font-size: 68px; font-weight: 800; fill: #fff; }
      .p { font-size: 29px; fill: #b6c2d9; }
      .tag { font-size: 22px; font-weight: 700; fill: #f6821f; letter-spacing: 4px; }
      .lbl { font-size: 26px; font-weight: 700; fill: #fff; }
      .sub { font-size: 20px; fill: #8fa0bf; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="80" y="120" class="h1">Your domain. Your Gmail.</text>
  <text x="80" y="176" class="p">Receive on you@yourdomain.com, read and send from the inbox you already use.</text>
  <text x="80" y="220" class="p">One Cloudflare token. No other services.</text>

  <text x="80" y="${R1 + 8}" class="tag">RECEIVE</text>
  ${tile(X[0], R1, at(X[0], R1), "Anyone", "writes to hi@yourdomain.com")}
  ${arrow(X[0] + 80, X[1] - 80, R1)}
  ${tile(X[1], R1, place(cloudflare, X[1], R1), "Email Routing", "catch-all + special addresses")}
  ${arrow(X[1] + 80, X[2] - 80, R1)}
  ${tile(X[2], R1, place(gmail, X[2], R1), "Your Gmail", "lands in your inbox")}

  <text x="80" y="${R2 + 8}" class="tag">SEND</text>
  ${tile(X[0], R2, place(appsScript, X[0], R2), "Gmail add-on", "Send via custom domain")}
  ${arrow(X[0] + 80, X[1] - 80, R2)}
  ${tile(X[1], R2, place(workers, X[1], R2), "Worker", "dashboard + send API")}
  ${arrow(X[1] + 80, X[2] - 80, R2)}
  ${tile(X[2], R2, place(cloudflare, X[2], R2), "Email Sending", "from hi@yourdomain.com")}
</svg>`;

await mkdir("docs", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile("docs/hero.png");
console.log("wrote docs/hero.png");
