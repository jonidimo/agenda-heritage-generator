/**
 * Datos de trazado SVG (el atributo `d`) escritos a mano o por un modelo de lenguaje: se leen con
 * todos sus comandos (M L H V C S Q T A Z, absolutos y relativos) y se dejan en una forma mínima de
 * solo M, L, C y Z con coordenadas absolutas. Así cualquier dibujante (PDF, canvas, SVG) los entiende
 * igual, se pueden escalar punto por punto y se sabe exactamente cuál es su caja.
 */
import type { Point } from './geometry';

export type PathSeg = { c: 'M' | 'L'; p: Point } | { c: 'C'; p1: Point; p2: Point; p: Point } | { c: 'Z' };

/** Límites para que un archivo no pueda pedir un trazado desmesurado. */
export const PATH_LIMITS = { chars: 8000, commands: 2000 } as const;

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Los números y comandos del texto, o `null` si hay algo que no es parte de un trazado. */
function tokenize(d: string): Array<string | number> | null {
  const out: Array<string | number> = [];
  const re = /\s*(?:([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?))\s*,?/y;
  let i = 0;
  while (i < d.length) {
    re.lastIndex = i;
    const m = re.exec(d);
    if (!m || m[0].length === 0) {
      if (/^\s*$/.test(d.slice(i))) break;
      return null;
    }
    if (m[1]) out.push(m[1]);
    else out.push(Number(m[2]));
    i = re.lastIndex;
  }
  return out;
}

/** Un arco elíptico de SVG como cúbicas (de a lo sumo 90° cada una), según el apéndice de implementación de SVG. */
function arcToCubics(from: Point, rx: number, ry: number, phiDeg: number, largeArc: boolean, sweep: boolean, to: Point): PathSeg[] {
  if (from.x === to.x && from.y === to.y) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [{ c: 'L', p: to }];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const h = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Point => ({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos });
  const deriv = (t: number): Point => ({ x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos });
  const segs: PathSeg[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const pa = at(a);
    const pb = i === n - 1 ? to : at(b);
    const da = deriv(a);
    const db = deriv(b);
    segs.push({ c: 'C', p1: { x: pa.x + h * da.x, y: pa.y + h * da.y }, p2: { x: pb.x - h * db.x, y: pb.y - h * db.y }, p: pb });
  }
  return segs;
}

/** Lee un trazado SVG; `null` si no es válido, está vacío o pasa los límites. */
export function parsePathData(d: string): PathSeg[] | null {
  if (d.length > PATH_LIMITS.chars) return null;
  const tokens = tokenize(d);
  if (!tokens || tokens.length === 0 || typeof tokens[0] !== 'string' || tokens[0].toUpperCase() !== 'M') return null;
  const segs: PathSeg[] = [];
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastCtrl: Point | null = null;
  let lastQuad: Point | null = null;
  let i = 0;
  let cmd = '';
  let commands = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (typeof tk === 'string') {
      cmd = tk;
      i++;
      if (cmd.toUpperCase() === 'Z') {
        segs.push({ c: 'Z' });
        cur = start;
        lastCtrl = lastQuad = null;
        if (++commands > PATH_LIMITS.commands) return null;
        continue;
      }
    } else if (!cmd || cmd.toUpperCase() === 'Z') return null;
    const up = cmd.toUpperCase();
    const n = ARGS[up]!;
    const nums = tokens.slice(i, i + n);
    if (nums.length < n || nums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
    const a = nums as number[];
    i += n;
    if (++commands > PATH_LIMITS.commands) return null;
    const rel = cmd !== up;
    const pt = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    let quad: Point | null = null;
    let ctrl: Point | null = null;
    switch (up) {
      case 'M':
        cur = start = pt(a[0]!, a[1]!);
        segs.push({ c: 'M', p: cur });
        // Los pares que siguen a un M son líneas.
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        cur = pt(a[0]!, a[1]!);
        segs.push({ c: 'L', p: cur });
        break;
      case 'H':
        cur = { x: rel ? cur.x + a[0]! : a[0]!, y: cur.y };
        segs.push({ c: 'L', p: cur });
        break;
      case 'V':
        cur = { x: cur.x, y: rel ? cur.y + a[0]! : a[0]! };
        segs.push({ c: 'L', p: cur });
        break;
      case 'C': {
        const p1 = pt(a[0]!, a[1]!);
        const p2 = pt(a[2]!, a[3]!);
        const p = pt(a[4]!, a[5]!);
        segs.push({ c: 'C', p1, p2, p });
        ctrl = p2;
        cur = p;
        break;
      }
      case 'S': {
        const p1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const p2 = pt(a[0]!, a[1]!);
        const p = pt(a[2]!, a[3]!);
        segs.push({ c: 'C', p1, p2, p });
        ctrl = p2;
        cur = p;
        break;
      }
      case 'Q':
      case 'T': {
        const q: Point = up === 'Q' ? pt(a[0]!, a[1]!) : lastQuad ? { x: 2 * cur.x - lastQuad.x, y: 2 * cur.y - lastQuad.y } : cur;
        const p = up === 'Q' ? pt(a[2]!, a[3]!) : pt(a[0]!, a[1]!);
        // Una cuadrática es una cúbica con los controles a 2/3 del camino hacia su control.
        segs.push({ c: 'C', p1: { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) }, p2: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p });
        quad = q;
        cur = p;
        break;
      }
      case 'A': {
        const p = pt(a[5]!, a[6]!);
        segs.push(...arcToCubics(cur, a[0]!, a[1]!, a[2]!, a[3] !== 0, a[4] !== 0, p));
        cur = p;
        break;
      }
    }
    lastCtrl = ctrl;
    lastQuad = quad;
  }
  return segs.some((s) => s.c !== 'M') ? segs : null;
}

/** Los segmentos con cada punto pasado por `f` (para escalar o mover). */
export function mapPath(segs: readonly PathSeg[], f: (p: Point) => Point): PathSeg[] {
  return segs.map((s) => (s.c === 'Z' ? s : s.c === 'C' ? { c: 'C', p1: f(s.p1), p2: f(s.p2), p: f(s.p) } : { c: s.c, p: f(s.p) }));
}

/** Todos los puntos (con los de control: una cúbica queda dentro de su envoltura). */
export function pathPoints(segs: readonly PathSeg[]): Point[] {
  return segs.flatMap((s) => (s.c === 'Z' ? [] : s.c === 'C' ? [s.p1, s.p2, s.p] : [s.p]));
}

/** El texto `d`, con los números redondeados a milésimas. */
export function pathToString(segs: readonly PathSeg[], digits = 3): string {
  const n = (v: number): string => {
    const r = Number(v.toFixed(digits));
    return Object.is(r, -0) ? '0' : String(r);
  };
  return segs.map((s) => (s.c === 'Z' ? 'Z' : s.c === 'C' ? `C ${n(s.p1.x)} ${n(s.p1.y)} ${n(s.p2.x)} ${n(s.p2.y)} ${n(s.p.x)} ${n(s.p.y)}` : `${s.c} ${n(s.p.x)} ${n(s.p.y)}`)).join(' ');
}
