/**
 * Dibujo: un elemento propio que lleva primitivas ya dibujadas (líneas, recuadros, trazados, imágenes).
 * Se crea copiando un elemento del programa (un marco, un ícono, un filete): lo que se pega es el
 * dibujo tal como estaba, con el texto convertido a contornos para que no dependa de ninguna letra.
 * No está pensado para escribirse a mano ni por un modelo: la guía lo dice.
 *
 * Todo lo que entra se valida: los números son finitos, los colores se normalizan, los trazados solo
 * traen órdenes de trazado, la profundidad de los grupos y la cantidad total están acotadas, así un
 * archivo ajeno no puede trabar el dibujo ni inyectar nada en el SVG.
 */
import { z } from 'zod';
import type { CirclePrim, DotsPrim, GroupPrim, ImagePrim, LinePrim, PathPrim, Prim, RectPrim, Stroke } from '../layout/prims';
import { normalizeColor } from '../util/color';
import { LINE_USES } from './themes';

export const DRAWING_LIMITS = { prims: 2000, depth: 4, bytes: 300_000, pathChars: 200_000, dots: 4000 } as const;

const num = z.number().min(-100_000).max(100_000);
const unit = z.number().min(0).max(1);
const color = z.string().transform((v) => normalizeColor(v) ?? '#000000');
const matrix = z.tuple([num, num, num, num, num, num]);

const StrokeZ: z.ZodType<Stroke, unknown> = z.object({
  color,
  use: z.enum(LINE_USES).optional(),
  width: z.number().min(0).max(100),
  dash: z.array(z.number().min(0).max(1000)).max(16).optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
  join: z.enum(['miter', 'round', 'bevel']).optional(),
  opacity: unit.optional(),
});

const FillZ = z.object({ color, opacity: unit.optional() });

const RectBoxZ = z.object({ x: num, y: num, w: num, h: num });

/** Solo órdenes y números de un trazado SVG: nada más puede viajar en `d`. */
const PathDataZ = z
  .string()
  .max(DRAWING_LIMITS.pathChars)
  .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/);

const LineZ: z.ZodType<LinePrim, unknown> = z.object({ t: z.literal('line'), x1: num, y1: num, x2: num, y2: num, stroke: StrokeZ });
const RectZ: z.ZodType<RectPrim, unknown> = z.object({ t: z.literal('rect'), x: num, y: num, w: num, h: num, r: num.optional(), fill: FillZ.optional(), stroke: StrokeZ.optional() });
const CircleZ: z.ZodType<CirclePrim, unknown> = z.object({ t: z.literal('circle'), cx: num, cy: num, r: num, fill: FillZ.optional(), stroke: StrokeZ.optional() });
const PathZ: z.ZodType<PathPrim, unknown> = z.object({ t: z.literal('path'), d: PathDataZ, m: matrix.optional(), fill: FillZ.optional(), stroke: StrokeZ.optional(), rule: z.enum(['nonzero', 'evenodd']).optional() });
const DotsZ: z.ZodType<DotsPrim, unknown> = z.object({ t: z.literal('dots'), pts: z.array(num).max(DRAWING_LIMITS.dots * 2), r: z.number().min(0).max(100), color, opacity: unit.optional() });
const ImageZ: z.ZodType<ImagePrim, unknown> = z.object({ t: z.literal('image'), asset: z.string().max(200), x: num, y: num, w: num, h: num, opacity: unit.optional() });

/** Lo que puede haber dentro de un dibujo (no hay texto ni páginas de PDF: el texto va como contornos). */
export type DrawingPrim = LinePrim | RectPrim | CirclePrim | PathPrim | DotsPrim | ImagePrim | GroupPrim;

const GroupZ: z.ZodType<GroupPrim, unknown> = z.lazy(() =>
  z.object({ t: z.literal('group'), children: z.array(DrawingPrimZ).max(DRAWING_LIMITS.prims), m: matrix.optional(), opacity: unit.optional(), clip: RectBoxZ.optional() }),
);

// `union` y no `discriminatedUnion`: el grupo se refiere a sí mismo y hay que tipar cada parte a mano.
const DrawingPrimZ: z.ZodType<DrawingPrim, unknown> = z.lazy(() => z.union([LineZ, RectZ, CircleZ, PathZ, DotsZ, ImageZ, GroupZ]));

/** Cuántas primitivas hay (contando las de adentro de los grupos) y qué tan profundo llegan los grupos. */
function measure(prims: readonly Prim[], depth = 1): { count: number; depth: number } {
  let count = 0;
  let deepest = depth;
  for (const p of prims) {
    count++;
    if (p.t === 'group') {
      const inner = measure(p.children, depth + 1);
      count += inner.count;
      deepest = Math.max(deepest, inner.depth);
    }
  }
  return { count, depth: deepest };
}

/**
 * Cómo sigue al elemento cuando cambia de tamaño: `stretch` estira las líneas y los recuadros (el
 * grosor no cambia) y mueve lo que tiene tamaño propio; `scale` lo escala entero, como una imagen.
 */
export const DRAWING_MODES = ['stretch', 'scale'] as const;

export const DrawingPropsZ = z
  .object({
    /** Tamaño del dibujo al copiarlo (mm): es el que se estira o escala a la caja del elemento. */
    w0: z.number().min(0.1).max(2000),
    h0: z.number().min(0.1).max(2000),
    mode: z.enum(DRAWING_MODES).default('stretch'),
    prims: z.array(DrawingPrimZ).max(DRAWING_LIMITS.prims),
    opacity: unit.optional(),
    /** Tiñe de este color los dibujos vectoriales (íconos, SVG) que lleva: el trazo de un sello. */
    tint: color.optional(),
    /** De dónde se copió (solo para decírselo a quien lo edita). */
    source: z.object({ block: z.string().max(120), label: z.string().max(200) }).optional(),
    label: z.string().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    const m = measure(v.prims);
    if (m.count > DRAWING_LIMITS.prims) ctx.addIssue({ code: 'custom', message: `Más de ${DRAWING_LIMITS.prims} primitivas` });
    if (m.depth > DRAWING_LIMITS.depth) ctx.addIssue({ code: 'custom', message: `Grupos anidados más de ${DRAWING_LIMITS.depth} niveles` });
    if (JSON.stringify(v.prims).length > DRAWING_LIMITS.bytes) ctx.addIssue({ code: 'custom', message: 'El dibujo es demasiado grande' });
  });
export type DrawingProps = z.infer<typeof DrawingPropsZ>;

/** Las propiedades de un dibujo, validadas; `null` si no sirven. */
export function parseDrawing(props: unknown): DrawingProps | null {
  const r = DrawingPropsZ.safeParse(props);
  return r.success ? r.data : null;
}
