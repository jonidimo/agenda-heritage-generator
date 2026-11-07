/**
 * Un feriado con un nombre largo (el de Güemes en inglés tiene 71 caracteres) se abrevia en su casilla y
 * avisa; el aviso dice que se le puede dar un nombre más corto en Calendario → Feriados, y con ese
 * nombre el aviso se va.
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { computeHolidays, HOLIDAY_TYPES } from '../src/core/holidays';
import { loadHolidays, openDocument } from './helpers/node-env';

describe('renombrar un feriado', () => {
  it('el nombre propio reemplaza al largo en la agenda y el aviso de abreviado desaparece', async () => {
    const ar = loadHolidays('AR');
    const all = computeHolidays(ar, { subdivision: null, types: HOLIDAY_TYPES, lang: 'en', from: '2027-01-01', to: '2027-12-31' });
    const [date] = [...all.entries()].find(([, hs]) => hs.some((h) => h.name.includes('Güemes')))!;
    expect(date).toMatch(/^2027-06-/);

    // En hojas A5 (páginas A6) la casilla del día es chica: el nombre no entra.
    const created = createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' });
    const base = parseDesign({ ...created, locale: 'en', paper: { ...created.paper, preset: 'A5' } });
    const before = await openDocument(base);
    const abbreviated = (doc: typeof before.doc): string[] =>
      doc
        .warnings()
        .filter((w) => w.code === 'abbreviated' && String(w.params.text).includes('Güemes'))
        .map((w) => String(w.params.text));
    expect(abbreviated(before.doc).length).toBeGreaterThan(0);

    const renamed = parseDesign({ ...base, holidays: { ...base.holidays, renamed: { [date]: 'Güemes Day' } } });
    const after = await openDocument(renamed);
    expect(abbreviated(after.doc)).toEqual([]);
    // El nombre nuevo está en la agenda.
    const texts = after.doc.plan.pages.flatMap((p) => (p.group === 'month:2027-06' ? after.doc.page(p.index).blocks.flatMap((b) => JSON.stringify(b.prims)) : []));
    expect(texts.some((t) => t.includes('Güemes Day'))).toBe(true);
  });
});
