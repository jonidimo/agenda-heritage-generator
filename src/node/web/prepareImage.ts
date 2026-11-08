/**
 * Deja una imagen descargada lista para la agenda: la endereza según su orientación EXIF, la recorta a la
 * proporción del lugar donde va (con un punto de foco o una zona elegida) y la achica a los ppp de
 * impresión pedidos, sin agrandarla nunca. JPEG sigue siendo JPEG y PNG sigue siendo PNG (con su
 * transparencia). Una imagen que no hace falta tocar queda con sus bytes originales.
 */
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { cropRgba, orientRgba, outputSize, planCrop, type Focus, type PixelRect } from '../../core/assets/crop';
import { jpegOrientation, rasterInfo } from '../../core/assets/image';
import { ASSET_MAX_SIDE_PX } from '../../core/assets/prepare';
import { areaResize, RESAMPLE_MAX_MEGAPIXELS } from '../../core/assets/resample';
import { hasTransparentPixels } from '../../core/util/pixels';
import { withPngDpi } from '../png';

export interface PrepareOptions {
  /** Medidas del lugar donde va, en mm; sin ellas la imagen no se recorta a una proporción ni se achica a unos ppp. */
  sizeMm?: { w: number; h: number } | undefined;
  /** Resolución de impresión a la que se achica. */
  dpi: number;
  /** Punto de foco (0 a 1) para el recorte a la proporción de `sizeMm`. */
  focus?: Focus | undefined;
  /** Zona a conservar (0 a 1 sobre la imagen derecha): manda sobre el foco. */
  crop?: { x: number; y: number; w: number; h: number } | undefined;
  /** Calidad JPEG de salida (0 a 1). */
  quality?: number | undefined;
}

export interface PreparedImage {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  /** Medidas de la imagen original, ya derecha. */
  sourceWidth: number;
  sourceHeight: number;
  /** La zona conservada, en píxeles de la imagen original derecha. */
  kept: PixelRect;
  /** ppp que alcanza al tamaño pedido (null sin medidas). */
  effectiveDpi: number | null;
  /** Se pidió más resolución de la que tiene la imagen. */
  upscaleNeeded: boolean;
  /** Los bytes son los del original (no hizo falta tocarlos). */
  untouched: boolean;
}

export class ImageError extends Error {}

/** Qué formato tienen estos bytes: `png`, `jpeg`, `svg`, o `null` (webp, gif, avif… no se importan). */
export function sniffImage(b: Uint8Array): 'png' | 'jpeg' | 'svg' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  const head = new TextDecoder().decode(b.subarray(0, 8192));
  // El primer elemento tiene que ser <svg> (después de la declaración XML, comentarios y el DOCTYPE): un HTML que lo contiene no lo es.
  if (/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>/]/i.test(head.charCodeAt(0) === 0xfeff ? head.slice(1) : head)) return 'svg';
  return null;
}

export function prepareRaster(bytes: Uint8Array, opts: PrepareOptions): PreparedImage {
  const kind = sniffImage(bytes);
  if (kind !== 'png' && kind !== 'jpeg') throw new ImageError('Solo se importan imágenes PNG, JPEG o SVG.');
  const head = rasterInfo(bytes);
  if (!head) throw new ImageError('No se pudo leer la cabecera de la imagen.');
  if ((head.width * head.height) / 1_000_000 > RESAMPLE_MAX_MEGAPIXELS) throw new ImageError(`La imagen es demasiado grande (${head.width} × ${head.height} px).`);

  let rgba: Uint8Array;
  let w: number;
  let h: number;
  let mime: 'image/png' | 'image/jpeg';
  let orientation = 1;
  try {
    if (kind === 'jpeg') {
      const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: RESAMPLE_MAX_MEGAPIXELS, maxMemoryUsageInMB: 1024 });
      orientation = jpegOrientation(bytes);
      ({ data: rgba, w, h } = orientRgba(img.data, img.width, img.height, orientation));
      mime = 'image/jpeg';
    } else {
      const png = PNG.sync.read(Buffer.from(bytes));
      rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length);
      w = png.width;
      h = png.height;
      mime = 'image/png';
    }
  } catch (err) {
    throw new ImageError(`La imagen está dañada o no se puede leer (${(err as Error).message}).`);
  }

  const aspect = opts.sizeMm && opts.sizeMm.w > 0 && opts.sizeMm.h > 0 ? opts.sizeMm.w / opts.sizeMm.h : undefined;
  const kept = planCrop({ w, h }, { aspect, focus: opts.focus, crop: opts.crop });
  const out = outputSize(kept, opts.sizeMm ?? null, opts.dpi, ASSET_MAX_SIDE_PX);
  const whole = kept.x === 0 && kept.y === 0 && kept.w === w && kept.h === h;
  const effectiveDpi = opts.sizeMm && opts.sizeMm.w > 0 ? Math.round((out.w / opts.sizeMm.w) * 25.4) : null;
  const upscaleNeeded = effectiveDpi !== null && effectiveDpi < opts.dpi * 0.95;
  const common = { sourceWidth: w, sourceHeight: h, kept, effectiveDpi, upscaleNeeded };

  // Nada que cambiar: el original queda tal cual (volver a codificar un JPEG lo degrada).
  if (whole && out.w === w && out.h === h && orientation === 1) return { ...common, bytes, mime, width: w, height: h, untouched: true };

  let pixels = whole ? rgba : cropRgba(rgba, w, kept);
  if (out.w !== kept.w || out.h !== kept.h) pixels = areaResize(pixels, kept.w, kept.h, out.w, out.h);

  if (mime === 'image/jpeg') {
    const encoded = encodeJpeg({ data: pixels, width: out.w, height: out.h }, Math.round((opts.quality ?? 0.9) * 100)).data;
    return { ...common, bytes: new Uint8Array(encoded), mime, width: out.w, height: out.h, untouched: false };
  }
  const png = new PNG({ width: out.w, height: out.h });
  png.data = Buffer.from(pixels);
  const alpha = hasTransparentPixels(pixels);
  const encoded = new Uint8Array(PNG.sync.write(png, { colorType: alpha ? 6 : 2, inputColorType: 6, inputHasAlpha: true, deflateLevel: 9, filterType: -1 }));
  const dpi = opts.sizeMm && opts.sizeMm.w > 0 ? Math.round((out.w / opts.sizeMm.w) * 25.4) : null;
  return { ...common, bytes: dpi ? withPngDpi(encoded, dpi) : encoded, mime, width: out.w, height: out.h, untouched: false };
}
