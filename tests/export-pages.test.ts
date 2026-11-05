/** PDF de una parte de la agenda: solo las páginas pedidas, con enlaces y marcadores a las que quedaron. */
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { openDocument } from './helpers/node-env';

describe('exportar algunas páginas', () => {
  it('el archivo tiene solo esas páginas, en orden y sin repetir', async () => {
    const { doc, bytes } = await openDocument(parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' })));
    const month = doc.plan.pages.filter((p) => p.group === 'month:2027-03').map((p) => p.index);
    expect(month.length).toBeGreaterThan(4);
    const pdf = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages: [...month, month[0]!].reverse() });
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(month.length);
  });

  it('pide páginas que no existen: se ignoran; ninguna válida es un error claro', async () => {
    const { doc, bytes } = await openDocument(parseDesign(createDesign('heritage', { year: 2027, locale: 'en-US', country: 'US' })));
    const ok = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages: [0, 9999, -3] });
    expect((await PDFDocument.load(ok)).getPageCount()).toBe(1);
    await expect(doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages: [9999] })).rejects.toThrow(/No hay páginas/);
  });
});
