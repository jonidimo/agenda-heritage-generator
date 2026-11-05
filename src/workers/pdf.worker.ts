/**
 * Worker de PDF: recibe el diseño y los bytes de fuentes, feriados y recursos,
 * arma el documento con el mismo núcleo que la vista previa y devuelve el PDF.
 */
import { AgendaDocument } from '@core/document';
import type { PdfJob, PdfReply } from '@core/document/job';
import type { AssetInfo } from '@core/layout/context';
import { assetInfoFromBytes } from '@core/resources';
import { FontRegistry } from '@core/text/fonts';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<PdfJob>) => {
  const job = ev.data;
  try {
    const fonts = new FontRegistry();
    for (const f of job.fonts) fonts.register(f.bytes, { family: f.family, weight: f.weight, style: f.style, source: f.source });
    const infos = new Map<string, AssetInfo>();
    const bytes = new Map<string, Uint8Array>();
    for (const a of job.assets) {
      bytes.set(a.ref.id, a.bytes);
      infos.set(a.ref.id, await assetInfoFromBytes(a.ref, a.bytes));
    }
    const doc = new AgendaDocument(job.design, { fonts, holidays: job.holidays, assets: infos });
    const pdf = await doc.exportPdf(job.kind, {
      assetBytes: (id) => bytes.get(id),
      ...(job.signature !== undefined ? { signature: job.signature } : {}),
      ...(job.pages ? { pages: job.pages } : {}),
      onProgress: (done, total) => ctx.postMessage({ id: job.id, type: 'progress', done, total } satisfies PdfReply),
    });
    ctx.postMessage({ id: job.id, type: 'done', bytes: pdf } satisfies PdfReply, [pdf.buffer as ArrayBuffer]);
  } catch (err) {
    ctx.postMessage({ id: job.id, type: 'error', message: (err as Error).message ?? String(err) } satisfies PdfReply);
  }
};
