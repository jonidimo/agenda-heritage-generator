/**
 * Sello y trazo: las copias se reparten por distancia a lo largo del trazo, siguen su dirección,
 * varían con una semilla (siempre igual), y el trazo entero es un dibujo válido; los íconos de adentro se
 * dibujan con sus trazados (teñidos), en la vista y en el PDF.
 */
import { describe, expect, it } from 'vitest';
import { iconAsset } from '../src/core/assets/icons';
import { createDesign } from '../src/core/design/defaults';
import { parseDrawing } from '../src/core/design/drawing';
import { parseDesign, type CustomBlock } from '../src/core/design/schema';
import { seeded, stampDrawing, stampsAlong, STAMP_LIMITS, strokeLength, type StampOptions } from '../src/core/layout/stamps';
import type { Prim } from '../src/core/layout/prims';
import { openDocument } from './helpers/node-env';

const opts = (o: Partial<StampOptions> = {}): StampOptions => ({ size: 10, spacing: 1, rotate: 'none', jitter: 0, seed: 7, ...o });
const line = (len: number, n = 50) => Array.from({ length: n + 1 }, (_, i) => ({ x: (len * i) / n, y: 0 }));

describe('copias a lo largo del trazo', () => {
  it('una copia al comienzo y una cada «espaciado × ancho» de distancia, sin importar cuántos puntos tenga el trazo', () => {
    const a = stampsAlong(line(100, 7), opts());
    const b = stampsAlong(line(100, 400), opts());
    expect(a.map((s) => s.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => expect.closeTo(v, 6)));
    expect(b.length).toBe(a.length);
    expect(stampsAlong(line(100), opts({ spacing: 2 }))).toHaveLength(6);
    // Un clic (un solo punto) deja una sola copia.
    expect(stampsAlong([{ x: 3, y: 4 }], opts())).toEqual([{ x: 3, y: 4, size: 10, angle: 0 }]);
  });

  it('todas las copias quedan sobre el trazo, también en uno quebrado', () => {
    const pts = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
    const out = stampsAlong(pts, opts({ size: 5 }));
    expect(out.length).toBe(Math.floor(strokeLength(pts) / 5) + 1);
    for (const s of out) expect(Math.abs(s.y) < 1e-9 || Math.abs(s.x - 30) < 1e-9).toBe(true);
  });

  it('«sigue el trazo» gira cada copia según la dirección del tramo', () => {
    const out = stampsAlong([{ x: 0, y: 0 }, { x: 0, y: 50 }], opts({ rotate: 'follow' }));
    for (const s of out) expect(s.angle).toBeCloseTo(90, 6);
  });

  it('la variación sale de la semilla: igual semilla, igual trazo; otra semilla, otro', () => {
    const o = opts({ rotate: 'random', jitter: 0.4 });
    expect(stampsAlong(line(80), o)).toEqual(stampsAlong(line(80), o));
    expect(stampsAlong(line(80), { ...o, seed: 8 })).not.toEqual(stampsAlong(line(80), o));
    const r = seeded(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('un trazo larguísimo se corta en el tope de copias, y los valores fuera de rango se acomodan', () => {
    expect(stampsAlong(line(100_000, 10), opts({ size: 2, spacing: 0.2 })).length).toBe(STAMP_LIMITS.stamps);
    expect(stampsAlong(line(100), opts({ size: 1000 })).length).toBe(Math.floor(100 / STAMP_LIMITS.size.max) + 1);
  });
});

describe('el trazo como dibujo', () => {
  it('es un dibujo válido: una caja que contiene todas las copias giradas, y un grupo por copia', () => {
    const stamps = stampsAlong(line(60), opts({ rotate: 'random', jitter: 0.3 }));
    const d = stampDrawing(stamps, 'icon:star', 1, { tint: '#c0392b', label: 'Trazo' })!;
    expect(parseDrawing(d.props)).not.toBeNull();
    expect(d.props.prims).toHaveLength(stamps.length);
    // Las copias de los extremos (centradas en 0 y en 60) entran enteras.
    for (const st of stamps) {
      expect(st.x - st.size / 2).toBeGreaterThanOrEqual(d.box.x - 1e-6);
      expect(st.x + st.size / 2).toBeLessThanOrEqual(d.box.x + d.box.w + 1e-6);
    }
    expect(stampDrawing([], 'icon:star', 1)).toBeNull();
  });

  it('un ícono dentro del dibujo sale con sus trazados teñidos, en la página y en el PDF', async () => {
    const base = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
    const d = stampDrawing(stampsAlong(line(40), opts()), 'icon:star', 1, { tint: '#c0392b' })!;
    const { doc: probe } = await openDocument(base);
    const index = probe.plan.pages.findIndex((p) => p.type === 'notes' || p.type === 'weekLeft');
    const page = probe.plan.pages[index]!;
    const block: CustomBlock = { id: 'trazo', pageType: page.type, pageKey: page.key, kind: 'drawing', mirror: false, x: 20, y: 40, w: d.box.w, h: d.box.h, props: d.props };
    const design = parseDesign({ ...base, assets: [...base.assets, iconAsset('star')], customBlocks: [block] });
    const { doc, bytes } = await openDocument(design);
    const drawn = doc.page(index).blocks.find((b) => b.id === 'custom.trazo')!;
    const flat = (ps: readonly Prim[]): Prim[] => ps.flatMap((p) => (p.t === 'group' ? flat(p.children) : [p]));
    const leaves = flat(drawn.prims);
    expect(leaves.some((p) => p.t === 'image')).toBe(false);
    const paths = leaves.filter((p) => p.t === 'path');
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.t === 'path' && (p.stroke?.color ?? p.fill?.color) === '#c0392b')).toBe(true);
    expect(doc.pageWarnings(index).filter((w) => w.code === 'missingAsset')).toEqual([]);
    const pdf = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id) });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('en modo «estirar», un trazo de íconos queda donde estaba (no salta a la esquina)', async () => {
    const base = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
    const d = stampDrawing(stampsAlong(line(40), opts()), 'icon:star', 1)!;
    const { doc: probe } = await openDocument(base);
    const index = probe.plan.pages.findIndex((p) => p.type === 'weekLeft');
    const page = probe.plan.pages[index]!;
    const block: CustomBlock = { id: 'trazo', pageType: page.type, pageKey: page.key, kind: 'drawing', mirror: false, x: 60, y: 100, w: d.box.w, h: d.box.h, props: { ...d.props, mode: 'stretch' } };
    const { doc } = await openDocument(parseDesign({ ...base, assets: [...base.assets, iconAsset('star')], customBlocks: [block] }));
    const drawn = doc.page(index).blocks.find((b) => b.id === 'custom.trazo')!;
    // Cada copia es un grupo con su matriz: su lugar en la página (antes de pasar a trazados) cae en la caja.
    const groups = drawn.prims.filter((p): p is Extract<Prim, { t: 'group' }> => p.t === 'group');
    expect(groups.length).toBeGreaterThan(3);
    const at = (g: Extract<Prim, { t: 'group' }>): { x: number; y: number } => {
      const m = g.m ?? [1, 0, 0, 1, 0, 0];
      return { x: m[4], y: m[5] };
    };
    for (const g of groups) {
      const p = at(g);
      expect(p.x).toBeGreaterThan(55);
      expect(p.y).toBeGreaterThan(95);
    }
  });
});
