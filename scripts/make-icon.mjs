/**
 * Generates `static/icons/dossier.png`, the 128x128 app icon the manifest
 * references. Written as a script rather than committed as an opaque blob so
 * the mark can be changed without a design tool.
 *
 * No dependencies: a minimal RGBA PNG encoder plus a 4x supersampled raster,
 * so the rounded corners and the page edges are smooth at icon sizes.
 *
 *   node scripts/make-icon.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 128;
const SS = 4; // supersample factor
const N = SIZE * SS;

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'static', 'icons', 'dossier.png');

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // One filter byte per row; filter 0 (none) keeps the encoder honest.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded box, negative inside. */
function sdRoundBox(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function inTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const TOP = [37, 99, 235]; // blue-600
const BOTTOM = [30, 58, 138]; // blue-900
const PAGE = [248, 250, 252]; // slate-50
const INK = [30, 58, 138]; // blue-900
const ACCENT = [245, 158, 11]; // amber-500

// Geometry in the 128-unit design space.
const PAD = 4; // transparent margin around the tile
const RADIUS = 26;
const PAGE_X0 = 36;
const PAGE_X1 = 92;
const PAGE_Y0 = 24;
const PAGE_Y1 = 104;
const FOLD = 20;
const BAR_X0 = 47;
const BAR_H = 6;

const BARS = [
  { y: 46, w: 34 },
  { y: 60, w: 34 },
  { y: 74, w: 22 },
];

function sampleAt(x, y) {
  // x, y are in 0..127 design units, already supersampled by the caller.
  const cx = 64;
  const cy = 64;
  const half = 64 - PAD;

  if (sdRoundBox(x, y, cx, cy, half, half, RADIUS) > 0) return null;

  let colour = mix(TOP, BOTTOM, Math.min(1, Math.max(0, (y - PAD) / (SIZE - PAD * 2))));

  const pageRadius = 6;
  const pageHalfW = (PAGE_X1 - PAGE_X0) / 2;
  const pageHalfH = (PAGE_Y1 - PAGE_Y0) / 2;
  const pageCx = (PAGE_X0 + PAGE_X1) / 2;
  const pageCy = (PAGE_Y0 + PAGE_Y1) / 2;

  const onPage = sdRoundBox(x, y, pageCx, pageCy, pageHalfW, pageHalfH, pageRadius) <= 0;
  const inFold = inTriangle(
    x,
    y,
    [PAGE_X1 - FOLD, PAGE_Y0],
    [PAGE_X1, PAGE_Y0],
    [PAGE_X1, PAGE_Y0 + FOLD],
  );

  if (onPage && !inFold) colour = PAGE;

  for (const bar of BARS) {
    const left = BAR_X0;
    const right = BAR_X0 + bar.w * ((PAGE_X1 - PAGE_X0 - 22) / 34);
    if (
      x >= left &&
      x <= right &&
      y >= bar.y &&
      y <= bar.y + BAR_H &&
      !inFold
    ) {
      colour = bar.w === 22 ? ACCENT : INK;
    }
  }

  return colour;
}

function render() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = (x + (sx + 0.5) / SS) * 1;
          const py = (y + (sy + 0.5) / SS) * 1;
          const c = sampleAt(px, py);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const offset = (y * SIZE + x) * 4;
      if (a === 0) continue;
      rgba[offset] = Math.round(r / (a / 255));
      rgba[offset + 1] = Math.round(g / (a / 255));
      rgba[offset + 2] = Math.round(b / (a / 255));
      rgba[offset + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

mkdirSync(dirname(out), { recursive: true });
const png = encodePng(SIZE, SIZE, render());
writeFileSync(out, png);
console.log(`static/icons/dossier.png  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1)} KB`);
