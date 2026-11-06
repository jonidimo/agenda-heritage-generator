/** Pasar de página según la vista: de a una, o de a un pliego (dos páginas enfrentadas). Funciones puras. */
import type { View } from './store';

/** El pliego de una página: la izquierda y la derecha (`null` donde no hay: la primera página es suelta). */
export function spreadOf(index: number, count: number): [number | null, number | null] {
  if (count <= 0) return [null, null];
  if (index <= 0) return [null, 0];
  const left = index % 2 === 1 ? index : index - 1;
  const right = left + 1 < count ? left + 1 : null;
  return [left, right];
}

/** Una posición de página válida para `count` páginas (0 si no hay ninguna: nunca −1). */
export function clampPage(index: number, count: number): number {
  return count > 0 ? Math.min(Math.max(0, Math.floor(index)), count - 1) : 0;
}

/** La página a la que se llega yendo hacia atrás (-1) o hacia adelante (1) desde `index`. */
export function pageStep(view: View, index: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return 0;
  const [left, right] = spreadOf(index, count);
  if (dir < 0) return Math.max(0, view === 'spread' ? (left ?? 0) - 1 : index - 1);
  return Math.min(count - 1, view === 'spread' ? (right ?? index) + 1 : index + 1);
}
