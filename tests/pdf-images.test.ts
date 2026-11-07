/** Una imagen usada en muchas páginas (una marca de agua) se incrusta una sola vez en el PDF. */
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { toBase64 } from '../src/core/resources';
import { makePng } from './helpers/png';
import { openDocument } from './helpers/node-env';

/** Cuántos objetos de imagen tiene el PDF (sin contar las máscaras de transparencia, que también lo son). */
async function imageObjects(pdf: Uint8Array): Promise<number> {
  const loaded = await PDFDocument.load(pdf);
  let n = 0;
  for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) n++;
  }
  return n;
}

describe('imágenes en el PDF', () => {
  const design = (png: Uint8Array) => {
    const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
    return parseDesign({
      ...d,
      assets: [{ id: 'marca', name: 'marca.png', kind: 'raster', mime: 'image/png', width: 400, height: 400, data: toBase64(png) }],
      watermarks: [{ id: 'w', assetId: 'marca', scope: ['all'], width: 20, opacity: 1 }],
    });
  };

  it('una marca de agua en todas las páginas es un solo objeto de imagen, y cada página lo usa', async () => {
    const { doc, bytes } = await openDocument(design(makePng(400, 400, [200, 30, 30], { noise: true })));
    const pages = [0, 1, 2, 3];
    const pdf = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages });
    expect(await imageObjects(pdf)).toBe(1);
    const loaded = await PDFDocument.load(pdf);
    const used = loaded.getPages().map((p) => {
      const xobjects = p.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      return xobjects?.keys().length ?? 0;
    });
    expect(used.every((n) => n >= 1)).toBe(true);
  });

  it('el PDF pesa lo de una imagen, no lo de una por página', async () => {
    const { doc, bytes } = await openDocument(design(makePng(400, 400, [200, 30, 30], { noise: true })));
    const one = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages: [0] });
    const many = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages: [0, 1, 2, 3, 4, 5, 6, 7] });
    // Ocho páginas con la misma imagen: mucho menos que ocho veces una página.
    expect(many.length).toBeLessThan(one.length * 4);
  });
});
