/** Las quince formas: dentro de su caja con el trazo incluido, sin NaN, deterministas y con su geometría justa. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUBBLE_SIDES, LINE_CAPS, SHAPE_RANGES, SHAPES, shapeBounds, shapeGeometry, type ShapeKind, type ShapeParams } from '../src/core/layout/shapes';
import { parsePathData, pathToString } from '../src/core/util/pathData';
import { ptToMm } from '../src/core/util/geometry';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { openDocument } from './helpers/node-env';

const num = (k: keyof typeof SHAPE_RANGES) => fc.double({ min: SHAPE_RANGES[k].min, max: SHAPE_RANGES[k].max, noNaN: true });
const params: fc.Arbitrary<ShapeParams> = fc.record(
  {
    radius: num('radius'),
    angle: num('angle'),
    startCap: fc.constantFrom(...LINE_CAPS),
    endCap: fc.constantFrom(...LINE_CAPS),
    head: num('head'),
    shaft: num('shaft'),
    apex: num('apex'),
    sides: fc.integer({ min: 3, max: 24 }),
    points: fc.integer({ min: 3, max: 24 }),
    inner: num('inner'),
    rotation: num('rotation'),
    cornerRadius: num('cornerRadius'),
    thickness: num('thickness'),
    start: num('start'),
    sweep: num('sweep'),
    pie: fc.boolean(),
    tailSide: fc.constantFrom(...BUBBLE_SIDES),
    tailAt: num('tailAt'),
    notch: num('notch'),
    arm: num('arm'),
  },
  { requiredKeys: [] },
);
const box = fc.record({ x: fc.double({ min: -50, max: 200, noNaN: true }), y: fc.double({ min: -50, max: 200, noNaN: true }), w: fc.double({ min: 2, max: 300, noNaN: true }), h: fc.double({ min: 2, max: 300, noNaN: true }) });
const closedShapes = SHAPES.filter((s): s is Exclude<ShapeKind, 'path'> => s !== 'path');

describe('formas', () => {
  it('cada forma, con cualquier caja, grosor y parámetros, queda dentro de su caja con el trazo incluido (propiedades)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...closedShapes), box, params, fc.double({ min: 0, max: 6, noNaN: true }), (shape, b, p, strokePt) => {
        const stroke = Math.min(ptToMm(strokePt), Math.min(b.w, b.h) / 4);
        const g = shapeGeometry(shape, b, p, stroke);
        expect(g.d).not.toMatch(/NaN|Infinity/);
        const r = shapeBounds(g.d)!;
        expect(r).not.toBeNull();
        // El contorno más medio trazo de cada lado tiene que seguir dentro de la caja: con el redondeo a
        // milésimas y, en los arcos, el error de aproximarlos con cúbicas (menos de 0,03 % del tamaño).
        const eps = 0.003 + 3e-4 * Math.max(b.w, b.h);
        expect(r.x - stroke / 2).toBeGreaterThanOrEqual(b.x - eps);
        expect(r.y - stroke / 2).toBeGreaterThanOrEqual(b.y - eps);
        expect(r.x + r.w + stroke / 2).toBeLessThanOrEqual(b.x + b.w + eps);
        expect(r.y + r.h + stroke / 2).toBeLessThanOrEqual(b.y + b.h + eps);
        for (const c of g.caps) expect(c).not.toMatch(/NaN|Infinity/);
        // Determinista.
        expect(shapeGeometry(shape, b, p, stroke)).toEqual(g);
      }),
      { numRuns: 1500 },
    );
  });

  it('las cerradas llenan la caja (los polígonos y las estrellas no dejan aire)', () => {
    const b = { x: 10, y: 10, w: 80, h: 40 };
    for (const shape of ['rect', 'ellipse', 'triangle', 'diamond', 'polygon', 'star', 'heart', 'ring', 'banner', 'cross', 'arrow'] as const) {
      const r = shapeBounds(shapeGeometry(shape, b, {}, 0).d)!;
      expect(r.w, shape).toBeCloseTo(80, 1);
      expect(r.h, shape).toBeCloseTo(40, 1);
    }
  });

  it('un polígono de n lados tiene n vértices, una estrella de n puntas tiene 2n, y el lado de abajo del polígono es horizontal', () => {
    for (let n = 3; n <= 24; n++) {
      const poly = parsePathData(shapeGeometry('polygon', { x: 0, y: 0, w: 50, h: 50 }, { sides: n }, 0).d)!;
      expect(poly.filter((s) => s.c === 'M' || s.c === 'L')).toHaveLength(n);
      const pts = poly.flatMap((s) => (s.c === 'M' || s.c === 'L' ? [s.p] : []));
      const maxY = Math.max(...pts.map((p) => p.y));
      expect(pts.filter((p) => Math.abs(p.y - maxY) < 0.002).length).toBe(2);
      const star = parsePathData(shapeGeometry('star', { x: 0, y: 0, w: 50, h: 50 }, { points: n }, 0).d)!;
      expect(star.filter((s) => s.c === 'M' || s.c === 'L')).toHaveLength(2 * n);
    }
  });

  it('la elipse se aparta menos de 0,03 % de la elipse exacta', () => {
    const segs = parsePathData(shapeGeometry('ellipse', { x: 0, y: 0, w: 200, h: 100 }, {}, 0).d)!;
    let cur = { x: 0, y: 0 };
    let worst = 0;
    for (const s of segs) {
      if (s.c === 'C') {
        for (let i = 1; i < 32; i++) {
          const t = i / 32;
          const u = 1 - t;
          const x = u ** 3 * cur.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t ** 3 * s.p.x;
          const y = u ** 3 * cur.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t ** 3 * s.p.y;
          worst = Math.max(worst, Math.abs(Math.hypot((x - 100) / 100, (y - 50) / 50) - 1));
        }
      }
      if (s.c !== 'Z') cur = s.p;
    }
    expect(worst).toBeLessThan(0.0003);
  });

  it('esquinas redondeadas: el radio no pasa de la mitad del lado más corto', () => {
    const big = shapeBounds(shapeGeometry('rect', { x: 0, y: 0, w: 10, h: 4 }, { radius: 50 }, 0).d)!;
    expect(big).toEqual({ x: 0, y: 0, w: 10, h: 4 });
  });

  it('una línea es abierta y sus puntas siguen al ángulo', () => {
    const g = shapeGeometry('line', { x: 0, y: 0, w: 40, h: 40 }, { angle: 90, endCap: 'arrow', startCap: 'dot' }, 0.5);
    expect(g.open).toBe(true);
    expect(g.caps).toHaveLength(2);
    const r = shapeBounds(g.d)!;
    expect(r.w).toBeCloseTo(0, 3);
  });

  it('un arco abierto, un sector cerrado y un aro con hueco', () => {
    expect(shapeGeometry('arc', { x: 0, y: 0, w: 40, h: 40 }, { sweep: 90 }, 0).open).toBe(true);
    expect(shapeGeometry('arc', { x: 0, y: 0, w: 40, h: 40 }, { sweep: 90, pie: true }, 0).d).toMatch(/^M 20 20/);
    expect(shapeGeometry('ring', { x: 0, y: 0, w: 40, h: 40 }, {}, 0).rule).toBe('evenodd');
  });

  it('el trazado libre se estira a la caja, y uno inválido no dibuja nada', () => {
    const g = shapeGeometry('path', { x: 10, y: 20, w: 50, h: 100 }, { d: 'M 0 0 L 100 0 L 100 100 Z' }, 0);
    expect(shapeBounds(g.d)).toEqual({ x: 10, y: 20, w: 50, h: 100 });
    expect(g.open).toBe(false);
    for (const d of ['', 'hola', 'L 1 2', 'M 1', 'M 0 0 L 1 NaN', `M 0 0 ${'L 1 1 '.repeat(2100)}`]) expect(shapeGeometry('path', { x: 0, y: 0, w: 10, h: 10 }, { d }, 0).d, d.slice(0, 20)).toBe('');
  });
});

describe('trazados SVG', () => {
  it('lee todos los comandos, relativos y absolutos, y los deja en M, L, C y Z', () => {
    const segs = parsePathData('m10 10 h 10 v10 H 5 V 5 c 1 1 2 2 3 3 s 4 4 5 5 q 1 1 2 2 t 3 3 a 5 5 0 0 1 10 0 z')!;
    expect(new Set(segs.map((s) => s.c))).toEqual(new Set(['M', 'L', 'C', 'Z']));
    // Un arco termina exactamente en su punto final.
    const arc = parsePathData('M 0 0 A 50 50 0 0 1 100 0')!;
    const last = arc.at(-1)!;
    expect(last.c === 'C' && last.p).toEqual({ x: 100, y: 0 });
    expect(pathToString(parsePathData('M0,0L10,0')!)).toBe('M 0 0 L 10 0');
    expect(parsePathData('M 0 0 L 1e2 5e-1')!.at(-1)).toEqual({ c: 'L', p: { x: 100, y: 0.5 } });
  });

  it('cualquier texto se lee sin fallar: o un trazado o nada (propiedades)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (d) => {
        const segs = parsePathData(d);
        if (segs) expect(pathToString(segs)).not.toMatch(/NaN|Infinity/);
      }),
    );
  });
});

describe('elemento «forma» en la página', () => {
  const page = async (props: Record<string, unknown>) => {
    const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
    d.customBlocks.push({ id: 'f', pageType: 'titlePage', pageKey: null, kind: 'shape', x: 20, y: 30, w: 40, h: 30, mirror: true, props });
    const { doc } = await openDocument(parseDesign(d));
    const idx = doc.plan.pages.find((p) => p.type === 'titlePage')!.index;
    return { block: doc.page(idx).blocks.find((b) => b.id === 'custom.f')!, warnings: doc.pageWarnings(idx) };
  };

  it('cada forma se dibuja con su relleno y su trazo, sin avisos', async () => {
    for (const shape of SHAPES) {
      const { block, warnings } = await page({ shape, fill: '#ff0000', strokeColor: '#0000ff', strokePt: 1, d: 'M 0 0 L 100 50 L 0 100 Z', endCap: 'arrow' });
      const main = block.prims[0]!;
      expect(main.t, shape).toBe('path');
      if (main.t !== 'path') continue;
      expect(main.stroke?.color, shape).toBe('#0000ff');
      // Una línea y un arco abierto no se rellenan.
      if (shape !== 'line' && shape !== 'arc') expect(main.fill?.color, shape).toBe('#ff0000');
      else expect(main.fill, shape).toBeUndefined();
      expect(warnings, shape).toEqual([]);
    }
  });

  it('un trazado libre inválido deja un recuadro y avisa', async () => {
    const { block, warnings } = await page({ shape: 'path', d: 'esto no es un trazado' });
    expect(block.prims[0]!.t).toBe('rect');
    expect(warnings.map((w) => w.code)).toContain('invalidPath');
  });
});
