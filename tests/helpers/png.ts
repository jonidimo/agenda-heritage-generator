/** Un PNG de un solo color, hecho a mano (sin dependencias): para probar cómo se incrustan y se remuestrean las imágenes. */
import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * PNG de `w`×`h` del color `rgb`. Con `alpha` (0–255) lleva canal alfa (RGBA); sin él es RGB opaco, que
 * pdfkit incrusta sin máscara. Con `noise`, cada píxel varía un poco (no se comprime a casi nada).
 */
export function makePng(w: number, h: number, rgb: readonly [number, number, number], opts: { alpha?: number; noise?: boolean } = {}): Uint8Array {
  const channels = opts.alpha === undefined ? 3 : 4;
  const row = 1 + w * channels;
  const raw = new Uint8Array(row * h);
  let seed = 12345;
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * channels;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const jitter = opts.noise ? (seed >> 16) & 31 : 0;
      raw[o] = Math.min(255, rgb[0] + jitter);
      raw[o + 1] = Math.min(255, rgb[1] + jitter);
      raw[o + 2] = Math.min(255, rgb[2] + jitter);
      if (channels === 4) raw[o + 3] = opts.alpha!;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
