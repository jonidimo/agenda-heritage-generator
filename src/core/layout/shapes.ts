/**
 * Formas de los elementos «forma»: quince figuras con sus parámetros, como trazados SVG en mm de
 * página. Todo es puro y determinista (los números se redondean a milésimas de mm). El trazo va por
 * dentro de la caja (se descuenta medio grosor), así la forma nunca se sale de lo que se ve elegido (salvo
 * un trazado libre dibujado fuera de su caja de 0 a 100: se respeta lo que se dibujó);
 * los polígonos y las estrellas se estiran hasta llenar la caja (no un círculo inscrito que deja
 * aire), y la elipse y los arcos son cúbicas con el error de siempre (menos de 0,03 %).
 */
import { mapPath, parsePathData, pathToString, type PathSeg } from '../util/pathData';
import type { Point, Rect } from '../util/geometry';

export const SHAPES = ['rect', 'ellipse', 'line', 'arrow', 'triangle', 'diamond', 'polygon', 'star', 'heart', 'ring', 'arc', 'bubble', 'banner', 'cross', 'path'] as const;
export type ShapeKind = (typeof SHAPES)[number];

export const LINE_CAPS = ['none', 'arrow', 'dot'] as const;
export type LineCap = (typeof LINE_CAPS)[number];
export const BUBBLE_SIDES = ['bottom', 'top', 'left', 'right'] as const;
export type BubbleSide = (typeof BUBBLE_SIDES)[number];

/** Rangos de los parámetros (ángulos en grados, proporciones en %, medidas en mm). */
export const SHAPE_RANGES = {
  radius: { min: 0, max: 50 },
  angle: { min: 0, max: 180 },
  head: { min: 10, max: 90 },
  shaft: { min: 10, max: 90 },
  apex: { min: 0, max: 100 },
  sides: { min: 3, max: 24 },
  points: { min: 3, max: 24 },
  inner: { min: 10, max: 90 },
  rotation: { min: -180, max: 180 },
  cornerRadius: { min: 0, max: 50 },
  thickness: { min: 5, max: 95 },
  start: { min: -360, max: 360 },
  sweep: { min: 1, max: 360 },
  tailAt: { min: 0, max: 100 },
  notch: { min: 0, max: 100 },
  arm: { min: 10, max: 90 },
  strokePt: { min: 0, max: 6 },
} as const;

/** Valores por defecto de cada parámetro. */
export const SHAPE_DEFAULTS = {
  radius: 0,
  angle: 0,
  head: 35,
  shaft: 40,
  apex: 50,
  sides: 6,
  points: 5,
  inner: 45,
  rotation: 0,
  cornerRadius: 0,
  thickness: 25,
  start: 0,
  sweep: 270,
  tailAt: 25,
  notch: 25,
  arm: 33,
  strokePt: 0.75,
} as const;

/** Qué parámetros tiene cada forma (el panel muestra solo esos). */
export const SHAPE_PARAMS: Record<ShapeKind, readonly string[]> = {
  rect: ['radius'],
  ellipse: [],
  line: ['angle', 'startCap', 'endCap'],
  arrow: ['head', 'shaft'],
  triangle: ['apex'],
  diamond: [],
  polygon: ['sides', 'rotation', 'cornerRadius'],
  star: ['points', 'inner', 'rotation', 'cornerRadius'],
  heart: [],
  ring: ['thickness'],
  arc: ['start', 'sweep', 'pie'],
  bubble: ['tailSide', 'tailAt', 'radius'],
  banner: ['notch'],
  cross: ['arm'],
  path: ['d'],
};

/** Los parámetros que entiende cada forma (los de un archivo se leen sin confiar: ver `shapeGeometry`). */
export type ShapeParams = {
  radius?: number;
  angle?: number;
  startCap?: LineCap;
  endCap?: LineCap;
  head?: number;
  shaft?: number;
  apex?: number;
  sides?: number;
  points?: number;
  inner?: number;
  rotation?: number;
  cornerRadius?: number;
  thickness?: number;
  start?: number;
  sweep?: number;
  pie?: boolean;
  tailSide?: BubbleSide;
  tailAt?: number;
  notch?: number;
  arm?: number;
  /** Trazado libre en una caja de 0 a 100 (se estira a la del elemento). */
  d?: string;
};

