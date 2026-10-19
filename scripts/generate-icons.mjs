import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svg = await readFile(new URL("../public/pwa/icon.svg", import.meta.url), "utf8");
const output = (path) => fileURLToPath(new URL(path, import.meta.url));
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(output(`../public/pwa/icon-${size}.png`));
}

// Let the operating system supply its own corner mask, with no transparent pixels.
const fullBleed = svg.replace('rx="112"', 'rx="0"');
await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile(output("../public/pwa/apple-touch-icon.png"));
// Keep the entire letter and dot within Android's central 80% safe circle.
const maskable = fullBleed.replace('id="mark"', 'id="mark" transform="translate(51.2 51.2) scale(.8)"');
await sharp(Buffer.from(maskable)).png().toFile(output("../public/pwa/maskable-512.png"));

// Small tabs need a crisp mark without shadows or decorative background arcs.
const faviconSvg = svg
  .replace(/<path d="M-.*?\/>/g, "")
  .replace('filter="url(#lift)"', "")
  .replace('fill="url(#paper)"', 'fill="#fff"');
await writeFile(output("../public/pwa/favicon.svg"), faviconSvg);

// Native entries for standard and high-density browser tabs.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(faviconSvg)).resize(size, size).png().toBuffer()));
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
await writeFile(output("../src/app/favicon.ico"), Buffer.concat([header, ...images]));
