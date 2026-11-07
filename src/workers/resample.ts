/**
 * Remuestreo de imágenes en el navegador (Web Worker o hilo principal): decodifica con el navegador, achica
 * de a mitades en un lienzo fuera de pantalla (cada paso es un promedio de 2×2 con suavizado de alta
 * calidad, sin los escalones de achicar de una sola vez) y vuelve a codificar con el mismo formato.
 */
import type { ImageResampler } from '@core/assets/resample';

export const canvasResampler: ImageResampler = async (bytes, mime, target, quality) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    // Sin girar por EXIF (las imágenes giradas ni llegan acá) y sin convertir el color: los mismos valores que lee el PDF.
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }), { imageOrientation: 'none', colorSpaceConversion: 'none' });
    if (target.w > bitmap.width || target.h > bitmap.height) return null;
    let source: ImageBitmap | OffscreenCanvas = bitmap;
    let w = bitmap.width;
    let h = bitmap.height;
    while (w > target.w || h > target.h) {
      const nw = Math.max(target.w, Math.ceil(w / 2));
      const nh = Math.max(target.h, Math.ceil(h / 2));
      const step = new OffscreenCanvas(nw, nh);
      const ctx = step.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, nw, nh);
      source = step;
      w = nw;
      h = nh;
    }
    if (!(source instanceof OffscreenCanvas)) return null;
    const blob = await source.convertToBlob(mime === 'image/jpeg' ? { type: 'image/jpeg', quality } : { type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
};