export interface ShapeGeometry {
  /** El contorno (en mm de página); vacío si no hay nada que dibujar. */
  d: string;
  /** Sin relleno: una línea o un arco abierto. */
  open: boolean;
  rule?: 'evenodd';
  /** Las puntas de una línea (flechas y puntos), rellenas con el color del trazo. */
  caps: string[];
}

const KAPPA = 0.5522847498;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const P = (x: number, y: number): Point => ({ x, y });

/** Las propiedades de un elemento tal como vienen del archivo: cada una se comprueba al leerla. */
type RawParams = Readonly<Record<string, unknown>>;

/** El valor de un parámetro dentro de su rango (o el de por defecto). */
function param(p: RawParams, key: keyof typeof SHAPE_RANGES & keyof typeof SHAPE_DEFAULTS): number {
  const v = p[key];
  const r = SHAPE_RANGES[key];
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, r.min, r.max) : SHAPE_DEFAULTS[key];
}

/** Un polígono cerrado de puntos. */
const polygon = (pts: readonly Point[]): PathSeg[] => (pts.length < 2 ? [] : [{ c: 'M', p: pts[0]! }, ...pts.slice(1).map((p): PathSeg => ({ c: 'L', p })), { c: 'Z' }]);

/**
 * Un polígono cerrado con las esquinas redondeadas: en cada vértice, un arco tangente a los dos lados
 * (como cúbica), con el radio acotado para que dos esquinas vecinas nunca se pisen.
 */
function roundedPolygon(pts: readonly Point[], radius: number): PathSeg[] {
  const n = pts.length;
  if (radius <= 0 || n < 3) return polygon(pts);
  const segs: PathSeg[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const v = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const a = { x: prev.x - v.x, y: prev.y - v.y };
    const b = { x: next.x - v.x, y: next.y - v.y };
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la < 1e-9 || lb < 1e-9) {
      segs.push({ c: segs.length === 0 ? 'M' : 'L', p: v });
      continue;
    }
    const ua = { x: a.x / la, y: a.y / la };
    const ub = { x: b.x / lb, y: b.y / lb };
    // Ángulo interior del vértice; el arco abarca lo que le falta para 180°.
    const theta = Math.acos(clamp(ua.x * ub.x + ua.y * ub.y, -1, 1));
    if (theta < 1e-6 || Math.PI - theta < 1e-6) {
      segs.push({ c: segs.length === 0 ? 'M' : 'L', p: v });
      continue;
    }
    // Distancia del vértice a los puntos de tangencia, como mucho media arista de cada lado.
    const tan = Math.min(radius / Math.tan(theta / 2), la / 2, lb / 2);
    const r = tan * Math.tan(theta / 2);
    const handle = (4 / 3) * Math.tan((Math.PI - theta) / 4) * r;
    const p0 = { x: v.x + ua.x * tan, y: v.y + ua.y * tan };
    const p1 = { x: v.x + ub.x * tan, y: v.y + ub.y * tan };
    segs.push({ c: segs.length === 0 ? 'M' : 'L', p: p0 });
    segs.push({ c: 'C', p1: { x: p0.x - ua.x * handle, y: p0.y - ua.y * handle }, p2: { x: p1.x - ub.x * handle, y: p1.y - ub.y * handle }, p: p1 });
  }
  segs.push({ c: 'Z' });
  return segs;
}

/** Una elipse en cuatro cúbicas (sentido horario; con `reverse`, antihorario: para huecos). */
function ellipse(cx: number, cy: number, rx: number, ry: number, reverse = false): PathSeg[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const top = P(cx, cy - ry);
  const right = P(cx + rx, cy);
  const bottom = P(cx, cy + ry);
  const left = P(cx - rx, cy);
  if (!reverse)
    return [
      { c: 'M', p: top },
      { c: 'C', p1: P(cx + kx, cy - ry), p2: P(cx + rx, cy - ky), p: right },
      { c: 'C', p1: P(cx + rx, cy + ky), p2: P(cx + kx, cy + ry), p: bottom },
      { c: 'C', p1: P(cx - kx, cy + ry), p2: P(cx - rx, cy + ky), p: left },
      { c: 'C', p1: P(cx - rx, cy - ky), p2: P(cx - kx, cy - ry), p: top },
      { c: 'Z' },
    ];
  return [
    { c: 'M', p: top },
    { c: 'C', p1: P(cx - kx, cy - ry), p2: P(cx - rx, cy - ky), p: left },
    { c: 'C', p1: P(cx - rx, cy + ky), p2: P(cx - kx, cy + ry), p: bottom },
    { c: 'C', p1: P(cx + kx, cy + ry), p2: P(cx + rx, cy + ky), p: right },
    { c: 'C', p1: P(cx + rx, cy - ky), p2: P(cx + kx, cy - ry), p: top },
    { c: 'Z' },
  ];
}

