/** Acciones sobre los meses de la agenda: ocultar, volver a mostrar y recortar el primero o el último. */
import { monthKeysOf, trimmedRange } from '@core/calendar/range';
import { useStore, type Recipe } from './store';

const update = (recipe: Recipe): void => useStore.getState().update(recipe);

/** Meses (`2027-03`) que hoy figuran en la agenda. */
export function visibleMonths(calendar: { year: number; startMonth: number; monthCount: number; hiddenMonths: readonly string[] }): string[] {
  const hidden = new Set(calendar.hiddenMonths);
  return monthKeysOf(calendar).filter((k) => !hidden.has(k));
}

/** ¿Se puede ocultar este mes? Siempre queda al menos uno. */
export function canHideMonth(key: string): boolean {
  const d = useStore.getState().design;
  if (!d) return false;
  const visible = visibleMonths(d.calendar);
  return visible.includes(key) && visible.length > 1;
}

export function hideMonth(key: string): void {
  if (!canHideMonth(key)) return;
  update((d) => void (d.calendar.hiddenMonths = [...new Set([...d.calendar.hiddenMonths, key])].sort()));
}

export function showMonth(key: string): void {
  update((d) => void (d.calendar.hiddenMonths = d.calendar.hiddenMonths.filter((k) => k !== key)));
}

/** Quita el primer o el último mes del rango de la agenda. Devuelve si lo hizo. */
export function trimMonth(edge: 'first' | 'last'): boolean {
  const d = useStore.getState().design;
  const next = d && trimmedRange(d.calendar, edge);
  if (!next) return false;
  update((x) => {
    x.calendar.year = next.year;
    x.calendar.startMonth = next.startMonth;
    x.calendar.monthCount = next.monthCount;
    // Un mes oculto que ya no está en el rango no tiene nada que ocultar.
    const keys = new Set(monthKeysOf(next));
    x.calendar.hiddenMonths = x.calendar.hiddenMonths.filter((k) => keys.has(k));
  });
  return true;
}
