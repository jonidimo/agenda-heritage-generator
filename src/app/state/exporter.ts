/**
 * Exportación: PDF en un Web Worker (con respaldo en el hilo principal),
 * descargas y SVG de la página actual.
 */
import { AgendaDocument, type ExportKind } from '@core/document';
import type { Design } from '@core/design/schema';
import { pageToSvg } from '@core/render/svg';
import type { PdfJob, PdfReply } from '@core/document/job';
import { resources } from './resources';

let worker: Worker | null = null;
let seq = 0;

/** El trabajo falló dentro del Worker (datos, recursos): no se repite en el hilo principal. */
class JobError extends Error {}

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../../workers/pdf.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

export function download(bytes: Uint8Array | Blob, name: string, mime = 'application/pdf'): void {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nombre de archivo a partir del nombre de una agenda, plantilla o tema (sin tildes ni signos). */
export { fileBase } from '@core/util/filename';

function jobFor(design: Design, kind: ExportKind, signature?: number): Omit<PdfJob, 'id'> {
  const fonts = resources.fonts.list().map((f) => ({ bytes: f.bytes, family: f.family, weight: f.weight, style: f.style, source: f.source }));
  const assets = design.assets.flatMap((ref) => {
    const b = resources.assetBytes.get(ref.id);
    return b ? [{ ref: { ...ref, data: null }, bytes: b }] : [];
  });
  return { kind, design, fonts, holidays: resources.holidaysFor(design.holidays.country), assets, ...(signature !== undefined ? { signature } : {}) };
}

export async function exportPdf(design: Design, kind: ExportKind, onProgress: (done: number, total: number) => void, signature?: number): Promise<Uint8Array> {
  const w = getWorker();
  const job = { ...jobFor(design, kind, signature), id: ++seq };
  if (w) {
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const onMsg = (ev: MessageEvent<PdfReply>): void => {
          const r = ev.data;
          if (r.id !== job.id) return;
          if (r.type === 'progress') onProgress(r.done, r.total);
          else {
            w.removeEventListener('message', onMsg);
            w.removeEventListener('error', onErr);
            if (r.type === 'done') resolve(r.bytes);
            else reject(new JobError(r.message));
          }
        };
        const onErr = (e: ErrorEvent): void => {
          w.removeEventListener('message', onMsg);
          w.removeEventListener('error', onErr);
          reject(new Error(e.message || 'worker'));
        };
        w.addEventListener('message', onMsg);
        w.addEventListener('error', onErr);
        w.postMessage(job);
      });
    } catch (err) {
      if (err instanceof JobError) throw err;
      // Solo si el Worker no pudo arrancar o se cayó: se genera en el hilo principal.
      console.warn('Worker no disponible, se genera en el hilo principal', err);
      worker?.terminate();
      worker = null;
    }
  }
  const doc = new AgendaDocument(design, { fonts: resources.fonts, holidays: resources.holidaysFor(design.holidays.country), assets: resources.assetInfos });
  return doc.exportPdf(kind, { assetBytes: (id) => resources.assetBytes.get(id), onProgress, ...(signature !== undefined ? { signature } : {}) });
}

export function exportPageSvg(doc: AgendaDocument, index: number, name: string): void {
  const svg = pageToSvg(doc.page(index), { fonts: doc.ctx.fonts }, { background: '#ffffff' });
  download(new Blob([svg], { type: 'image/svg+xml' }), name, 'image/svg+xml');
}
