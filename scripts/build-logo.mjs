// Renders docs/logo.png (Gmail add-on logo) from public/cloudflare.svg. The mark comes from theSVG (https://thesvg.org, MIT).
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const SIZE = 128;
const MARK_WIDTH = 96;

const mark = await sharp(await readFile("public/cloudflare.svg"), { density: 384 }).resize({ width: MARK_WIDTH }).png().toBuffer();
const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="28" fill="#fff"/></svg>`);

await sharp(tile).composite([{ input: mark, gravity: "center" }]).png().toFile("docs/logo.png");
