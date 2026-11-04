/**
 * URLs de vista previa de los recursos: blob: para imágenes y una imagen
 * rasterizada con pdf.js (carga diferida) para las páginas de PDF importados.
 * El PDF final usa siempre los bytes originales (vectoriales).
 */
import { resources } from './resources';

const urls = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

export function onAssetUrlsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const l of listeners) l();
}

function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x25 && bytes[1] === 0x50) return 'application/pdf';
  return 'image/svg+xml';
}

/** URL para `<image href>`; para PDF devuelve undefined hasta que la vista previa esté lista. */
export function assetHref(key: string, kind: 'image' | 'pdf'): string | undefined {
  const hit = urls.get(key);
  if (hit) return hit;
  if (kind === 'image') {
    const bytes = resources.assetBytes.get(key);
    if (!bytes) return undefined;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(bytes) }));
    urls.set(key, url);
    return url;
  }
  if (!pending.has(key)) {
    pending.add(key);
    void renderPdfPreview(key);
  }
  return undefined;
}

async function renderPdfPreview(key: string): Promise<void> {
  const [id, pageStr] = key.split('#');
  const bytes = resources.assetBytes.get(id ?? '');
  if (!bytes) return;
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const page = await doc.getPage(Math.min(doc.numPages, Math.max(1, Number(pageStr ?? 1) || 1)));
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    urls.set(key, URL.createObjectURL(blob));
    notify();
  } catch (err) {
    console.warn('Vista previa de PDF no disponible', err);
  }
}

export function forgetAsset(id: string): void {
  for (const [k, u] of urls) {
    if (k === id || k.startsWith(`${id}#`)) {
      URL.revokeObjectURL(u);
      urls.delete(k);
    }
  }
}
