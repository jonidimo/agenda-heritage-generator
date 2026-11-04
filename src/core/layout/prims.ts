/**
 * Primitivas gráficas en milímetros. Son el único lenguaje entre las
 * secciones y los dibujantes (SVG para la pantalla, Canvas para miniaturas,
 * pdfkit para el PDF): lo que se ve es exactamente lo que se imprime.
 */
import type { ShapedRun } from '../text/shape';
import { transformRect, type Matrix, type Rect } from '../util/geometry';

export interface Stroke {
  color: string;
  /** Grosor en mm. */
  width: number;
  /** Patrón de guiones en mm. */
  dash?: readonly number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  opacity?: number;
}

export interface Fill {
  color: string;
  opacity?: number;
}

export interface LinePrim {
  t: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Stroke;
}

export interface RectPrim {
  t: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  fill?: Fill;
  stroke?: Stroke;
}

export interface CirclePrim {
  t: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill?: Fill;
  stroke?: Stroke;
}

/** Trazado SVG (`d`). Si tiene `m`, sus coordenadas son locales y se transforman con esa matriz. */
export interface PathPrim {
  t: 'path';
  d: string;
  m?: Matrix;
  fill?: Fill;
  stroke?: Stroke;
  rule?: 'nonzero' | 'evenodd';
}

/** Muchos puntos del mismo radio (cuadrículas de puntos): pares x,y en un solo arreglo. */
export interface DotsPrim {
  t: 'dots';
  pts: number[];
  r: number;
  color: string;
  opacity?: number;
}

/** Línea de texto ya conformada; (x, y) es el origen sobre la línea de base. */
export interface TextPrim {
  t: 'text';
  run: ShapedRun;
  x: number;
  y: number;
  color: string;
  opacity?: number;
}

export interface ImagePrim {
  t: 'image';
  asset: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;
}

/** Página de un PDF importado (se incrusta vectorial, sin pérdida). */
export interface PdfPrim {
  t: 'pdf';
  asset: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;
}

export interface GroupPrim {
  t: 'group';
  children: Prim[];
  m?: Matrix;
  opacity?: number;
  clip?: Rect;
}

export type Prim = LinePrim | RectPrim | CirclePrim | PathPrim | DotsPrim | TextPrim | ImagePrim | PdfPrim | GroupPrim;

export type BlockRole = 'content' | 'decoration' | 'watermark' | 'custom' | 'artwork' | 'chrome';

/** Unidad editable de una página: se puede seleccionar, mover, escalar u ocultar. */
export interface Block {
  /** Identificador estable dentro del tipo de página (p. ej. `header.title`, `day.3.label`). */
  id: string;
  label: string;
  /** Caja sin transformar, en mm de página. */
  bbox: Rect;
  prims: Prim[];
  role: BlockRole;
  editable: boolean;
  /** Orden de apilado: 0 fondo, 10 contenido, 20 por encima (marcas de agua). */
  layer: number;
  /** Transformación final (ajustes del editor). */
  m?: Matrix;
  opacity?: number;
}

export type Side = 'recto' | 'verso';

export interface PageModel {
  key: string;
  type: string;
  /** Posición 0-based en la agenda. */
  index: number;
  side: Side;
  w: number;
  h: number;
  /** Caja de contenido (márgenes ya aplicados, espejados según recto/verso). */
  content: Rect;
  title: string;
  group: string;
  blocks: Block[];
  warnings: PageWarning[];
}

/** Códigos estables de aviso: la interfaz los traduce; `message` queda en español para la CLI. */
export type WarningCode =
  | 'layoutError'
  | 'clamped'
  | 'offPage'
  | 'nonPrintable'
  | 'overlap'
  | 'lowDpi'
  | 'missingGlyphs'
  | 'textOverflow'
  | 'missingAsset'
  | 'pdfPageRange'
  | 'holidaysMissing'
  | 'holidaysRange'
  /** Informativo: un texto (feriado, fecha propia) se abrevió con «…» para entrar. */
  | 'abbreviated';

export interface PageWarning {
  code: WarningCode;
  /** Datos del aviso (id y nombre del bloque, textos, valores). */
  params: Record<string, string | number>;
  message: string;
}

/* ---------- Constructores breves ---------- */

export const line = (x1: number, y1: number, x2: number, y2: number, stroke: Stroke): LinePrim => ({ t: 'line', x1, y1, x2, y2, stroke });
export const rect = (r: Rect, style: { fill?: Fill; stroke?: Stroke; r?: number }): RectPrim => ({ t: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, ...style });
export const circle = (cx: number, cy: number, r: number, style: { fill?: Fill; stroke?: Stroke }): CirclePrim => ({ t: 'circle', cx, cy, r, ...style });
export const group = (children: Prim[], extra: Omit<GroupPrim, 't' | 'children'> = {}): GroupPrim => ({ t: 'group', children, ...extra });

/** Caja envolvente de un conjunto de primitivas (aplica las transformaciones de los grupos). */
export function primsBounds(prims: Prim[]): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (r: Rect): void => {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  };
  const box = (ax: number, ay: number, bx: number, by: number): Rect => ({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
  const own = (p: Prim): Rect | null => {
    switch (p.t) {
      case 'line':
        return box(p.x1, p.y1, p.x2, p.y2);
      case 'rect':
      case 'image':
      case 'pdf':
        return { x: p.x, y: p.y, w: p.w, h: p.h };
      case 'circle':
        return { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r };
      case 'dots': {
        let a = Infinity;
        let b = Infinity;
        let c = -Infinity;
        let d = -Infinity;
        for (let i = 0; i < p.pts.length; i += 2) {
          a = Math.min(a, p.pts[i]! - p.r);
          b = Math.min(b, p.pts[i + 1]! - p.r);
          c = Math.max(c, p.pts[i]! + p.r);
          d = Math.max(d, p.pts[i + 1]! + p.r);
        }
        return Number.isFinite(a) ? { x: a, y: b, w: c - a, h: d - b } : null;
      }
      case 'text':
        return { x: p.x, y: p.y - p.run.ascent, w: p.run.width, h: p.run.ascent - p.run.descent };
      case 'path':
        return null;
      case 'group': {
        const inner = primsBounds(p.children);
        if (!inner) return null;
        return p.m ? transformRect(p.m, inner) : inner;
      }
    }
  };
  for (const p of prims) {
    const r = own(p);
    if (r) add(r);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
