// Generates PWA icons (PNG) without any image dependency.
// Draws the Outskirts terminal mark: black field, neon ring, cursor bar.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/', import.meta.url));

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mark(size, inset) {
  const c = size / 2;
  const ringOuter = size * 0.30;
  const ringInner = ringOuter - Math.max(2, size * 0.028);
  const barW = size * 0.20;
  const barH = Math.max(2, size * 0.02);
  const corner = size * 0.10;
  const thick = Math.max(2, size * 0.016);
  const pad = inset + size * 0.02;

  return (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let green = false;
    // neon ring
    if (dist <= ringOuter && dist >= ringInner) green = true;
    // cursor bar through the centre
    if (Math.abs(dx) <= barW / 2 && Math.abs(dy) <= barH / 2) green = true;
    // terminal corner brackets
    const inTL = x < pad + corner && y < pad + corner && (x < pad + thick || y < pad + thick);
    const inTR = x > size - pad - corner && y < pad + corner && (x > size - pad - thick || y < pad + thick);
    const inBL = x < pad + corner && y > size - pad - corner && (x < pad + thick || y > size - pad - thick);
    const inBR = x > size - pad - corner && y > size - pad - corner && (x > size - pad - thick || y > size - pad - thick);
    if (inTL || inTR || inBL || inBR) green = true;

    return green ? [0, 255, 102, 255] : [0, 0, 0, 255];
  };
}

function solid(size) {
  return () => [0, 0, 0, 255];
}

// ICO container with a single 256x256 PNG entry (Windows Vista+).
function icoFromPng(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 0 => 256px
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, 192, mark(192, 8)));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, 512, mark(512, 20)));
// Maskable: full black bleed, mark inside the safe zone.
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), png(512, 512, (x, y) => {
  const inner = mark(512 * 0.72, 0)(x / 0.72, y / 0.72);
  return inner[3] === 255 && inner[1] === 255 ? inner : solid(512)(x, y);
}));
fs.writeFileSync(path.join(OUT, 'outskirts.ico'), icoFromPng(png(256, 256, mark(256, 10))));
fs.writeFileSync(
  path.join(OUT, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#000"/><circle cx="256" cy="256" r="150" fill="none" stroke="#00ff66" stroke-width="14"/><rect x="160" y="248" width="192" height="16" fill="#00ff66"/><path d="M60 132V60h72M380 60h72v72M452 380v72h-72M132 452H60v-72" fill="none" stroke="#00ff66" stroke-width="12"/></svg>`,
);
console.log('icons written to', OUT);