/** Un arco de elipse de `a0` a `a1` (radianes, 0 arriba y en sentido horario), en cúbicas de a lo sumo 90°. */
function ellipticArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, moveTo: boolean): PathSeg[] {
  const at = (t: number): Point => P(cx + rx * Math.sin(t), cy - ry * Math.cos(t));
  const d = (t: number): Point => P(rx * Math.cos(t), ry * Math.sin(t));
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
  const step = (a1 - a0) / n;
  const h = (4 / 3) * Math.tan(step / 4);
  const segs: PathSeg[] = moveTo ? [{ c: 'M', p: at(a0) }] : [{ c: 'L', p: at(a0) }];
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step;
    const e = s + step;
    const ps = at(s);
    const pe = at(e);
    const ds = d(s);
    const de = d(e);
    segs.push({ c: 'C', p1: P(ps.x + h * ds.x, ps.y + h * ds.y), p2: P(pe.x - h * de.x, pe.y - h * de.y), p: pe });
  }
  return segs;
}

/** Estira unos puntos para que su caja sea exactamente `box` (los polígonos llenan la caja). */
function fitPoints(pts: readonly Point[], box: Rect): Point[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 || 1;
  const h = Math.max(...ys) - y0 || 1;
  return pts.map((p) => P(box.x + ((p.x - x0) / w) * box.w, box.y + ((p.y - y0) / h) * box.h));
}

/** Vértices de un polígono regular (o de una estrella, alternando radios), con el primer lado abajo y horizontal. */
function radialPoints(count: number, rotation: number, inner: number | null): Point[] {
  const total = inner === null ? count : count * 2;
  // Con el primer vértice abajo a la derecha de la mitad de un paso, el lado de abajo queda horizontal.
  const step = (2 * Math.PI) / total;
  // Un polígono apoya un lado abajo; una estrella apunta arriba.
  const base = (inner === null ? Math.PI / 2 + step / 2 : -Math.PI / 2) + (rotation * Math.PI) / 180;
  return Array.from({ length: total }, (_, i) => {
    const r = inner !== null && i % 2 === 1 ? inner : 1;
    const a = base + i * step;
    return P(r * Math.cos(a), r * Math.sin(a));
  });
}

/** La punta de una línea: una flecha (triángulo) o un punto, del tamaño del grosor. */
function lineCap(kind: LineCap, tip: Point, dir: Point, strokeMm: number): string {
  if (kind === 'none') return '';
  const w = Math.max(strokeMm, 0.2);
  if (kind === 'dot') {
    const r = Math.max(w * 1.6, 0.6);
    return pathToString(ellipse(tip.x, tip.y, r, r));
  }
  const len = Math.max(w * 4.5, 1.6);
  const half = Math.max(w * 2, 0.7);
  const back = P(tip.x - dir.x * len, tip.y - dir.y * len);
  const nx = -dir.y;
  const ny = dir.x;
  return pathToString(polygon([tip, P(back.x + nx * half, back.y + ny * half), P(back.x - nx * half, back.y - ny * half)]));
}

/** Cuánto se acorta una línea para que su punta (flecha o punto) entre en la caja. */
function capInset(kind: LineCap, strokeMm: number): number {
  const w = Math.max(strokeMm, 0.2);
  return kind === 'dot' ? Math.max(w * 1.6, 0.6) : 0;
}

/** Un valor de una lista, o el primero. */
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T => (list.find((x) => x === v) ?? list[0]!);

