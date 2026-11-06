/**
 * Sello y trazo: un recurso (un ícono, un dibujo, una imagen) repetido a lo largo de un trazo hecho con
 * el mouse, como un pincel de imagen. Las copias se reparten por distancia recorrida (no por cada
 * punto que llega del mouse: un trazo lento y uno rápido dejan lo mismo), pueden girar siguiendo el
 * trazo o al azar, y variar un poco de tamaño y de giro.
 *
 * La variación sale de una semilla: el mismo trazo con la misma semilla da siempre las mismas copias
 * (deshacer y rehacer, o volver a abrir la agenda, no cambia nada).
 *
 * Un trazo entero es un solo elemento «dibujo»: cada copia es un grupo girado con la imagen adentro.
 */
import type { DrawingPrim, DrawingProps } from '../design/drawing';
import { DRAWING_LIMITS } from '../design/drawing';
import { compose, rotate, translate, type Point } from '../util/geometry';

export const STAMP_ROTATIONS = ['none', 'follow', 'random'] as const;
export type StampRotation = (typeof STAMP_ROTATIONS)[number];

export interface StampOptions {
  /** Ancho de cada copia, en mm. */
  size: number;
  /** Distancia entre copias, en veces el ancho (1 = una al lado de la otra). */
  spacing: number;
  rotate: StampRotation;
  /** Cuánto varía cada copia (0 nada, 0,5 mucho): tamaño ±, y en el giro fijo o siguiendo el trazo, ±45°·variación. */
  jitter: number;
  seed: number;
}

export interface Stamp {
  x: number;
  y: number;
  /** Ancho de esta copia (con la variación), en mm. */
  size: number;
  /** Giro en grados. */
  angle: number;
}

export const STAMP_LIMITS = {
  size: { min: 2, max: 60 },
  spacing: { min: 0.2, max: 4 },
  jitter: { min: 0, max: 0.5 },
  /** Más copias que esto no hacen un mejor trazo y pesan en el archivo (cada una es un grupo con su imagen). */
  stamps: Math.floor(DRAWING_LIMITS.prims / 2) - 1,
} as const;

/** Un generador de números al azar con semilla (mulberry32): rápido y siempre igual para la misma semilla. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
const deg = (rad: number): number => (rad * 180) / Math.PI;

/** Las copias a lo largo de un trazo (la primera, en su comienzo). Un trazo de un solo punto deja una copia. */
export function stampsAlong(points: readonly Point[], opts: StampOptions): Stamp[] {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length === 0) return [];
  const size = clamp(opts.size, STAMP_LIMITS.size.min, STAMP_LIMITS.size.max);
  const step = size * clamp(opts.spacing, STAMP_LIMITS.spacing.min, STAMP_LIMITS.spacing.max);
  const jitter = clamp(opts.jitter, STAMP_LIMITS.jitter.min, STAMP_LIMITS.jitter.max);
  const rand = seeded(opts.seed);
  const out: Stamp[] = [];
  const place = (x: number, y: number, tangent: number): void => {
    const vary = (): number => rand() * 2 - 1;
    const s = size * (1 + vary() * jitter);
    const base = opts.rotate === 'follow' ? tangent : opts.rotate === 'random' ? rand() * 360 : 0;
    const angle = opts.rotate === 'random' ? base : base + vary() * 45 * jitter;
    out.push({ x, y, size: Math.max(STAMP_LIMITS.size.min / 2, s), angle: ((angle % 360) + 360) % 360 });
  };
  // La dirección del comienzo: la del primer tramo que tiene largo.
  const firstDir = (() => {
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i]!.x - pts[0]!.x;
      const dy = pts[i]!.y - pts[0]!.y;
      if (dx !== 0 || dy !== 0) return deg(Math.atan2(dy, dx));
    }
    return 0;
  })();
  place(pts[0]!.x, pts[0]!.y, firstDir);
  // Cuánto falta recorrer hasta la próxima copia.
  let left = step;
  for (let i = 1; i < pts.length && out.length < STAMP_LIMITS.stamps; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const dir = deg(Math.atan2(b.y - a.y, b.x - a.x));
    let at = 0;
    while (len - at >= left && out.length < STAMP_LIMITS.stamps) {
      at += left;
      place(a.x + ((b.x - a.x) * at) / len, a.y + ((b.y - a.y) * at) / len, dir);
      left = step;
    }
    left -= len - at;
  }
  return out;
}

/** Largo total de un trazo, en mm. */
export function strokeLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total;
}

/**
 * Un trazo de copias como un dibujo: la caja que las contiene (en mm de la página) y las propiedades del
 * elemento «dibujo» (cada copia es un grupo girado con la imagen centrada adentro). `aspect` es el ancho
 * sobre el alto del recurso.
 */
export function stampDrawing(stamps: readonly Stamp[], asset: string, aspect: number, extra: { tint?: string; opacity?: number; label?: string } = {}): { box: { x: number; y: number; w: number; h: number }; props: DrawingProps } | null {
  if (stamps.length === 0) return null;
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  // Cada copia, girada, entra en un círculo de radio la mitad de su diagonal.
  const radius = (s: Stamp): number => Math.hypot(s.size, s.size / ratio) / 2;
  const x0 = Math.min(...stamps.map((s) => s.x - radius(s)));
  const y0 = Math.min(...stamps.map((s) => s.y - radius(s)));
  const x1 = Math.max(...stamps.map((s) => s.x + radius(s)));
  const y1 = Math.max(...stamps.map((s) => s.y + radius(s)));
  const r3 = (v: number): number => Math.round(v * 1000) / 1000;
  const prims: DrawingPrim[] = stamps.map((s): DrawingPrim => {
    const w = s.size;
    const h = s.size / ratio;
    const [a, b, c, d, e, f] = compose(translate(s.x - x0, s.y - y0), rotate(s.angle));
    return { t: 'group', m: [r3(a), r3(b), r3(c), r3(d), r3(e), r3(f)], children: [{ t: 'image', asset, x: r3(-w / 2), y: r3(-h / 2), w: r3(w), h: r3(h) }] };
  });
  const w0 = Math.max(0.1, r3(x1 - x0));
  const h0 = Math.max(0.1, r3(y1 - y0));
  return {
    box: { x: r3(x0), y: r3(y0), w: w0, h: h0 },
    props: {
      w0,
      h0,
      mode: 'scale',
      prims,
      ...(extra.opacity !== undefined && extra.opacity < 1 ? { opacity: extra.opacity } : {}),
      ...(extra.tint ? { tint: extra.tint } : {}),
      ...(extra.label ? { label: extra.label } : {}),
    },
  };
}
