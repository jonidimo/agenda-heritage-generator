/** Empezar de cero: la agenda en blanco, el cuaderno, agregar y quitar secciones, y cero páginas sin errores. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { addMonthItemRecipe, addSectionRecipe, removeSectionRecipe, sectionCatalogue, uniqueSectionId } from '../../src/app/state/sections';
import { customPageHere } from '../../src/app/state/customPages';
import { clampPage, pageStep, spreadOf } from '../../src/app/state/paging';
import { createDesign, NOTEBOOK_DEFAULT_PAGES, TEMPLATES } from '../../src/core/design/defaults';
import { parseDesign, type Design } from '../../src/core/design/schema';
import { planSignatures } from '../../src/core/imposition/signatures';
import { openDocument } from '../helpers/node-env';

const apply = (d: Design, r: (x: Design) => void): Design => produce(d, (x) => void r(x as Design));

describe('plantillas sin calendario', () => {
  it('«En blanco» no tiene secciones ni páginas, para leer en pantalla y para imprimir', async () => {
    const d = createDesign('blank', { year: 2027, locale: 'es-AR' });
    expect(d.sections).toEqual([]);
    expect(d.watermarks).toEqual([]);
    expect(d.assets).toEqual([]);
    for (const target of ['print', 'screen'] as const) {
      const { doc } = await openDocument(parseDesign({ ...d, binding: { ...d.binding, target } }));
      expect(doc.pageCount).toBe(0);
      expect(doc.plan.signatures.totalSheets).toBe(0);
      await expect(doc.exportPdf('imposed', { assetBytes: () => undefined })).rejects.toThrow(/no tiene páginas/);
    }
    expect(TEMPLATES.find((t) => t.id === 'blank')!.undated).toBe(true);
  });

  it('el cuaderno tiene su portada y las páginas para escribir del estilo pedido', async () => {
    const def = await openDocument(createDesign('notebook', { year: 2027, locale: 'es-AR' }));
    expect(def.doc.plan.pages.filter((p) => p.type === 'notes')).toHaveLength(NOTEBOOK_DEFAULT_PAGES);
    const { doc } = await openDocument(createDesign('notebook', { year: 2027, locale: 'en-US', pages: 60, style: 'lines', name: 'Ana' }));
    const notes = doc.plan.pages.filter((p) => p.type === 'notes');
    expect(notes).toHaveLength(60);
    expect(notes[0]!.params?.style).toBe('lines');
    expect(doc.plan.pages[0]!.type).toBe('titlePage');
    expect(doc.design.name).toBe('Ana’s notebook');
    expect(doc.plan.pages.some((p) => p.group.startsWith('month:'))).toBe(false);
    // Tope de páginas como el del formulario.
    expect(createDesign('notebook', { pages: 9999 }).sections.find((s) => s.type === 'notes')!.options.count).toBe(200);
  });
});

describe('agregar y quitar secciones', () => {
  it('en una agenda vacía se ofrece todo; una sección que ya está no se ofrece de nuevo, salvo las notas', () => {
    const blank = createDesign('blank');
    const first = sectionCatalogue(blank);
    expect(first.top.map((e) => e.type)).toEqual(expect.arrayContaining(['titlePage', 'months', 'notes', 'contacts', 'passwords']));
    // Agrupadas: lo del principio, el calendario y lo del final, en ese orden.
    const groups = first.top.map((e) => e.group);
    expect(groups.indexOf('calendar')).toBeGreaterThan(groups.lastIndexOf('front'));
    expect(groups.lastIndexOf('calendar')).toBeLessThan(groups.indexOf('back'));
    expect(first.month).toEqual([]);
    const withTitle = apply(blank, addSectionRecipe('titlePage'));
    expect(sectionCatalogue(withTitle).top.some((e) => e.type === 'titlePage')).toBe(false);
    const twoNotes = apply(apply(blank, addSectionRecipe('notes')), addSectionRecipe('notes'));
    expect(twoNotes.sections.map((s) => s.id)).toEqual(['notes', 'notes-2']);
    expect(uniqueSectionId(twoNotes, 'notes')).toBe('notes-3');
  });

  it('dos secciones de notas dan páginas con claves distintas', async () => {
    const d = apply(apply(createDesign('blank'), addSectionRecipe('notes')), addSectionRecipe('notes'));
    const { doc } = await openDocument(apply(d, (x) => x.sections.forEach((s) => void (s.options.count = 2))));
    const keys = doc.plan.pages.filter((p) => p.type === 'notes').map((p) => p.key);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
  });

  it('lo del principio va antes de «Meses»; «Meses» llega con su contenido; se puede agregar al mes y quitar', async () => {
    let d = apply(createDesign('blank'), addSectionRecipe('notes'));
    d = apply(d, addSectionRecipe('months'));
    d = apply(d, addSectionRecipe('titlePage'));
    expect(d.sections.map((s) => s.type)).toEqual(['titlePage', 'months', 'notes']);
    expect(d.sections[1]!.items!.length).toBeGreaterThan(3);
    const before = d.sections[1]!.items!.length;
    const removed = apply(d, removeSectionRecipe({ list: 'month', index: 0 }));
    expect(removed.sections[1]!.items!).toHaveLength(before - 1);
    const offered = sectionCatalogue(removed).month.map((e) => e.type);
    expect(offered).toContain(d.sections[1]!.items![0]!.type);
    const back = apply(removed, addMonthItemRecipe(d.sections[1]!.items![0]!.type));
    expect(back.sections[1]!.items!).toHaveLength(before);
    const { doc } = await openDocument(parseDesign({ ...back, calendar: { ...back.calendar, monthCount: 1 } }));
    expect(doc.pageCount).toBeGreaterThan(3);
    expect(apply(d, removeSectionRecipe({ list: 'top', index: 0 })).sections.map((s) => s.type)).toEqual(['months', 'notes']);
  });
});

describe('cero páginas', () => {
  it('pasar de página y el pliego no dan posiciones que no existen', () => {
    expect(clampPage(5, 0)).toBe(0);
    expect(clampPage(-3, 10)).toBe(0);
    expect(clampPage(42, 10)).toBe(9);
    expect(spreadOf(0, 0)).toEqual([null, null]);
    expect(pageStep('spread', 0, 0, 1)).toBe(0);
  });

  it('sin hojas para imprimir no hay relleno', () => {
    const binding = createDesign('blank').binding;
    for (const method of ['sewn', 'single', 'saddle', 'cut-stack'] as const) expect(planSignatures(0, { ...binding, method })).toMatchObject({ totalPages: 0, padding: 0 });
  });

  it('una página propia en una agenda vacía va al principio, sin ancla que pueda desaparecer', async () => {
    const { doc } = await openDocument(createDesign('blank'));
    const cp = customPageHere(doc, 0, {});
    expect(cp.after).toBeNull();
    expect(cp.fallback).toBeNull();
    const { doc: one } = await openDocument(parseDesign({ ...createDesign('blank'), customPages: [cp] }));
    expect(one.plan.pages.filter((p) => p.type === 'custom')).toHaveLength(1);
  });
});