/** El trazado de una forma en su caja (mm de página) con su grosor de trazo (mm); `params` puede venir de un archivo. */
export function shapeGeometry(shape: ShapeKind, box: Rect, params: ShapeParams | RawParams, strokeMm: number): ShapeGeometry {
  const p: RawParams = params;
  const half = Math.max(0, strokeMm) / 2;
  const r: Rect = { x: box.x + half, y: box.y + half, w: Math.max(0.01, box.w - 2 * half), h: Math.max(0.01, box.h - 2 * half) };
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const closed = (segs: PathSeg[], rule?: 'evenodd'): ShapeGeometry => ({ d: pathToString(segs), open: false, caps: [], ...(rule ? { rule } : {}) });
  switch (shape) {
    case 'rect': {
      const rad = Math.min(param(p, 'radius'), r.w / 2, r.h / 2);
      return closed(roundedPolygon([P(r.x, r.y), P(x1, r.y), P(x1, y1), P(r.x, y1)], rad));
    }
    case 'ellipse':
      return closed(ellipse(cx, cy, r.w / 2, r.h / 2));
    case 'line': {
      const startCap = oneOf(p.startCap, LINE_CAPS);
      const endCap = oneOf(p.endCap, LINE_CAPS);
      const a = (param(p, 'angle') * Math.PI) / 180;
      const dir = P(Math.cos(a), Math.sin(a));
      // La línea pasa por el centro y llega hasta el borde de la caja (con el lugar de las puntas).
      const inset = Math.max(capInset(startCap, strokeMm), capInset(endCap, strokeMm));
      const hw = Math.max(0.01, r.w / 2 - inset);
      const hh = Math.max(0.01, r.h / 2 - inset);
      const t = Math.min(Math.abs(dir.x) > 1e-9 ? hw / Math.abs(dir.x) : Infinity, Math.abs(dir.y) > 1e-9 ? hh / Math.abs(dir.y) : Infinity);
      const p0 = P(cx - dir.x * t, cy - dir.y * t);
      const p1 = P(cx + dir.x * t, cy + dir.y * t);
      const caps = [lineCap(startCap, p0, P(-dir.x, -dir.y), strokeMm), lineCap(endCap, p1, dir, strokeMm)].filter(Boolean);
      // Con una flecha, la línea termina donde empieza la punta (si no, el trazo asoma por delante).
      const trim = (kind: LineCap): number => (kind === 'arrow' ? Math.min(Math.max(strokeMm, 0.2) * 3, t) : 0);
      const q0 = P(p0.x + dir.x * trim(startCap), p0.y + dir.y * trim(startCap));
      const q1 = P(p1.x - dir.x * trim(endCap), p1.y - dir.y * trim(endCap));
      return { d: pathToString([{ c: 'M', p: q0 }, { c: 'L', p: q1 }]), open: true, caps };
    }
    case 'arrow': {
      const hl = (param(p, 'head') / 100) * r.w;
      const s = (param(p, 'shaft') / 100) * r.h;
      return closed(polygon([P(r.x, cy - s / 2), P(x1 - hl, cy - s / 2), P(x1 - hl, r.y), P(x1, cy), P(x1 - hl, y1), P(x1 - hl, cy + s / 2), P(r.x, cy + s / 2)]));
    }
    case 'triangle':
      return closed(polygon([P(r.x + (param(p, 'apex') / 100) * r.w, r.y), P(x1, y1), P(r.x, y1)]));
    case 'diamond':
      return closed(polygon([P(cx, r.y), P(x1, cy), P(cx, y1), P(r.x, cy)]));
    case 'polygon': {
      const pts = fitPoints(radialPoints(Math.round(param(p, 'sides')), param(p, 'rotation'), null), r);
      return closed(roundedPolygon(pts, param(p, 'cornerRadius')));
    }
    case 'star': {
      const pts = fitPoints(radialPoints(Math.round(param(p, 'points')), param(p, 'rotation'), param(p, 'inner') / 100), r);
      return closed(roundedPolygon(pts, param(p, 'cornerRadius')));
    }
    case 'heart': {
      // El corazón de las valoraciones, estirado a la caja.
      const s = 1;
      const raw: PathSeg[] = [
        { c: 'M', p: P(0, s * 0.85) },
        { c: 'C', p1: P(-s * 1.25, -s * 0.05), p2: P(-s * 0.75, -s * 1.05), p: P(0, -s * 0.35) },
        { c: 'C', p1: P(s * 0.75, -s * 1.05), p2: P(s * 1.25, -s * 0.05), p: P(0, s * 0.85) },
        { c: 'Z' },
      ];
      return closed(fitSegs(raw, r, segsBounds(raw)));
    }
    case 'ring': {
      const k = 1 - param(p, 'thickness') / 100;
      return closed([...ellipse(cx, cy, r.w / 2, r.h / 2), ...ellipse(cx, cy, (r.w / 2) * k, (r.h / 2) * k, true)], 'evenodd');
    }
    case 'arc': {
      const a0 = (param(p, 'start') * Math.PI) / 180;
      const sweep = (param(p, 'sweep') * Math.PI) / 180;
      if (sweep >= 2 * Math.PI - 1e-9) return p.pie === true ? closed(ellipse(cx, cy, r.w / 2, r.h / 2)) : { d: pathToString(ellipse(cx, cy, r.w / 2, r.h / 2)), open: true, caps: [] };
      const arc = ellipticArc(cx, cy, r.w / 2, r.h / 2, a0, a0 + sweep, p.pie !== true);
      if (p.pie === true) return closed([{ c: 'M', p: P(cx, cy) }, ...arc, { c: 'Z' }]);
      return { d: pathToString(arc), open: true, caps: [] };
    }
    case 'bubble':
      return closed(bubble(r, oneOf(p.tailSide, BUBBLE_SIDES), param(p, 'tailAt') / 100, param(p, 'radius')));
    case 'banner': {
      const depth = Math.min((param(p, 'notch') / 100) * (r.h / 2), r.w * 0.45);
      return closed(polygon([P(r.x, r.y), P(x1, r.y), P(x1 - depth, cy), P(x1, y1), P(r.x, y1), P(r.x + depth, cy)]));
    }
    case 'cross': {
      const k = param(p, 'arm') / 100;
      const vw = r.w * k;
      const hh = r.h * k;
      const ax = cx - vw / 2;
      const bx = cx + vw / 2;
      const ay = cy - hh / 2;
      const by = cy + hh / 2;
      return closed(polygon([P(ax, r.y), P(bx, r.y), P(bx, ay), P(x1, ay), P(x1, by), P(bx, by), P(bx, y1), P(ax, y1), P(ax, by), P(r.x, by), P(r.x, ay), P(ax, ay)]));
    }
    case 'path': {
      const segs = typeof p.d === 'string' ? parsePathData(p.d) : null;
      if (!segs) return { d: '', open: true, caps: [] };
      // El dibujo se pensó en una caja de 0 a 100: se estira a la del elemento.
      const mapped = mapPath(segs, (p) => P(r.x + (p.x / 100) * r.w, r.y + (p.y / 100) * r.h));
      return { d: pathToString(mapped), open: !segs.some((s) => s.c === 'Z'), caps: [] };
    }
  }
}

