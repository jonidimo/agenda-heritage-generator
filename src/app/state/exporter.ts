/**
 * Exportación: PDF en un Web Worker (con respaldo en el hilo principal),
 * descargas y SVG de la página actual.
 */
import { cachedResampler, type ImageDpi } from '@core/assets/resample';
import { AgendaDocument, type ExportKind } from '@core/document';
import { usedAssetIds } from '@core/design/assetUse';
import type { Design } from '@core/design/schema';
import { pageToSvg } from '@core/render/svg';
import type { PdfJob, PdfReply } from '@core/document/job';
import { canvasResampler } from '../../workers/resample';
import { resources } from './resources';
import { awaitDownload, downloadMark } from './desktopBridge';

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

/** Cómo terminó entregar un PDF: se bajó con el navegador, se guardó en una ruta (escritorio) o se canceló. */
export type Delivered = { kind: 'browser'; name: string } | { kind: 'saved'; name: string; path: string } | { kind: 'cancelled'; name: string } | { kind: 'unknown'; name: string };

/** Cuánto se espera, como mucho, a que alguien elija dónde guardar (el cuadro «Guardar como» es del sistema). */
const SAVE_DIALOG_WAIT_MS = 10 * 60_000;

/**
 * Entrega un PDF: en el navegador, la descarga de siempre; en el escritorio, la misma descarga (el
 * sistema pregunta dónde guardarlo) y después se averigua la ruta para poder mostrarla y abrir su carpeta.
 */
export async function deliverPdf(bytes: Uint8Array, name: string): Promise<Delivered> {
  const mark = await downloadMark();
  download(bytes, name);
  if (mark === null) return { kind: 'browser', name };
  const started = Date.now();
  while (Date.now() - started < SAVE_DIALOG_WAIT_MS) {
    const done = await awaitDownload(mark, 60_000);
    if (!done) {
      // Sin respuesta (ruta caída o espera agotada): una pausa corta evita pedir sin parar.
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    if (done.state === 'completed' && done.path) return { kind: 'saved', name: done.name, path: done.path };
    return done.state === 'cancelled' ? { kind: 'cancelled', name } : { kind: 'unknown', name };
  }
  return { kind: 'unknown', name };
}

/** Nombre de archivo a partir del nombre de una agenda, plantilla o tema (sin tildes ni signos). */
export { fileBase } from '@core/util/filename';

/** Qué más pide una exportación: un cuadernillo, solo algunas páginas del PDF de páginas, o la resolución de las imágenes. */
export interface ExportExtra {
  signature?: number;
  pages?: readonly number[];
  imageDpi?: ImageDpi;
}

/** Para exportar en el hilo principal (cuando no hay Worker). */
const mainThreadResampler = cachedResampler(canvasResampler);

function jobFor(design: Design, kind: ExportKind, extra: ExportExtra): Omit<PdfJob, 'id'> {
  const fonts = resources.fonts.list().map((f) => ({ bytes: f.bytes, family: f.family, weight: f.weight, style: f.style, source: f.source }));
  // Solo los recursos que la agenda usa: la tapa o una imagen sin colocar no tienen por qué viajar al worker.
  const used = usedAssetIds(design);
  const assets = design.assets.flatMap((ref) => {
    const b = used.has(ref.id) ? resources.assetBytes.get(ref.id) : undefined;
    return b ? [{ ref: { ...ref, data: null }, bytes: b }] : [];
  });
  return { kind, design, fonts, holidays: resources.holidaysFor(design.holidays.country), assets, ...(extra.signature !== undefined ? { signature: extra.signature } : {}), ...(extra.pages ? { pages: [...extra.pages] } : {}), ...(extra.imageDpi !== undefined ? { imageDpi: extra.imageDpi } : {}) };
}

export async function exportPdf(design: Design, kind: ExportKind, onProgress: (done: number, total: number) => void, extra: ExportExtra = {}): Promise<Uint8Array> {
  const w = getWorker();
  const job = { ...jobFor(design, kind, extra), id: ++seq };
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
  return doc.exportPdf(kind, { assetBytes: (id) => resources.assetBytes.get(id), onProgress, ...(extra.signature !== undefined ? { signature: extra.signature } : {}), ...(extra.pages ? { pages: extra.pages } : {}), ...(extra.imageDpi !== undefined ? { imageDpi: extra.imageDpi, resample: mainThreadResampler } : {}) });
}

export function exportPageSvg(doc: AgendaDocument, index: number, name: string): void {
  const svg = pageToSvg(doc.page(index), { fonts: doc.ctx.fonts }, { background: '#ffffff' });
  download(new Blob([svg], { type: 'image/svg+xml' }), name, 'image/svg+xml');
}
