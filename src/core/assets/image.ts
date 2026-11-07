/**
 * Lectura de cabeceras PNG y JPEG: dimensiones en píxeles y resolución
 * declarada, para calcular los ppp efectivos al tamaño impreso y avisar si una
 * imagen va a salir pixelada.
 */

export interface RasterInfo {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  /** ppp declarados en el archivo (si existen). */
  dpi: number | null;
}

export function rasterInfo(bytes: Uint8Array): RasterInfo | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return pngInfo(bytes);
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegInfo(bytes);
  return null;
}

const u32 = (b: Uint8Array, o: number): number => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u16 = (b: Uint8Array, o: number): number => (b[o]! << 8) | b[o + 1]!;

function pngInfo(b: Uint8Array): RasterInfo {
  const width = u32(b, 16);
  const height = u32(b, 20);
  let dpi: number | null = null;
  let o = 8;
  while (o + 12 <= b.length) {
    const len = u32(b, o);
    const type = String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
    if (type === 'pHYs' && len >= 9) {
      const ppx = u32(b, o + 8);
      const unit = b[o + 16];
      if (unit === 1 && ppx > 0) dpi = Math.round(ppx * 0.0254);
    }
    if (type === 'IDAT' || type === 'IEND') break;
    o += 12 + len;
  }
  return { mime: 'image/png', width, height, dpi };
}

function jpegInfo(b: Uint8Array): RasterInfo | null {
  let o = 2;
  let dpi: number | null = null;
  while (o + 4 < b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const marker = b[o + 1]!;
    const len = u16(b, o + 2);
    if (marker === 0xe0 && String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!) === 'JFIF') {
      const units = b[o + 11];
      const xd = u16(b, o + 12);
      if (units === 1 && xd > 0) dpi = xd;
      else if (units === 2 && xd > 0) dpi = Math.round(xd * 2.54);
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { mime: 'image/jpeg', height: u16(b, o + 5), width: u16(b, o + 7), dpi };
    }
    o += 2 + len;
  }
  return null;
}

/** Debajo de esto (ppp) una imagen se ve pixelada al imprimirla: `lowDpi`. La imprenta pide 300. */
export const LOW_DPI = 250;
/** Encima de esto (ppp) no se gana nada al imprimir y el PDF solo pesa más: `overDpi` (informativo). */
export const HIGH_DPI = 600;

/** ppp efectivos de una imagen de `pxWidth` píxeles impresa a `mmWidth` mm. */
export function effectiveDpi(pxWidth: number, mmWidth: number): number {
  return mmWidth > 0 ? Math.round((pxWidth / mmWidth) * 25.4) : 0;
}
