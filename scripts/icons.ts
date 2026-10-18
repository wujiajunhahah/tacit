// Draws the Tacit mark (an ink tile with a lime diamond) as PNGs, with no image dependencies.

import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

const INK = [23, 22, 28];
const LIME = [158, 205, 46];

/** Coverage-sampled shapes: a rounded tile and a centred diamond. */
export function drawMark(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const ss = 4;
  const r = size * 0.22;
  const half = size / 2;
  const d = size * 0.19;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0;
      let lime = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss;
          const fy = y + (sy + 0.5) / ss;
          const cx = Math.max(r - fx, 0, fx - (size - r));
          const cy = Math.max(r - fy, 0, fy - (size - r));
          if (cx * cx + cy * cy <= r * r) tile++;
          if (Math.abs(fx - half) + Math.abs(fy - half) <= d) lime++;
        }
      }
      const a = tile / (ss * ss);
      const l = lime / (ss * ss);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(INK[c]! * (1 - l) + LIME[c]! * l);
      px[i + 3] = Math.round(255 * a);
    }
  }
  return px;
}

export async function writeIcons(dir: string, sizes = [16, 32, 48, 128]): Promise<void> {
  for (const s of sizes) await Bun.write(`${dir}/${s}.png`, encodePng(s, s, drawMark(s)));
}
