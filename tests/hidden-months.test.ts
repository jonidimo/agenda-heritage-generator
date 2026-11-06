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

  it('los días de un mes visible que caen en una semana del mes oculto siguen teniendo página semanal', async () => {
    // Marzo de 2028 empieza un miércoles: la semana del 28 de febrero al 5 de marzo es de marzo (su jueves es el 2),
    // y la del 27 de marzo al 2 de abril también. Con marzo oculto, el 28 y 29 de febrero y el 1 y 2 de abril se perdían.
    const make = (hidden: string[]) =>
      openDocument(
        parseDesign({ ...createDesign('heritage', { year: 2028, locale: 'es-AR', country: 'AR' }), calendar: { year: 2028, weekStart: 'monday', numbering: 'iso', hiddenMonths: hidden } }),
      );
    const all = await make([]);
    const some = await make(['2028-03']);
    const weekOf = (doc: typeof all.doc, iso: string) => doc.ctx.cal.weeks.find((w) => w.days.some((d) => d.iso === iso));
    for (const [iso, month] of [['2028-02-29', 2], ['2028-04-01', 4]] as const) {
      const week = weekOf(some.doc, iso);
      expect(week, iso).toBeDefined();
      expect(week!.owner.m).toBe(month);
      // La misma clave y el mismo número que sin ocultar nada: los ajustes por semana siguen valiendo.
      expect(week!.key).toBe(weekOf(all.doc, iso)!.key);
      expect(week!.number).toBe(weekOf(all.doc, iso)!.number);
      const pages = some.doc.plan.pages.filter((p) => p.params?.week === week!.key);
      expect(pages.length, iso).toBeGreaterThan(0);
      for (const p of pages) expect(p.group).toBe(`month:2028-0${month}`);
    }
    // Las semanas siguen en orden de fecha, dentro de cada mes y en la lista de todas.
    const starts = some.doc.ctx.cal.weeks.map((w) => w.days[0]!.n);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    for (const m of some.doc.ctx.cal.months) {
      const s = m.weeks.map((w) => w.days[0]!.n);
      expect([...s].sort((a, b) => a - b)).toEqual(s);
    }
    // Ningún día de marzo tiene semana propia: solo los que comparten semana con febrero o abril.
    expect(some.doc.ctx.cal.weeks.filter((w) => w.days.every((d) => d.m === 3))).toHaveLength(0);
  });
});
