/**
 * Alinear y distribuir elementos (en mm de página). Funciones puras: reciben las cajas de los
 * elementos y devuelven cuánto mover cada uno; el editor aplica todos los movimientos de una vez.
 */
import type { Rect } from '../util/geometry';

export interface Delta {
  dx: number;
  dy: number;
}

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom';

const none = (rects: Rect[]): Delta[] => rects.map(() => ({ dx: 0, dy: 0 }));

/** Caja que contiene a todas. */
export function unionRect(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Alinea cada elemento con un borde o el centro de la referencia (la selección, los márgenes o la página). */
export function alignDeltas(rects: Rect[], mode: AlignMode, ref: Rect): Delta[] {
  return rects.map((r) => {
    switch (mode) {
      case 'left':
        return { dx: ref.x - r.x, dy: 0 };
      case 'centerH':
        return { dx: ref.x + ref.w / 2 - (r.x + r.w / 2), dy: 0 };
      case 'right':
        return { dx: ref.x + ref.w - (r.x + r.w), dy: 0 };
      case 'top':
        return { dx: 0, dy: ref.y - r.y };
      case 'middle':
        return { dx: 0, dy: ref.y + ref.h / 2 - (r.y + r.h / 2) };
      case 'bottom':
        return { dx: 0, dy: ref.y + ref.h - (r.y + r.h) };
    }
  });
}

/**
 * Reparte con espacios iguales entre elementos: el primero y el último quedan donde están y los
 * del medio se acomodan para que todos los huecos midan lo mismo (aunque los tamaños difieran).
 */
export function distributeDeltas(rects: Rect[], axis: 'x' | 'y'): Delta[] {
  if (rects.length < 3) return none(rects);
  const pos = (r: Rect): number => (axis === 'x' ? r.x : r.y);
  const size = (r: Rect): number => (axis === 'x' ? r.w : r.h);
  const order = rects.map((r, i) => ({ r, i })).sort((a, b) => pos(a.r) - pos(b.r));
  const first = order[0]!.r;
  const last = order[order.length - 1]!.r;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - order.reduce((a, o) => a + size(o.r), 0)) / (order.length - 1);
  const out = none(rects);
  let cursor = pos(first);
  for (const o of order) {
    const d = cursor - pos(o.r);
    out[o.i] = axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    cursor += size(o.r) + gap;
  }
  return out;
}

/** Centra el grupo entero (conservando las posiciones relativas) en la referencia. */
export function centerGroupDeltas(rects: Rect[], ref: Rect, axis: 'x' | 'y' | 'both' = 'both'): Delta[] {
  if (rects.length === 0) return [];
  const u = unionRect(rects);
  const dx = axis === 'y' ? 0 : ref.x + ref.w / 2 - (u.x + u.w / 2);
  const dy = axis === 'x' ? 0 : ref.y + ref.h / 2 - (u.y + u.h / 2);
  return rects.map(() => ({ dx, dy }));
}

/** Agrupa valores cercanos (distancia ≤ tol entre vecinos ordenados); devuelve el grupo de cada uno. */
function clusters(values: number[], tol: number): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length).fill(0);
  let group = -1;
  let prev = -Infinity;
  for (const { v, i } of order) {
    if (v - prev > tol) group++;
    out[i] = group;
    prev = v;
  }
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Pasos iguales entre el primer y el último valor (ordenados), conservando los extremos. */
function evenSteps(values: number[]): number[] {
  if (values.length < 3) return values;
  const step = (values[values.length - 1]! - values[0]!) / (values.length - 1);
  return values.map((_, k) => values[0]! + k * step);
}

/**
 * «Ordenar en cuadrícula»: descubre las filas y columnas que los elementos ya insinúan (por
 * cercanía), alinea los bordes izquierdos de cada columna y los superiores de cada fila (a su
 * mediana) y deja pasos iguales entre columnas y entre filas. Así doce meses en dos columnas
 * quedan exactamente alineados aunque uno se haya corrido o agrandado.
 */
export function tidyGridDeltas(rects: Rect[]): Delta[] {
  if (rects.length < 2) return none(rects);
  const minW = Math.min(...rects.map((r) => r.w));
  const minH = Math.min(...rects.map((r) => r.h));
  const col = clusters(rects.map((r) => r.x), Math.max(1, minW / 2));
  const row = clusters(rects.map((r) => r.y), Math.max(1, minH / 2));
  const nCols = Math.max(...col) + 1;
  const nRows = Math.max(...row) + 1;
  const colX = evenSteps(Array.from({ length: nCols }, (_, c) => median(rects.filter((_, i) => col[i] === c).map((r) => r.x))));
  const rowY = evenSteps(Array.from({ length: nRows }, (_, k) => median(rects.filter((_, i) => row[i] === k).map((r) => r.y))));
  return rects.map((r, i) => ({ dx: colX[col[i]!]! - r.x, dy: rowY[row[i]!]! - r.y }));
}
