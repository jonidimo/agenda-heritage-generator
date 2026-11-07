/**
 * Remuestreo de imágenes al exportar el PDF: cuánto achicar cada una (según el tamaño en que se imprime
 * y la resolución pedida), el filtro que la achica y la caché. Quien codifica y decodifica (el
 * navegador con un lienzo, Node con jpeg-js y pngjs) es un `ImageResampler`: acá no hay códecs.
 */
import { fnv1aBytes } from '../util/hash';
import { jpegOrientation, rasterInfo } from './image';

/** Resolución de las imágenes del PDF: la original, o como mucho estos ppp al tamaño en que se imprimen. */
export const IMAGE_DPI_OPTIONS = ['original', 300, 150] as const;
export type ImageDpi = (typeof IMAGE_DPI_OPTIONS)[number];

/** Una resolución que se remuestrea (no `original`). */
export type TargetDpi = Exclude<ImageDpi, 'original'>;

/** Lee «original», «300» o «150» (de la línea de comandos); lanza un error claro con cualquier otra cosa. */
export function parseImageDpi(value: string): ImageDpi {
  const found = IMAGE_DPI_OPTIONS.find((o) => String(o) === value.trim().toLowerCase());
  if (found === undefined) throw new Error(`Resolución de imágenes desconocida: «${value}». Opciones: ${IMAGE_DPI_OPTIONS.join(', ')}.`);
  return found;
}

/**
 * Una imagen se achica solo si tiene al menos este múltiplo de la resolución que hace falta: por menos,
 * la ganancia no compensa volver a codificarla.
 */
export const RESAMPLE_GAIN = 1.5;

/** Más megapíxeles que esto no se decodifican para achicarlos (una imagen RGBA de 100 MP son 400 MB, y se usan varias copias). */
export const RESAMPLE_MAX_MEGAPIXELS = 100;

/** Calidad JPEG con que se vuelve a codificar (0–1) según la resolución pedida: imprimir cuida más el detalle. */
export const RESAMPLE_QUALITY: Record<TargetDpi, number> = { 300: 0.9, 150: 0.82 };

/**
 * Códec y píxeles de salida. El códec es siempre el de origen: un JPEG sigue siendo JPEG (ya tenía
 * pérdida) y un PNG sigue siendo PNG (sin pérdida, con su transparencia); así remuestrear nunca degrada
 * una imagen más que el achicado mismo.
 */
export type ImageResampler = (bytes: Uint8Array, mime: 'image/png' | 'image/jpeg', target: { w: number; h: number }, quality: number) => Promise<Uint8Array | null>;

/** El tamaño al que achicar una imagen de `px` para imprimirla a lo sumo a `maxWmm`×`maxHmm` mm con `dpi`, o `null` si no vale la pena. */
export function resampleTarget(px: { w: number; h: number }, size: { maxWmm: number; maxHmm: number }, dpi: TargetDpi): { w: number; h: number } | null {
  if (px.w < 1 || px.h < 1 || size.maxWmm <= 0 || size.maxHmm <= 0) return null;
  const needW = (size.maxWmm / 25.4) * dpi;
  const needH = (size.maxHmm / 25.4) * dpi;
  // Una escala única (la imagen se achica con su proporción) que alcance para las dos medidas.
  const scale = Math.max(needW / px.w, needH / px.h);
  if (!(scale > 0) || scale * RESAMPLE_GAIN > 1) return null;
  return { w: Math.max(1, Math.ceil(px.w * scale)), h: Math.max(1, Math.ceil(px.h * scale)) };
}

/**
 * Los bytes que quedan: el candidato si se pudo leer, tiene el tamaño pedido y pesa menos que el original;
 * si no, el original. Achicar nunca debe dejar un archivo peor.
 */
export function pickSmaller(original: Uint8Array, candidate: Uint8Array | null | undefined, target: { w: number; h: number }): Uint8Array {
  if (!candidate || candidate.length >= original.length) return original;
  const info = rasterInfo(candidate);
  return info && info.width === target.w && info.height === target.h ? candidate : original;
}

