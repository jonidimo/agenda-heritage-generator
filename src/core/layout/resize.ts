/**
 * Redimensionar una caja con un tirador (función pura, en mm de página), como en los editores de
 * diseño: los lados cambian solo el ancho o el alto; las esquinas, los dos libremente, o en
 * proporción si se pide (Mayús). El lado o la esquina opuesta queda fija, la caja nunca baja de un
 * tamaño mínimo y nunca sale de los límites (la página).
 */
import type { Rect } from '../util/geometry';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface ResizeOptions {
  /** Mantener la proporción (solo en las esquinas). */
  keepAspect?: boolean;
  /** Tamaño mínimo de cada lado, en mm. */
  min?: number;
  /** Límites que la caja no puede pasar. */
  bounds?: Rect;
}

export function resizeRect(o: Rect, handle: Handle, dx: number, dy: number, opts: ResizeOptions = {}): Rect {
  const min = opts.min ?? 2;
  const b = opts.bounds ?? { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity };
  const bx1 = b.x + b.w;
  const by1 = b.y + b.h;
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  let x0 = o.x;
  let y0 = o.y;
  let x1 = o.x + o.w;
  let y1 = o.y + o.h;
  if (west) x0 = Math.max(b.x, Math.min(x1 - min, x0 + dx));
  if (east) x1 = Math.min(bx1, Math.max(x0 + min, x1 + dx));
  if (north) y0 = Math.max(b.y, Math.min(y1 - min, y0 + dy));
  if (south) y1 = Math.min(by1, Math.max(y0 + min, y1 + dy));
  const corner = (west || east) && (north || south);
  if (!opts.keepAspect || !corner || o.w <= 0 || o.h <= 0) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  // En proporción: manda el lado que más cambió; la esquina opuesta queda fija y la caja no sale de los límites.
  const ax = west ? o.x + o.w : o.x;
  const ay = north ? o.y + o.h : o.y;
  const roomX = west ? ax - b.x : bx1 - ax;
  const roomY = north ? ay - b.y : by1 - ay;
  const wanted = Math.max((x1 - x0) / o.w, (y1 - y0) / o.h);
  const s = Math.max(min / Math.min(o.w, o.h), Math.min(wanted, roomX / o.w, roomY / o.h));
  const w = o.w * s;
  const h = o.h * s;
  return { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
}
