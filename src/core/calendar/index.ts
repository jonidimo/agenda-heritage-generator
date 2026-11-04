/**
 * Modelo de calendario de la agenda: meses, semanas y días con feriados,
 * fechas personales y fases lunares. Es la única fuente de fechas para todas
 * las secciones (no hay años ni nombres cableados en las plantillas).
 */
import type { Holiday } from '../holidays';
import {
  addMonths,
  daysInMonth,
  fromDayNumber,
  isoFromDayNumber,
  isoWeek,
  isoWeekday,
  monthKey,
  toDayNumber,
} from '../util/dates';
import { monthNames } from './locale';
import type { MoonPhase } from './moon';

export type { MoonPhase } from './moon';

export interface PersonalDate {
  id: string;
  month: number;
  day: number;
  /** Si se indica, solo ese año; si no, se repite todos los años. */
  year?: number | null;
  label: string;
  kind: 'birthday' | 'anniversary' | 'reminder' | 'other';
}

export interface DayInfo {
  iso: string;
  n: number;
  y: number;
  m: number;
  d: number;
  /** 1 = lunes … 7 = domingo. */
  dow: number;
  isWeekend: boolean;
  holidays: Holiday[];
  events: PersonalDate[];
  moon: MoonPhase | null;
}

export interface WeekInfo {
  /** Clave semántica estable: AAAA-Wnn (año y número ISO) o AAAA-Snn (numeración simple). */
  key: string;
  number: number;
  days: DayInfo[];
  /** Mes dueño (el del 4.º día de la semana: jueves en semanas que empiezan el lunes). */
  owner: { y: number; m: number };
  /** «Diciembre / Enero» cuando la semana cruza meses. */
  label: string;
}

export interface MonthInfo {
  key: string;
  y: number;
  m: number;
  name: string;
  days: DayInfo[];
  weeks: WeekInfo[];
  /** Grilla calendario completa (semanas visibles, con días de meses vecinos). */
  grid: DayInfo[][];
}

export interface CalendarOptions {
  year: number;
  startMonth: number;
  monthCount: number;
  /** 1 = lunes, 7 = domingo. */
  weekStart: number;
  weekend: number[];
  numbering: 'iso' | 'simple' | 'none';
  locale: string;
}

export interface CalendarModel {
  options: CalendarOptions;
  months: MonthInfo[];
  weeks: WeekInfo[];
  /** Primer y último día que puede aparecer en alguna página (incluye semanas de borde). */
  range: { from: string; to: string };
  day(iso: string): DayInfo | undefined;
  /** Mini-mes de cualquier año/mes (para vistas anuales del año siguiente). */
  monthGrid(y: number, m: number): DayInfo[][];
}

export interface CalendarSources {
  holidays: (from: string, to: string) => Map<string, Holiday[]>;
  personalDates: PersonalDate[];
  moon: ((from: string, to: string) => Map<string, MoonPhase>) | null;
}

/** Rango de fechas que necesita el calendario (para pedir feriados y lunas una sola vez). */
export function calendarRange(opts: CalendarOptions, extraYears = 1): { from: string; to: string } {
  const first = toDayNumber(opts.year, opts.startMonth, 1);
  const lastMonth = addMonths(opts.year, opts.startMonth, opts.monthCount - 1);
  const last = toDayNumber(lastMonth.y, lastMonth.m, daysInMonth(lastMonth.y, lastMonth.m));
  const fromN = first - 14;
  const end = addMonths(lastMonth.y, lastMonth.m, 12 * extraYears);
  const toN = Math.max(last + 14, toDayNumber(end.y, end.m, daysInMonth(end.y, end.m)));
  return { from: isoFromDayNumber(fromN), to: isoFromDayNumber(toN) };
}

