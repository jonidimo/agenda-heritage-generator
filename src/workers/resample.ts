/**
 * Remuestreo de imágenes en el navegador (Web Worker o hilo principal): decodifica con el navegador, achica
 * de a mitades en un lienzo fuera de pantalla (cada paso es un promedio de 2×2 con suavizado de alta
 * calidad, sin los escalones de achicar de una sola vez) y vuelve a codificar con el mismo formato.
 */
import type { ImageResampler } from '@core/assets/resample';

/**
 * Achica una imagen ya decodificada a `w`×`h` de a mitades y devuelve el lienzo (o `null` si el navegador
 * no puede). Con el mismo tamaño la copia sin cambios.
 */
export function scaleDown(source: ImageBitmap, w: number, h: number): OffscreenCanvas | null {
  let current: ImageBitmap | OffscreenCanvas = source;
  let cw = source.width;
  let ch = source.height;
  do {
    const nw = Math.max(w, Math.ceil(cw / 2));
    const nh = Math.max(h, Math.ceil(ch / 2));
    const step = new OffscreenCanvas(nw, nh);
    const ctx = step.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, nw, nh);
    current = step;
    cw = nw;
    ch = nh;
  } while (cw > w || ch > h);
  return current;
}

export const canvasResampler: ImageResampler = async (bytes, mime, target, quality) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    // Sin girar por EXIF (las imágenes giradas ni llegan acá) y sin convertir el color: los mismos valores que lee el PDF.
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }), { imageOrientation: 'none', colorSpaceConversion: 'none' });
    if (target.w > bitmap.width || target.h > bitmap.height) return null;
    const canvas = scaleDown(bitmap, target.w, target.h);
    if (!canvas) return null;
    const blob = await canvas.convertToBlob(mime === 'image/jpeg' ? { type: 'image/jpeg', quality } : { type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
};