/** Un punto de una cúbica. */
function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return P(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y);
}

/**
 * La caja que de verdad ocupa un trazado (las curvas se recorren en 64 pasos: los puntos de control
 * pueden quedar afuera de la curva).
 */
export function segsBounds(segs: readonly PathSeg[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Point): void => {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };
  let cur = P(0, 0);
  let start = P(0, 0);
  for (const s of segs) {
    if (s.c === 'Z') {
      cur = start;
      continue;
    }
    if (s.c === 'C') for (let i = 1; i <= 64; i++) add(cubicAt(cur, s.p1, s.p2, s.p, i / 64));
    else add(s.p);
    if (s.c === 'M') start = s.p;
    cur = s.p;
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

/** Estira unos segmentos de la caja `from` a la caja `to`. */
function fitSegs(segs: readonly PathSeg[], to: Rect, from: Rect): PathSeg[] {
  return mapPath(segs, (p) => P(to.x + ((p.x - from.x) / from.w) * to.w, to.y + ((p.y - from.y) / from.h) * to.h));
}

/** Un globo de diálogo: rectángulo redondeado con una cola en un lado, en una sola línea de contorno. */
function bubble(box: Rect, side: BubbleSide, at: number, radius: number): PathSeg[] {
  const vertical = side === 'top' || side === 'bottom';
  const depth = Math.min(box.w, box.h) * 0.22;
  const body: Rect =
    side === 'bottom' ? { ...box, h: box.h - depth } : side === 'top' ? { ...box, y: box.y + depth, h: box.h - depth } : side === 'right' ? { ...box, w: box.w - depth } : { ...box, x: box.x + depth, w: box.w - depth };
  const rad = Math.min(radius, body.w / 2, body.h / 2);
  const len = vertical ? body.w : body.h;
  const base = Math.min(len * 0.18, Math.max(depth, 1));
  // La cola, entre las esquinas redondeadas.
  const room = Math.max(0, len - 2 * rad - base);
  const s = rad + room * clamp(at, 0, 1);
  const bx = body.x;
  const by = body.y;
  const ex = body.x + body.w;
  const ey = body.y + body.h;
  // Las esquinas en sentido horario desde arriba a la izquierda, con la cola en su lado.
  const corners = [P(bx, by), P(ex, by), P(ex, ey), P(bx, ey)];
  const tails: Record<BubbleSide, Point[]> = {
    top: [P(bx + s, by), P(bx + s + base * 0.3, box.y), P(bx + s + base, by)],
    right: [P(ex, by + s), P(box.x + box.w, by + s + base * 0.3), P(ex, by + s + base)],
    bottom: [P(ex - s, ey), P(ex - s - base * 0.3, box.y + box.h), P(ex - s - base, ey)],
    left: [P(bx, ey - s), P(box.x, ey - s - base * 0.3), P(bx, ey - s - base)],
  };
  const sideIndex = { top: 0, right: 1, bottom: 2, left: 3 }[side];
  const pts: Point[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push(corners[i]!);
    if (i === sideIndex) pts.push(...tails[side]);
  }
  // Solo las cuatro esquinas del cuerpo se redondean: la cola queda en punta.
  return roundedCorners(pts, new Set([0, sideIndex === 0 ? 4 : 1, sideIndex <= 1 ? 5 : 2, sideIndex <= 2 ? 6 : 3]), rad);
}

/** Un polígono con algunas esquinas redondeadas (las de `which`, por índice). */
function roundedCorners(pts: readonly Point[], which: ReadonlySet<number>, radius: number): PathSeg[] {
  if (radius <= 0) return polygon(pts);
  const n = pts.length;
  const segs: PathSeg[] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i]!;
    if (!which.has(i)) {
      segs.push({ c: segs.length === 0 ? 'M' : 'L', p: v });
      continue;
    }
    const prev = pts[(i - 1 + n) % n]!;
    const next = pts[(i + 1) % n]!;
    const la = Math.hypot(prev.x - v.x, prev.y - v.y);
    const lb = Math.hypot(next.x - v.x, next.y - v.y);
    const t = Math.min(radius, la / 2, lb / 2);
    // Un lado de largo cero (la cola justo en la esquina): esa esquina queda en punta.
    if (t < 1e-9) {
      segs.push({ c: segs.length === 0 ? 'M' : 'L', p: v });
      continue;
    }
    const ua = P((prev.x - v.x) / la, (prev.y - v.y) / la);
    const ub = P((next.x - v.x) / lb, (next.y - v.y) / lb);
    const p0 = P(v.x + ua.x * t, v.y + ua.y * t);
    const p1 = P(v.x + ub.x * t, v.y + ub.y * t);
    const h = t * (1 - KAPPA);
    segs.push({ c: segs.length === 0 ? 'M' : 'L', p: p0 });
    segs.push({ c: 'C', p1: P(p0.x - ua.x * (t - h), p0.y - ua.y * (t - h)), p2: P(p1.x - ub.x * (t - h), p1.y - ub.y * (t - h)), p: p1 });
  }
  segs.push({ c: 'Z' });
  return segs;
}

/** La caja que ocupa el trazado de una forma, o `null` si no hay trazado. */
export function shapeBounds(d: string): Rect | null {
  const segs = parsePathData(d);
  return segs ? segsBounds(segs) : null;
}
