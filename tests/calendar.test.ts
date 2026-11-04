import { describe, expect, it } from 'vitest';
import { buildCalendar, type CalendarOptions } from '../src/core/calendar';
import { monthNames, weekdayLabel } from '../src/core/calendar/locale';
import { moonPhases } from '../src/core/calendar/moon';
import { computeHolidays } from '../src/core/holidays';
import { isoWeek, toDayNumber } from '../src/core/util/dates';
import { loadHolidays } from './helpers/node-env';

const base = (year: number, extra: Partial<CalendarOptions> = {}): CalendarOptions => ({
  year,
  startMonth: 1,
  monthCount: 12,
  weekStart: 1,
  weekend: [6, 7],
  numbering: 'iso',
  locale: 'es-AR',
  ...extra,
});

const noSources = { holidays: () => new Map(), personalDates: [], moon: null };

describe('semanas ISO', () => {
  it('2026 tiene 53 semanas ISO y empieza el lunes 29/12/2025', () => {
    const cal = buildCalendar(base(2026), noSources);
    expect(cal.weeks).toHaveLength(53);
    expect(cal.weeks[0]!.days[0]!.iso).toBe('2025-12-29');
    expect(cal.weeks[0]!.label).toBe('Diciembre / Enero');
    expect(cal.weeks[52]!.key).toBe('2026-W53');
    expect(cal.weeks[52]!.days[6]!.iso).toBe('2027-01-03');
  });

  it('2027 incluye la semana de borde con el 1, 2 y 3 de enero (ISO 2026-W53)', () => {
    const cal = buildCalendar(base(2027), noSources);
    const first = cal.weeks[0]!;
    expect(first.key).toBe('2026-W53');
    expect(first.days.map((d) => d.iso)).toContain('2027-01-01');
    expect(cal.months[0]!.weeks[0]).toBe(first);
    // Ningún día del año queda fuera de las semanas.
    const covered = new Set(cal.weeks.flatMap((w) => w.days.map((d) => d.iso)));
    for (const m of cal.months) for (const d of m.days) expect(covered.has(d.iso)).toBe(true);
    // Ninguna semana se repite.
    expect(new Set(cal.weeks.map((w) => w.key)).size).toBe(cal.weeks.length);
  });

  it('cada semana interior pertenece al mes de su jueves', () => {
    const cal = buildCalendar(base(2027), noSources);
    for (const m of cal.months.slice(1, -1)) {
      for (const w of m.weeks) expect(w.days[3]!.m).toBe(m.m);
    }
  });

  it('isoWeek coincide con casos conocidos', () => {
    expect(isoWeek(toDayNumber(2027, 1, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(toDayNumber(2027, 1, 4))).toEqual({ year: 2027, week: 1 });
    expect(isoWeek(toDayNumber(2028, 12, 31))).toEqual({ year: 2028, week: 52 });
  });

  it('2028 es bisiesto: febrero tiene 29 días', () => {
    const cal = buildCalendar(base(2028), noSources);
    expect(cal.months[1]!.days).toHaveLength(29);
  });

  it('semanas que empiezan el domingo usan el miércoles como día dueño', () => {
    const cal = buildCalendar(base(2027, { weekStart: 7, locale: 'en-US' }), noSources);
    expect(cal.weeks[0]!.days[0]!.dow).toBe(7);
    for (const w of cal.weeks) expect(w.days).toHaveLength(7);
  });

  it('agenda escolar de 18 meses desde marzo', () => {
    const cal = buildCalendar(base(2027, { startMonth: 3, monthCount: 18 }), noSources);
    expect(cal.months).toHaveLength(18);
    expect(cal.months[0]!.key).toBe('2027-03');
    expect(cal.months[17]!.key).toBe('2028-08');
  });
});

describe('nombres por idioma', () => {
  it('meses y días en los 4 idiomas', () => {
    expect(monthNames('es-AR')[0]).toBe('Enero');
    expect(monthNames('en-US')[8]).toBe('September');
    expect(monthNames('pt-BR')[2]).toBe('Março');
    expect(monthNames('it-IT')[11]).toBe('Dicembre');
    expect(weekdayLabel('es-AR', 3)).toBe('MIÉ');
    expect(weekdayLabel('en-GB', 1)).toBe('MON');
    expect(weekdayLabel('it-IT', 4)).toBe('GIO');
  });
});

describe('feriados', () => {
  const ar = loadHolidays('AR');

  it('Argentina 2027: inamovibles y móviles calculados desde Pascua', () => {
    const map = computeHolidays(ar, { types: ['public'], lang: 'es', from: '2027-01-01', to: '2027-12-31' });
    for (const d of ['2027-01-01', '2027-03-24', '2027-04-02', '2027-05-01', '2027-05-25', '2027-06-20', '2027-07-09', '2027-12-08', '2027-12-25']) {
      expect(map.has(d), d).toBe(true);
    }
    expect(map.get('2027-03-26')?.[0]?.name).toBe('Viernes Santo');
    expect(map.has('2027-02-08') && map.has('2027-02-09')).toBe(true); // Carnaval
  });

  it('filtra por tipo y aplica ediciones del usuario', () => {
    const map = computeHolidays(ar, {
      types: ['public', 'bank'],
      lang: 'es',
      from: '2027-01-01',
      to: '2027-12-31',
      edits: {
        added: [{ date: '2027-10-01', name: 'Cumpleaños de Norma', type: 'observance' }],
        removed: ['2027-12-08'],
        renamed: { '2027-05-01': 'Día del Trabajo' },
      },
    });
    expect(map.get('2027-03-25')?.[0]?.type).toBe('bank'); // Jueves Santo
    expect(map.has('2027-12-08')).toBe(false);
    expect(map.get('2027-05-01')?.[0]?.name).toBe('Día del Trabajo');
    expect(map.get('2027-10-01')?.[0]?.custom).toBe(true);
  });

  it('nombres en italiano caen en el nombre local cuando no hay traducción real', () => {
    const map = computeHolidays(ar, { types: ['public'], lang: 'it', from: '2027-07-09', to: '2027-07-09' });
    expect(map.get('2027-07-09')?.[0]?.name).toBe('Día de la Independencia');
    const ny = computeHolidays(ar, { types: ['public'], lang: 'it', from: '2027-01-01', to: '2027-01-01' });
    expect(ny.get('2027-01-01')?.[0]?.name).toBe('Capodanno');
  });

  it('subdivisiones: Madrid suma su día y une el original con su traslado', () => {
    const es = loadHolidays('ES');
    const map = computeHolidays(es, { subdivision: 'MD', types: ['public'], lang: 'es', from: '2027-05-01', to: '2027-05-31' });
    expect(map.get('2027-05-03')).toHaveLength(1);
    expect(map.get('2027-05-03')?.[0]?.name).toBe('Día de la Comunidad de Madrid');
    // San Isidro es fiesta local (tipo «observance»): aparece solo si se pide ese tipo.
    const withObs = computeHolidays(es, { subdivision: 'MD', types: ['public', 'observance'], lang: 'es', from: '2027-05-01', to: '2027-05-31' });
    expect([...withObs.values()].flat().some((h) => h.name.includes('San Isidro'))).toBe(true);
  });

  it('los feriados quedan dentro del calendario', () => {
    const cal = buildCalendar(base(2027), {
      holidays: (from, to) => computeHolidays(ar, { types: ['public'], lang: 'es', from, to }),
      personalDates: [{ id: 'n', month: 10, day: 1, label: 'Cumpleaños de Norma', kind: 'birthday' }],
      moon: null,
    });
    expect(cal.day('2027-07-09')!.holidays[0]!.name).toBe('Día de la Independencia');
    expect(cal.day('2027-10-01')!.events[0]!.label).toBe('Cumpleaños de Norma');
  });
});

describe('fases lunares', () => {
  it('encuentra ~4 fases por mes en el huso horario pedido', () => {
    const map = moonPhases('2027-01-01', '2027-12-31', 'America/Argentina/Buenos_Aires');
    expect(map.size).toBeGreaterThanOrEqual(48);
    expect(map.size).toBeLessThanOrEqual(51);
    const kinds = new Set(map.values());
    expect(kinds).toEqual(new Set(['new', 'first', 'full', 'last']));
  });
});
