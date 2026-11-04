/**
 * Fechas civiles sin zona horaria. Se representan como enteros "día juliano
 * proléptico" (número de días desde 1970-01-01) para que sumar días, comparar
 * y agrupar sea exacto y no dependa del huso horario de la máquina.
 */

export interface CivilDate {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

const MS_PER_DAY = 86_400_000;

/** Días desde 1970-01-01 (UTC) para una fecha civil. */
export function toDayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(n: number): CivilDate {
  const dt = new Date(n * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function isoFromDayNumber(n: number): string {
  const { y, m, d } = fromDayNumber(n);
  return isoDate(y, m, d);
}

export function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseIso(iso: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) throw new Error(`Fecha inválida: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function dayNumberFromIso(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return toDayNumber(y, m, d);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(dayNumber: number): number {
  // 1970-01-01 fue jueves (ISO 4).
  return ((((dayNumber + 3) % 7) + 7) % 7) + 1;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Semana ISO 8601 (año ISO y número) de un día. */
export function isoWeek(dayNumber: number): { year: number; week: number } {
  const wd = isoWeekday(dayNumber);
  const thursday = dayNumber + (4 - wd);
  const { y } = fromDayNumber(thursday);
  const jan1 = toDayNumber(y, 1, 1);
  return { year: y, week: Math.floor((thursday - jan1) / 7) + 1 };
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}
