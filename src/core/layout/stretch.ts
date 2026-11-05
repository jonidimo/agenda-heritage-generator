/**
 * Estirar un bloque ya dibujado a otra caja, sin deformar lo que no debe deformarse.
 *
 * Es lo que pasa con un elemento del programa que el usuario cambia de tamaño y cuya sección no lo
 * vuelve a maquetar dentro de la caja nueva (para eso está `LayoutContext.rect`). Como en un editor
 * de diseño, una cosa es el espacio y otra lo que hay en él:
 *  - lo que marca el espacio se estira: líneas (sus extremos), recuadros, cuadrículas de puntos;
 *  - lo que tiene tamaño propio sigue siendo igual de grande y solo cambia de lugar (acompaña el
 *    punto proporcional que ocupaba): el texto (por su ancla: el inicio, el centro o el final, según
 *    su alineación), los círculos, los trazados (íconos, ornamentos), las imágenes.
 * Así los trazos conservan su grosor, las letras su forma y los íconos su proporción.
 */
import { applyToPoint, compose, translate, type Rect } from '../util/geometry';
import { primsBounds, type Prim, type TextPrim } from './prims';

/** Un lado menor que esto no se estira (una línea horizontal no tiene alto que cambiar). */
const EPS = 1e-6;

/** Correspondencia entre dos cajas: lleva un punto de `from` al punto proporcional de `to`. */
export interface BoxMap {
  x(x: number): number;
  y(y: number): number;
  /** Factor de cada eje (1 si ese lado no tiene tamaño). */
  sx: number;
  sy: number;
}

export function boxMap(from: Rect, to: Rect): BoxMap {
  const sx = from.w > EPS ? to.w / from.w : 1;
  const sy = from.h > EPS ? to.h / from.h : 1;
  return { x: (x) => to.x + (x - from.x) * sx, y: (y) => to.y + (y - from.y) * sy, sx, sy };
}

/** El texto sigue a su ancla; su tamaño no cambia. */
function stretchText(p: TextPrim, m: BoxMap): TextPrim {
  const w = p.run.width;
  const anchor = p.anchor ?? 'start';
  const offset = anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0;
  return { ...p, x: m.x(p.x + offset) - offset, y: m.y(p.y) };
}

/** Primer punto de un trazado (todos los que dibuja el programa empiezan con `M x y`). */
function pathStart(d: string): { x: number; y: number } | null {
  const hit = /^\s*M\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)[\s,]+(-?\d*\.?\d+(?:e[-+]?\d+)?)/i.exec(d);
  return hit ? { x: Number(hit[1]), y: Number(hit[2]) } : null;
}

/** Cambia de lugar una forma rígida: el centro de su caja `at` va a donde lo lleva la correspondencia. */
function shiftOf(at: Rect, m: BoxMap): { x: number; y: number } {
  const cx = at.x + at.w / 2;
  const cy = at.y + at.h / 2;
  return { x: m.x(cx) - cx, y: m.y(cy) - cy };
}

/** Estira primitivas de la caja `from` a la caja `to` (ver arriba qué se estira y qué solo se mueve). */
export function stretchPrims(prims: readonly Prim[], from: Rect, to: Rect): Prim[] {
  const m = boxMap(from, to);
  if (m.sx === 1 && m.sy === 1 && from.x === to.x && from.y === to.y) return [...prims];
  return prims.map((p) => stretchPrim(p, m));
}

function stretchPrim(p: Prim, m: BoxMap): Prim {
  switch (p.t) {
    case 'line':
      return { ...p, x1: m.x(p.x1), y1: m.y(p.y1), x2: m.x(p.x2), y2: m.y(p.y2) };
    case 'rect': {
      const x0 = m.x(p.x);
      const y0 = m.y(p.y);
      return { ...p, x: x0, y: y0, w: m.x(p.x + p.w) - x0, h: m.y(p.y + p.h) - y0 };
    }
    case 'dots': {
      const pts = p.pts.slice();
      for (let i = 0; i < pts.length; i += 2) {
        pts[i] = m.x(pts[i]!);
        pts[i + 1] = m.y(pts[i + 1]!);
      }
      return { ...p, pts };
    }
    case 'circle':
      return { ...p, cx: m.x(p.cx), cy: m.y(p.cy) };
    case 'text':
      return stretchText(p, m);
    case 'image':
    case 'pdf': {
      const s = shiftOf(p, m);
      return { ...p, x: p.x + s.x, y: p.y + s.y };
    }
    case 'path': {
      // Rígido: se mueve con su punto de partida (en página, pasando por su matriz local si la tiene).
      const start = pathStart(p.d);
      if (!start) return p;
      const at = p.m ? applyToPoint(p.m, start.x, start.y) : start;
      const s = { x: m.x(at.x) - at.x, y: m.y(at.y) - at.y };
      const shift = translate(s.x, s.y);
      return { ...p, m: p.m ? compose(shift, p.m) : shift };
    }
    case 'group': {
      if (!p.m && !p.clip) return { ...p, children: p.children.map((c) => stretchPrim(c, m)) };
      // Con matriz propia (texto girado, mosaicos) o recorte, el grupo se mueve entero. El recorte
      // está en el espacio del grupo, así que acompaña a su matriz.
      const own = primsBounds([p]);
      if (!own) return p;
      const s = shiftOf(own, m);
      const shift = translate(s.x, s.y);
      return { ...p, m: p.m ? compose(shift, p.m) : shift };
    }
  }
}

/** Estira una zona tocable (enlace) de `from` a `to`. */
export function stretchRect(r: Rect, from: Rect, to: Rect): Rect {
  const m = boxMap(from, to);
  const x0 = m.x(r.x);
  const y0 = m.y(r.y);
  return { x: x0, y: y0, w: m.x(r.x + r.w) - x0, h: m.y(r.y + r.h) - y0 };
}
