/**
 * Ayudas de maquetación por cajas (en mm). Son funciones puras: cada sección
 * reparte su espacio con ellas y así se adapta sola a A5, medio Oficio o
 * cualquier tamaño, sin números escritos a mano por formato.
 */
import type { Rect } from '../util/geometry';

/** Tramo de un reparto: tamaño fijo en mm, o flexible con peso. */
export type Track = number | { flex: number; min?: number; max?: number };

export const flex = (weight = 1, min?: number, max?: number): Track => ({ flex: weight, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) });

function distribute(total: number, tracks: Track[], gap: number): number[] {
  const free = total - gap * Math.max(0, tracks.length - 1);
  const fixed = tracks.reduce<number>((s, t) => s + (typeof t === 'number' ? t : 0), 0);
  let remaining = Math.max(0, free - fixed);
  const sizes = tracks.map((t) => (typeof t === 'number' ? t : 0));
  let flexIdx = tracks.map((t, i) => (typeof t === 'number' ? -1 : i)).filter((i) => i >= 0);
  // Reparto iterativo respetando mínimos y máximos.
  for (let guard = 0; guard < 10 && flexIdx.length > 0; guard++) {
    const weight = flexIdx.reduce((s, i) => s + (tracks[i] as { flex: number }).flex, 0) || 1;
    let clamped = false;
    const next: number[] = [];
    for (const i of flexIdx) {
      const t = tracks[i] as { flex: number; min?: number; max?: number };
      const share = (remaining * t.flex) / weight;
      if (t.min !== undefined && share < t.min) {
        sizes[i] = t.min;
        remaining -= t.min;
        clamped = true;
      } else if (t.max !== undefined && share > t.max) {
        sizes[i] = t.max;
        remaining -= t.max;
        clamped = true;
      } else {
        next.push(i);
      }
    }
    if (!clamped) {
      for (const i of next) sizes[i] = (remaining * (tracks[i] as { flex: number }).flex) / weight;
      flexIdx = [];
    } else {
      flexIdx = next;
      remaining = Math.max(0, remaining);
    }
  }
  return sizes;
}

/** Reparte una caja en franjas verticales (de arriba hacia abajo). */
export function vsplit(r: Rect, tracks: Track[], gap = 0): Rect[] {
  const sizes = distribute(r.h, tracks, gap);
  let y = r.y;
  return sizes.map((h) => {
    const out = { x: r.x, y, w: r.w, h };
    y += h + gap;
    return out;
  });
}

/** Reparte una caja en columnas (de izquierda a derecha). */
export function hsplit(r: Rect, tracks: Track[], gap = 0): Rect[] {
  const sizes = distribute(r.w, tracks, gap);
  let x = r.x;
  return sizes.map((w) => {
    const out = { x, y: r.y, w, h: r.h };
    x += w + gap;
    return out;
  });
}

/** N filas iguales. */
export function rows(r: Rect, count: number, gap = 0): Rect[] {
  return vsplit(r, Array.from({ length: Math.max(0, count) }, () => flex()), gap);
}

/** N columnas iguales. */
export function cols(r: Rect, count: number, gap = 0): Rect[] {
  return hsplit(r, Array.from({ length: Math.max(0, count) }, () => flex()), gap);
}

/** Tantas filas de alto `pitch` como entren (alineadas arriba). */
export function repeatRows(r: Rect, pitch: number, opts: { max?: number; min?: number } = {}): Rect[] {
  let n = Math.floor((r.h + 1e-6) / pitch);
  if (opts.max !== undefined) n = Math.min(n, opts.max);
  if (opts.min !== undefined) n = Math.max(n, opts.min);
  return Array.from({ length: n }, (_, i) => ({ x: r.x, y: r.y + i * pitch, w: r.w, h: pitch }));
}

/** Grilla de celdas [fila][columna]. */
export function grid(r: Rect, nCols: number, nRows: number, gapX = 0, gapY = gapX): Rect[][] {
  return rows(r, nRows, gapY).map((row) => cols(row, nCols, gapX));
}

export function inset(r: Rect, top: number, right = top, bottom = top, left = right): Rect {
  return { x: r.x + left, y: r.y + top, w: Math.max(0, r.w - left - right), h: Math.max(0, r.h - top - bottom) };
}

/** Recorta una franja superior de alto `h` y devuelve [franja, resto]. */
export function takeTop(r: Rect, h: number, gap = 0): [Rect, Rect] {
  const top = { x: r.x, y: r.y, w: r.w, h: Math.min(h, r.h) };
  const rest = { x: r.x, y: r.y + top.h + gap, w: r.w, h: Math.max(0, r.h - top.h - gap) };
  return [top, rest];
}

/** Recorta una franja inferior de alto `h` y devuelve [resto, franja]. */
export function takeBottom(r: Rect, h: number, gap = 0): [Rect, Rect] {
  const bottom = { x: r.x, y: r.y + r.h - Math.min(h, r.h), w: r.w, h: Math.min(h, r.h) };
  const rest = { x: r.x, y: r.y, w: r.w, h: Math.max(0, r.h - bottom.h - gap) };
  return [rest, bottom];
}

/** Ajusta un rectángulo de proporción `aspect` (ancho/alto) dentro de `box`. */
export function fitRect(box: Rect, aspect: number, mode: 'contain' | 'cover' | 'fill' = 'contain'): Rect {
  if (mode === 'fill' || !Number.isFinite(aspect) || aspect <= 0) return { ...box };
  const boxAspect = box.w / box.h;
  const useWidth = mode === 'contain' ? aspect >= boxAspect : aspect < boxAspect;
  const w = useWidth ? box.w : box.h * aspect;
  const h = useWidth ? box.w / aspect : box.h;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export function centerIn(box: Rect, w: number, h: number): Rect {
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Lo que el editor le cambió a un elemento: lugar y tamaño de su caja, en mm y ya espejados según la página. */
export interface BoxAdjust {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Ninguna caja se achica por debajo de esto (si ya era más chica, no cambia). */
export const MIN_BOX = 2;

/** Un lado de una caja con su cambio, sin bajar de `MIN_BOX` ni agrandar lo que ya era más chico. */
export function adjustedSize(size: number, delta: number): number {
  return Math.max(Math.min(size, MIN_BOX), size + delta);
}

/** La caja de un elemento con los ajustes del editor. */
export function adjustBox(base: Rect, a: BoxAdjust): Rect {
  return { x: base.x + a.dx, y: base.y + a.dy, w: adjustedSize(base.w, a.dw), h: adjustedSize(base.h, a.dh) };
}
