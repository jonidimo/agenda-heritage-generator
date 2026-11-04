/**
 * Secciones que se repiten (cada mes, semana o día), plantillas de página y fondos de páginas propias.
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { openDocument } from './helpers/node-env';

const base = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};
const months = (d: Design) => d.sections.find((s) => s.type === 'months')!;
const textOf = (doc: Awaited<ReturnType<typeof openDocument>>['doc'], i: number): string =>
  doc
    .page(i)
    .blocks.flatMap((b) => b.prims)
    .flatMap(function walk(p): string[] {
      return p.t === 'text' ? [p.run.text] : p.t === 'group' ? p.children.flatMap(walk) : [];
    })
    .join(' ');

/** Agrega una sección (la saca de la lista principal) a los meses con esa repetición. */
function repeat(d: Design, type: string, how: 'month' | 'week' | 'day'): void {
  const i = d.sections.findIndex((s) => s.type === type);
  const [sec] = d.sections.splice(i, 1);
  months(d).items!.push({ ...sec!, enabled: true, repeat: how });
}

describe('secciones repetidas', () => {
  it('por defecto nada cambia: cada sección del final va una sola vez', async () => {
    const { doc } = await openDocument(base((d) => void (d.sections.find((s) => s.type === 'estimates')!.enabled = true)));
    expect(doc.plan.pages.filter((p) => p.type === 'estimates')).toHaveLength(1);
  });

  it('cada mes: una copia por mes, en el grupo del mes y con claves únicas', async () => {
    const { doc } = await openDocument(base((d) => repeat(d, 'estimates', 'month')));
    const pages = doc.plan.pages.filter((p) => p.type === 'estimates');
    expect(pages).toHaveLength(12);
    expect(new Set(pages.map((p) => p.key)).size).toBe(12);
    expect(pages.map((p) => p.group)).toEqual(doc.ctx.cal.months.map((m) => `month:${m.key}`));
  });

  it('cada semana: va justo después del pliego de cada semana', async () => {
    const { doc } = await openDocument(base((d) => repeat(d, 'estimates', 'week')));
    const pages = doc.plan.pages;
    const copies = pages.filter((p) => p.type === 'estimates');
    expect(copies).toHaveLength(doc.ctx.cal.weeks.length);
    for (const c of copies) {
      const prev = pages[c.index - 1]!;
      // Antes de la copia: la derecha de su semana (o un relleno de paridad después de ella).
      const week = c.params?.week;
      const right = pages.find((p) => p.type === 'weekRight' && p.params?.week === week)!;
      expect(c.index).toBeGreaterThan(right.index);
      expect(pages.slice(right.index + 1, c.index).every((p) => p.type === 'filler')).toBe(true);
      expect(prev.type === 'weekRight' || prev.type === 'filler').toBe(true);
    }
    // Ningún pliego semanal quedó partido.
    for (const p of pages) if (p.type === 'weekLeft') expect(pages[p.index + 1]!.type).toBe('weekRight');
  });

  it('cada día con un día por página: va después de la página de ese día y dice su fecha', async () => {
    const { doc } = await openDocument(
      base((d) => {
        d.pageTemplates.push({ id: 'diario', title: 'Gratitud', showTitle: true, content: { kind: 'text', text: 'Hoy, {weekday} {date}', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'lines', rotation: 0, opacity: 1 } });
        months(d).items!.find((i) => i.type === 'weeks')!.options.variant = 'daily';
        months(d).items!.push({ id: 'g', type: 'pageTemplate', enabled: true, options: { template: 'diario' }, repeat: 'day' });
      }),
    );
    const pages = doc.plan.pages;
    const copies = pages.filter((p) => p.type === 'tpl:diario');
    expect(copies.length).toBeGreaterThanOrEqual(365);
    const c = copies.find((p) => p.params?.date === '2027-03-31')!;
    const owner = pages.find((p) => p.type === 'daily' && ((p.params?.days as string[]) ?? []).includes('2027-03-31'))!;
    expect(c.index).toBeGreaterThan(owner.index);
    expect(pages.slice(owner.index + 1, c.index).every((p) => p.type === 'filler' || p.type === 'tpl:diario')).toBe(true);
    const text = textOf(doc, c.index);
    expect(text).toContain('Gratitud');
    expect(text).toContain('31 de marzo');
    expect(text.toLowerCase()).toContain('hoy, miércoles 31 de marzo');
  });

  it('los elementos agregados a una plantilla aparecen en todas sus copias', async () => {
    const { doc } = await openDocument(
      base((d) => {
        d.pageTemplates.push({ id: 'p', title: 'Semana en una frase', showTitle: true, content: { kind: 'template', text: '', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'dots', rotation: 0, opacity: 1 } });
        months(d).items!.push({ id: 'p1', type: 'pageTemplate', enabled: true, options: { template: 'p' }, repeat: 'week' });
        d.customBlocks.push({ id: 'b', pageType: 'tpl:p', pageKey: null, kind: 'text', x: 20, y: 40, w: 100, h: 10, mirror: true, props: { text: 'Semana {week}' } });
      }),
    );
    const copies = doc.plan.pages.filter((p) => p.type === 'tpl:p');
    expect(copies.length).toBe(doc.ctx.cal.weeks.length);
    for (const c of copies.slice(0, 5)) expect(textOf(doc, c.index)).toContain(`Semana ${String(c.params?.weekNumber)}`);
    expect(doc.warnings().filter((w) => w.code === 'layoutError')).toEqual([]);
  });

  it('las claves de las copias siguen en su lugar al duplicar para otro año', async () => {
    const { shiftKeyYears } = await import('../src/core/design/defaults');
    expect(shiftKeyYears('back:estimates:0@2027-03', 1)).toBe('back:estimates:0@2028-03');
    expect(shiftKeyYears('tpl:p:0@2027-W12', 1)).toBe('tpl:p:0@2028-W12');
    expect(shiftKeyYears('tpl:p:0@2027-03-31', 1)).toBe('tpl:p:0@2028-03-31');
  });
});

describe('páginas propias', () => {
  it('con fondo «en blanco» no se dibujan puntos ni renglones', async () => {
    const { doc } = await openDocument(
      base((d) => void d.customPages.push({ id: 'x', after: null, fallback: null, startOn: 'any', title: '', content: { kind: 'template', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'blank', text: '', rotation: 0, opacity: 1 } })),
    );
    const i = doc.indexOfKey('custom:x');
    expect(doc.page(i).blocks.some((b) => b.id === 'custom.background')).toBe(false);
  });
});
