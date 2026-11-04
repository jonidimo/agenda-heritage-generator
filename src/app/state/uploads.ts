/**
 * Subida de imágenes, SVG y PDF a la agenda abierta: detecta el formato, convierte a PNG lo que
 * el navegador sepa abrir (WebP, HEIC, AVIF, GIF), guarda los bytes en el dispositivo y agrega
 * la referencia al diseño. Lo usan el panel de imágenes, la marca de agua y el menú contextual.
 */
import { rasterInfo } from '@core/assets/image';
import { assetInfoFromBytes } from '@core/resources';
import { newId } from '@core/util/hash';
import { saveAsset } from './persist';
import { resources } from './resources';
import { useStore } from './store';

function kindOf(file: File, bytes: Uint8Array): { kind: 'raster' | 'vector' | 'pdf'; mime: string } | null {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return { kind: 'vector', mime: 'image/svg+xml' };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { kind: 'pdf', mime: 'application/pdf' };
  const r = rasterInfo(bytes);
  if (r) return { kind: 'raster', mime: r.mime };
  return null;
}

/** Convierte lo que el navegador sepa abrir (WebP, HEIC, GIF, AVIF) a PNG sin pérdida. */
async function toPng(file: File): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d')?.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export interface UploadResult {
  ids: string[];
  /** Mensajes para mostrar (formato no soportado, avisos del SVG…). */
  messages: string[];
}

/**
 * Agrega archivos como recursos de la agenda abierta. Si mientras se procesan se abre otra
 * agenda, no se le agregan a esa (los bytes quedan y se limpian si nadie los usa).
 */
export async function addAssetFiles(files: Iterable<File>, unsupported: (name: string) => string): Promise<UploadResult> {
  const out: UploadResult = { ids: [], messages: [] };
  const designId = useStore.getState().design?.id;
  for (const file of files) {
    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
    let k = kindOf(file, bytes);
    if (!k) {
      const png = await toPng(file);
      if (!png) {
        out.messages.push(unsupported(file.name));
        continue;
      }
      bytes = png;
      k = { kind: 'raster', mime: 'image/png' };
    }
    const id = newId('img');
    const ref = { id, name: file.name, kind: k.kind, mime: k.mime, width: 0, height: 0, builtin: null };
    try {
      const info = await assetInfoFromBytes(ref, bytes);
      resources.assetBytes.set(id, bytes);
      resources.assetInfos.set(id, info);
      await saveAsset(id, bytes);
      if (useStore.getState().design?.id !== designId) continue;
      useStore.getState().update((d) => void d.assets.push({ ...ref, width: info.width, height: info.height, ...(info.pages ? { pages: info.pages } : {}) }));
      resources.bump();
      useStore.getState().bumpResources(resources.version);
      out.ids.push(id);
      if (info.vector?.warnings.length) out.messages.push(info.vector.warnings.join(' '));
    } catch (err) {
      out.messages.push(`${file.name}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Abre el selector de archivos del sistema (sin un `<input>` en la página). */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

export const IMAGE_ACCEPT = 'image/*,.svg,.pdf,application/pdf';
