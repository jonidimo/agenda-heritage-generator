/** Meses ocultos: no tienen páginas, pestañas ni enlaces; el calendario anual los sigue mostrando. */
import { describe, expect, it } from 'vitest';
import { createDesign, duplicateForYear } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { openDocument } from './helpers/node-env';

const norma = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

describe('meses ocultos', () => {
  it('un mes oculto no tiene páginas y los demás conservan sus claves', async () => {
    const all = await openDocument(norma());
    const some = await openDocument(norma((d) => void (d.calendar.hiddenMonths = ['2027-03'])));
    const groups = (doc: typeof all.doc) => new Set(doc.plan.pages.map((p) => p.group));
    expect(groups(all.doc).has('month:2027-03')).toBe(true);
    expect(groups(some.doc).has('month:2027-03')).toBe(false);
    expect(some.doc.plan.pages.length).toBeLessThan(all.doc.plan.pages.length);
    // Las claves de los otros meses no cambian: los ajustes y enlaces a mano siguen valiendo.
    const keys = new Set(all.doc.plan.pages.map((p) => p.key));
    for (const p of some.doc.plan.pages.filter((x) => x.group === 'month:2027-04')) expect(keys.has(p.key)).toBe(true);
    expect(some.doc.ctx.cal.months.map((m) => m.key)).not.toContain('2027-03');
  });

  it('el calendario anual lo sigue mostrando pero sus días y su nombre no llevan a ningún lado', async () => {
    const { doc } = await openDocument(norma((d) => void (d.calendar.hiddenMonths = ['2027-03'])));
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const links = doc.links(yp.index);
    expect(links.some((l) => l.target.kind === 'month' && l.target.m === 3)).toBe(false);
    // Los días de marzo que caen en una semana que pertenece a abril (la del 29 al 4) siguen llevando a ella.
    const march = links.filter((l) => l.target.kind === 'date' && l.target.iso.startsWith('2027-03'));
    expect(march.length).toBeLessThanOrEqual(3);
    for (const l of march) expect(doc.plan.pages[l.page!]!.group).not.toBe('month:2027-03');
    expect(links.some((l) => l.target.kind === 'month' && l.target.m === 4)).toBe(true);
  });

  it('al duplicar para otro año la lista corre con él; un valor que no es un mes se descarta', () => {
    const d = norma((x) => void (x.calendar.hiddenMonths = ['2027-03', '2027-03', 'marzo', '2027-13']));
    expect(d.calendar.hiddenMonths).toEqual(['2027-03']);
    expect(duplicateForYear(d, 2028).calendar.hiddenMonths).toEqual(['2028-03']);
  });

  it('la numeración de las semanas no cambia por ocultar un mes', async () => {
    const all = await openDocument(norma());
    const some = await openDocument(norma((d) => void (d.calendar.hiddenMonths = ['2027-03'])));
    const week = (doc: typeof all.doc, key: string) => doc.ctx.cal.weeks.find((w) => w.key === key)?.number;
    expect(week(some.doc, '2027-W20')).toBe(week(all.doc, '2027-W20'));
  });
});
