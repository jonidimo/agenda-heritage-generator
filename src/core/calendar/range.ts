/**
 * El rango de meses de una agenda (`year`, `startMonth`, `monthCount`) y lo que se puede hacer con él
 * sin tocar las fechas de los demás meses: listarlos y recortar el primero o el último.
 */
import { addMonths, monthKey } from '../util/dates';

export interface MonthRange {
  year: number;
  startMonth: number;
  monthCount: number;
}

/** Las claves (`2027-03`) de todos los meses del rango, también los ocultos. */
export function monthKeysOf(range: MonthRange): string[] {
  return Array.from({ length: range.monthCount }, (_, i) => {
    const { y, m } = addMonths(range.year, range.startMonth, i);
    return monthKey(y, m);
  });
}

/**
 * El rango sin su primer o su último mes. El año de la agenda es el del primer mes: al quitarlo, el
 * segundo pasa a ser el primero. Con un solo mes no se puede quitar nada (`null`).
 */
export function trimmedRange(range: MonthRange, edge: 'first' | 'last'): MonthRange | null {
  if (range.monthCount <= 1) return null;
  if (edge === 'last') return { ...range, monthCount: range.monthCount - 1 };
  const next = addMonths(range.year, range.startMonth, 1);
  return { year: next.y, startMonth: next.m, monthCount: range.monthCount - 1 };
}
