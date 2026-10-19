import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svg = await readFile(new URL("../public/pwa/icon.svg", import.meta.url), "utf8");
const output = (path) => fileURLToPath(new URL(path, import.meta.url));
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(output(`../public/pwa/icon-${size}.png`));
}

// Opaque, full bleed backgrounds let iOS and Android apply their own masks.
const fullBleed = svg.replace('rx="112"', 'rx="0"');
await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile(output("../public/pwa/apple-touch-icon.png"));
// The complete A/check fits within Android's central 80% safe circle.
const maskable = fullBleed.replace('id="mark"', 'id="mark" transform="translate(51.2 51.2) scale(.8)"');
await sharp(Buffer.from(maskable)).png().toFile(output("../public/pwa/maskable-512.png"));

// Explicit variants also respect the in-app theme when it differs from the OS.
const darkSvg = svg.replace('color="#ffffff"', 'color="#3b211f"');
await writeFile(output("../public/pwa/favicon.svg"), svg);
await writeFile(output("../public/pwa/favicon-dark.svg"), darkSvg);
await sharp(Buffer.from(darkSvg.replace('rx="112"', 'rx="0"'))).resize(180, 180).png().toFile(output("../public/pwa/apple-touch-icon-dark.png"));
// Native entries for standard and high-density browser tabs.
const sizes = [16, 32, 48];
for (const [theme, source] of [["light", svg], ["dark", darkSvg]]) {
  // A new filename bypasses browser favicon databases that retain the old purple mark.
  await writeFile(output(`../public/pwa/impulso-${theme}.svg`), source);
  const images = await Promise.all(sizes.map(size => sharp(Buffer.from(source)).resize(size, size).png().toBuffer()));
  await writeFile(output(`../public/pwa/impulso-${theme}-32.png`), images[1]);
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    header[entry] = size;
    header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  }
  const ico = Buffer.concat([header, ...images]);
  await writeFile(output(`../public/pwa/impulso-${theme}.ico`), ico);
  if (theme === "light") await writeFile(output("../src/app/favicon.ico"), ico);
}
