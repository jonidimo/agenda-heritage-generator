/** Escribe en un PNG su resolución (chunk pHYs): abierto en un programa de imágenes o al imprimirlo, mide lo que debe y no «lo que cabe». */

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

/** Copia del PNG con su resolución en ppp (reemplaza la que ya tuviera). Si no es un PNG, lo devuelve igual. */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 33 || sig.some((v, i) => png[i] !== v)) return png;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrEnd = 8 + 12 + view.getUint32(8);
  // El chunk nuevo: píxeles por metro en x e y, unidad = metro.
  const ppm = Math.round(dpi / 0.0254);
  const body = new Uint8Array(13);
  const phys = new DataView(body.buffer);
  body.set([0x70, 0x48, 0x59, 0x73], 0);
  phys.setUint32(4, ppm);
  phys.setUint32(8, ppm);
  body[12] = 1;
  const chunk = new Uint8Array(21);
  new DataView(chunk.buffer).setUint32(0, 9);
  chunk.set(body, 4);
  new DataView(chunk.buffer).setUint32(17, crc32(body));
  // Sin el pHYs que traía, si lo traía.
  const out: Uint8Array[] = [png.subarray(0, ihdrEnd), chunk];
  let o = ihdrEnd;
  while (o + 12 <= png.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(png[o + 4]!, png[o + 5]!, png[o + 6]!, png[o + 7]!);
    if (type !== 'pHYs') out.push(png.subarray(o, o + 12 + len));
    o += 12 + len;
  }
  const total = out.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let at = 0;
  for (const p of out) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}