export function buildCalendar(opts: CalendarOptions, sources: CalendarSources): CalendarModel {
  const range = calendarRange(opts);
  const holidays = sources.holidays(range.from, range.to);
  const moons = sources.moon ? sources.moon(range.from, range.to) : new Map<string, MoonPhase>();
  const weekend = new Set(opts.weekend);
  const names = monthNames(opts.locale);
  const dayCache = new Map<number, DayInfo>();

  const makeDay = (n: number): DayInfo => {
    const hit = dayCache.get(n);
    if (hit) return hit;
    const { y, m, d } = fromDayNumber(n);
    const iso = isoFromDayNumber(n);
    const dow = isoWeekday(n);
    const day: DayInfo = {
      iso,
      n,
      y,
      m,
      d,
      dow,
      isWeekend: weekend.has(dow),
      holidays: holidays.get(iso) ?? [],
      events: sources.personalDates.filter((p) => p.month === m && p.day === d && (p.year == null || p.year === y)),
      moon: moons.get(iso) ?? null,
    };
    dayCache.set(n, day);
    return day;
  };

  const weekStartOf = (n: number): number => {
    const dow = isoWeekday(n);
    const offset = (dow - opts.weekStart + 7) % 7;
    return n - offset;
  };

  const monthLabel = (days: DayInfo[]): string => {
    const first = days[0]!;
    const last = days[days.length - 1]!;
    const a = names[first.m - 1] ?? '';
    const b = names[last.m - 1] ?? '';
    return first.m === last.m ? a : `${a} / ${b}`;
  };

  const months: MonthInfo[] = [];
  const allWeeks: WeekInfo[] = [];
  const seenWeeks = new Set<number>();
  let simpleCounter = 0;

  for (let i = 0; i < opts.monthCount; i++) {
    const { y, m } = addMonths(opts.year, opts.startMonth, i);
    const dim = daysInMonth(y, m);
    const firstN = toDayNumber(y, m, 1);
    const lastN = firstN + dim - 1;
    const days = Array.from({ length: dim }, (_, k) => makeDay(firstN + k));

    const grid: DayInfo[][] = [];
    for (let ws = weekStartOf(firstN); ws <= lastN; ws += 7) grid.push(Array.from({ length: 7 }, (_, k) => makeDay(ws + k)));

    const weeks: WeekInfo[] = [];
    const isFirstMonth = i === 0;
    const isLastMonth = i === opts.monthCount - 1;
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]!;
      const owner = row[3]!;
      const owned = owner.m === m && owner.y === y;
      // Semanas de borde: la que contiene el día 1 del primer mes y la que contiene el
      // último día del último mes se incluyen aunque su jueves caiga en el mes vecino
      // (p. ej. 1–3 de enero de 2027 pertenecen a la semana ISO 53 de 2026).
      const boundary = (isFirstMonth && r === 0) || (isLastMonth && r === grid.length - 1);
      if (!owned && !boundary) continue;
      const startN = row[0]!.n;
      if (seenWeeks.has(startN)) continue;
      seenWeeks.add(startN);
      simpleCounter++;
      const iw = isoWeek(row.find((d) => d.dow === 1)?.n ?? owner.n);
      const number = opts.numbering === 'simple' ? simpleCounter : iw.week;
      const key = opts.numbering === 'simple' ? `${opts.year}-S${String(simpleCounter).padStart(2, '0')}` : `${iw.year}-W${String(iw.week).padStart(2, '0')}`;
      const week: WeekInfo = { key, number, days: row, owner: { y, m }, label: monthLabel(row) };
      weeks.push(week);
      allWeeks.push(week);
    }
    months.push({ key: monthKey(y, m), y, m, name: names[m - 1] ?? '', days, weeks, grid });
  }

  return {
    options: opts,
    months,
    weeks: allWeeks,
    range,
    day: (iso: string) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      return makeDay(toDayNumber(yy!, mm!, dd!));
    },
    monthGrid: (y: number, m: number) => {
      const firstN = toDayNumber(y, m, 1);
      const lastN = firstN + daysInMonth(y, m) - 1;
      const rows: DayInfo[][] = [];
      for (let ws = weekStartOf(firstN); ws <= lastN; ws += 7) rows.push(Array.from({ length: 7 }, (_, k) => makeDay(ws + k)));
      return rows;
    },
  };
}

/** Orden de días de la semana según el día de inicio (ISO 1..7). */
export function weekOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStart - 1 + i) % 7) + 1);
}
