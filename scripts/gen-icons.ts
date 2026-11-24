/**
 * Generates every app icon from the single source, assets/icon.svg (a full-bleed square).
 *   pnpm gen:icons
 *
 * Outputs (in public/, committed):
 *   favicon.svg           rounded square: browser tabs and the in-app logo
 *   favicon.ico           32 + 48 px, for browsers that don't use the SVG
 *   apple-touch-icon.png  180 px full-bleed square (iOS rounds the corners itself)
 *   icon-192/512.png      "any" icons: macOS-style rounded square with margin (desktop installs)
 *   maskable-192/512.png  full-bleed squares Android crops to its own shape
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SIZE = 512;
const source = readFileSync('assets/icon.svg', 'utf8');
const inner = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>\n`;

/** The icon clipped to a rounded square (corner radius as a fraction of the side). */
function rounded(radius = 0.2227): string {
  const r = Math.round(SIZE * radius);
  return svg(
    `<defs><clipPath id="r"><rect width="${SIZE}" height="${SIZE}" rx="${r}"/></clipPath></defs>` +
      `<g clip-path="url(#r)">${inner}</g>`,
  );
}

/** macOS app icon grid: the rounded body fills about 80% of the canvas, leaving a margin. */
function macStyle(): string {
  const scale = 824 / 1024;
  const offset = (SIZE * (1 - scale)) / 2;
  return svg(
    `<g transform="translate(${offset} ${offset}) scale(${scale})">` +
      rounded().replace(/^<svg[^>]*>|<\/svg>\s*$/g, '') +
      `</g>`,
  );
}

const png = (markup: string, size: number) =>
  // Rendered at 4× and scaled down, for smooth edges at every size.
  sharp(Buffer.from(markup), { density: 72 * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

/** An .ico file holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const favicon = rounded();
const outputs: [string, Buffer | string][] = [
  ['favicon.svg', favicon],
  [
    'favicon.ico',
    ico([
      { size: 32, data: await png(favicon, 32) },
      { size: 48, data: await png(favicon, 48) },
    ]),
  ],
  ['apple-touch-icon.png', await png(source, 180)],
  ['icon-192.png', await png(macStyle(), 192)],
  ['icon-512.png', await png(macStyle(), 512)],
  ['maskable-192.png', await png(source, 192)],
  ['maskable-512.png', await png(source, 512)],
];
for (const [name, data] of outputs) {
  writeFileSync(`public/${name}`, data);
  console.log(`Wrote public/${name}`);
}
