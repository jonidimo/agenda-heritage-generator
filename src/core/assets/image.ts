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
  /** Solo JPEG: cuántos componentes de color tiene (1 gris, 3 RGB, 4 CMYK). */
  components?: number;
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
      const height = u16(b, o + 5);
      const width = u16(b, o + 7);
      // Con una orientación EXIF de 5 a 8 el lector la muestra de costado: el ancho y el alto que cuentan son los de la imagen girada.
      const sideways = jpegOrientation(b) > 4;
      return { mime: 'image/jpeg', height: sideways ? width : height, width: sideways ? height : width, dpi, components: b[o + 9] ?? 3 };
    }
    o += 2 + len;
  }
  return null;
}

/**
 * La orientación EXIF de un JPEG (1 a 8; 1 = derecha, también cuando no la dice). Un JPEG con otra
 * orientación se muestra girado por el lector, no en sus píxeles: volver a codificarlo sin esa marca lo
 * dejaría torcido, así que esas imágenes no se remuestrean.
 */
export function jpegOrientation(b: Uint8Array): number {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let o = 2;
  while (o + 4 <= b.length && b[o] === 0xff) {
    const marker = b[o + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    const len = u16(b, o + 2);
    // APP1 con «Exif\0\0»: cabecera TIFF (orden de bytes, directorio 0).
    if (marker === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) {
      const tiff = o + 10;
      const little = b[tiff] === 0x49;
      const rd16 = (at: number): number => (little ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!);
      const rd32 = (at: number): number => (little ? (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0 : ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0);
      if (tiff + 8 > b.length) return 1;
      const dir = tiff + rd32(tiff + 4);
      if (dir + 2 > b.length) return 1;
      const count = rd16(dir);
      for (let i = 0; i < count; i++) {
        const entry = dir + 2 + i * 12;
        if (entry + 12 > b.length) return 1;
        if (rd16(entry) === 0x0112) {
          const v = rd16(entry + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    o += 2 + len;
  }
  return 1;
}

/** Debajo de esto (ppp) una imagen se ve pixelada al imprimirla: `lowDpi`. La imprenta pide 300. */
export const LOW_DPI = 250;
/** Encima de esto (ppp) no se gana nada al imprimir y el PDF solo pesa más: `overDpi` (informativo). */
export const HIGH_DPI = 600;

/** ppp efectivos de una imagen de `pxWidth` píxeles impresa a `mmWidth` mm. */
export function effectiveDpi(pxWidth: number, mmWidth: number): number {
  return mmWidth > 0 ? Math.round((pxWidth / mmWidth) * 25.4) : 0;
}
