/**
 * Remuestreo de imágenes en Node (línea de comandos y servidor MCP), sin binarios nativos: jpeg-js y
 * pngjs leen y escriben, y `areaResize` achica. Mismo códec de entrada y de salida.
 */
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { rasterInfo } from '../core/assets/image';
import { areaResize, RESAMPLE_MAX_MEGAPIXELS, type ImageResampler } from '../core/assets/resample';
import { hasTransparentPixels } from '../core/util/pixels';

/** Achica una imagen a `target`; `null` si no se pudo leer o no se quiere tocar (el original queda). */
export const nodeResampler: ImageResampler = async (bytes, mime, target, quality) => {
  try {
    if (mime === 'image/jpeg') {
      const head = rasterInfo(bytes);
      if (!head || (head.width * head.height) / 1_000_000 > RESAMPLE_MAX_MEGAPIXELS) return null;
      const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: RESAMPLE_MAX_MEGAPIXELS, maxMemoryUsageInMB: 1024 });
      if (target.w > img.width || target.h > img.height) return null;
      const small = areaResize(img.data, img.width, img.height, target.w, target.h);
      return new Uint8Array(encodeJpeg({ data: small, width: target.w, height: target.h }, Math.round(quality * 100)).data);
    }
    // El tamaño se mira en la cabecera ANTES de decodificar: un PNG enorme que pesa pocos MB no debe agotar la memoria.
    const header = rasterInfo(bytes);
    if (!header || (header.width * header.height) / 1_000_000 > RESAMPLE_MAX_MEGAPIXELS) return null;
    const png = PNG.sync.read(Buffer.from(bytes));
    if (target.w > png.width || target.h > png.height) return null;
    const small = areaResize(png.data, png.width, png.height, target.w, target.h);
    const out = new PNG({ width: target.w, height: target.h });
    out.data = Buffer.from(small);
    // Sin transparencia va como RGB (un canal menos); con ella, RGBA.
    const alpha = hasTransparentPixels(small);
    return new Uint8Array(PNG.sync.write(out, { colorType: alpha ? 6 : 2, inputColorType: 6, inputHasAlpha: true, deflateLevel: 9, filterType: -1 }));
  } catch {
    return null;
  }
};
