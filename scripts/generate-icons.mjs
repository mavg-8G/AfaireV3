import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const svg = await readFile(new URL("../public/pwa/icon.svg", import.meta.url), "utf8");
for (const [name, size] of [["icon-192", 192], ["icon-512", 512]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/pwa/${name}.png`, import.meta.url)));
}
// iOS masks the icon itself and paints transparent corners black, so the touch icon is full bleed.
await sharp(Buffer.from(svg.replace('rx="112"', 'rx="0"'))).resize(180, 180).flatten({ background: "#1f6f5c" }).png().toFile(fileURLToPath(new URL("../public/pwa/apple-touch-icon.png", import.meta.url)));
// Full bleed background, with the mark inside the central maskable safe area.
const maskable = svg.replace('rx="112"', 'rx="0"').replace('<g fill=', '<g transform="translate(64 64) scale(.75)" fill=');
await sharp(Buffer.from(maskable)).png().toFile(fileURLToPath(new URL("../public/pwa/maskable-512.png", import.meta.url)));
const favicon = await sharp(Buffer.from(svg)).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 32; ico[7] = 32; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(favicon.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(new URL("../src/app/favicon.ico", import.meta.url), Buffer.concat([ico, favicon]));