/**
 * ¿Se puede remuestrear sin cambiar cómo se ve? Se dejan como están: un JPEG con una orientación EXIF
 * distinta de la derecha, uno CMYK, un PNG de 16 bits por canal (se pasaría a 8) y lo que tiene tantos
 * megapíxeles que decodificarlo agotaría la memoria.
 */
export function canResample(bytes: Uint8Array): boolean {
  const info = rasterInfo(bytes);
  if (!info || (info.width * info.height) / 1_000_000 > RESAMPLE_MAX_MEGAPIXELS) return false;
  // Un JPEG CMYK se incrusta en el PDF tal cual (DeviceCMYK): pasarlo a RGB cambiaría sus colores de imprenta.
  if (info.mime === 'image/jpeg') return jpegOrientation(bytes) === 1 && info.components !== 4;
  return bytes[24] !== 16;
}

/** Envuelve un remuestreador con una caché por contenido y tamaño (la misma imagen se achica una vez por exportación). */
export function cachedResampler(inner: ImageResampler, limit = 32): ImageResampler {
  const cache = new Map<string, Uint8Array | null>();
  return async (bytes, mime, target, quality) => {
    const key = `${bytes.length}:${fnv1aBytes(bytes)}:${mime}:${target.w}x${target.h}:${quality}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const out = await inner(bytes, mime, target, quality);
    cache.set(key, out);
    if (cache.size > limit) cache.delete(cache.keys().next().value!);
    return out;
  };
}

/**
 * Achica un buffer RGBA promediando el área que cubre cada píxel de destino (un filtro de caja con
 * pesos fraccionarios, como «área» de los programas de imágenes): no deja los escalones de tomar un
 * píxel de cada tantos, ni el ruido de achicar mucho de una sola vez. El color se promedia con el alfa
 * por delante, para que un borde transparente no se manche de negro. Solo achica (destino ≤ origen).
 */
export function areaResize(src: Uint8Array | Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  if (dw > sw || dh > sh || dw < 1 || dh < 1 || src.length < sw * sh * 4) throw new RangeError('areaResize solo achica, con un buffer RGBA del tamaño dicho');
  // Pasada horizontal: sw → dw, en coma flotante y con el alfa multiplicado.
  const mid = new Float32Array(dw * sh * 4);
  const kx = sw / dw;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const from = x * kx;
      const to = from + kx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = Math.floor(from); i < Math.min(sw, Math.ceil(to)); i++) {
        const w = Math.min(i + 1, to) - Math.max(i, from);
        const o = (y * sw + i) * 4;
        const al = src[o + 3]! / 255;
        r += src[o]! * al * w;
        g += src[o + 1]! * al * w;
        b += src[o + 2]! * al * w;
        a += al * w;
      }
      const m = (y * dw + x) * 4;
      mid[m] = r / kx;
      mid[m + 1] = g / kx;
      mid[m + 2] = b / kx;
      mid[m + 3] = a / kx;
    }
  }
  // Pasada vertical: sh → dh, y de vuelta a 8 bits con el color separado del alfa.
  const out = new Uint8Array(dw * dh * 4);
  const ky = sh / dh;
  for (let y = 0; y < dh; y++) {
    const from = y * ky;
    const to = from + ky;
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = Math.floor(from); j < Math.min(sh, Math.ceil(to)); j++) {
        const w = Math.min(j + 1, to) - Math.max(j, from);
        const m = (j * dw + x) * 4;
        r += mid[m]! * w;
        g += mid[m + 1]! * w;
        b += mid[m + 2]! * w;
        a += mid[m + 3]! * w;
      }
      r /= ky;
      g /= ky;
      b /= ky;
      a /= ky;
      const o = (y * dw + x) * 4;
      out[o] = a > 0 ? Math.round(Math.min(255, r / a)) : 0;
      out[o + 1] = a > 0 ? Math.round(Math.min(255, g / a)) : 0;
      out[o + 2] = a > 0 ? Math.round(Math.min(255, b / a)) : 0;
      out[o + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  return out;
}
