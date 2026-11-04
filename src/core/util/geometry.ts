/**
 * Geometría en milímetros. Todo el núcleo trabaja en mm (coma flotante) con el
 * origen arriba a la izquierda y el eje Y hacia abajo, igual que SVG y que el
 * espacio de usuario de pdfkit. Los puntos tipográficos solo aparecen en los
 * tamaños de letra y en los grosores de línea declarados por los temas.
 */

export const PT_PER_MM = 72 / 25.4;
export const MM_PER_PT = 25.4 / 72;

export const ptToMm = (pt: number): number => pt * MM_PER_PT;
export const mmToPt = (mm: number): number => mm * PT_PER_MM;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Matriz afín [a, b, c, d, e, f]: (x, y) → (a·x + c·y + e, b·x + d·y + f). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Composición `outer ∘ inner`: primero se aplica `inner`, luego `outer`. */
export function compose(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function composeAll(...ms: Matrix[]): Matrix {
  return ms.reduce<Matrix>((acc, m) => compose(acc, m), IDENTITY);
}

export const translate = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scale = (sx: number, sy: number = sx): Matrix => [sx, 0, 0, sy, 0, 0];

/** Rotación en grados; positivo = sentido horario con el eje Y hacia abajo (igual que SVG y pdfkit). */
export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function rotateAround(deg: number, cx: number, cy: number): Matrix {
  return composeAll(translate(cx, cy), rotate(deg), translate(-cx, -cy));
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return IDENTITY;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function applyToPoint(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Caja envolvente de un rectángulo transformado. */
export function transformRect(m: Matrix, r: Rect): Rect {
  const pts = [
    applyToPoint(m, r.x, r.y),
    applyToPoint(m, r.x + r.w, r.y),
    applyToPoint(m, r.x, r.y + r.h),
    applyToPoint(m, r.x + r.w, r.y + r.h),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Escala lineal media de una matriz (para grosores de trazo). */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export function isIdentity(m: Matrix | undefined): boolean {
  if (!m) return true;
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function insetRect(r: Rect, top: number, right: number = top, bottom: number = top, left: number = right): Rect {
  return { x: r.x + left, y: r.y + top, w: Math.max(0, r.w - left - right), h: Math.max(0, r.h - top - bottom) };
}

export function rectContains(outer: Rect, inner: Rect, tolerance = 0.01): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Redondeo estable para serializar (evita "-0" y ruido de coma flotante). */
export function fmt(n: number, digits = 3): string {
  const v = Number(n.toFixed(digits));
  return Object.is(v, -0) ? '0' : String(v);
}

export function matrixToString(m: Matrix, digits = 5): string {
  return m.map((v) => fmt(v, digits)).join(' ');
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
