/**
 * Tema integral: paleta derivada en OKLCH, validación de ajustes nuevos, colores por tipo de texto
 * y estilo de líneas con ornamentos (renglones, separadores, tablas, marcos).
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { derivePalette, hexToOklch, oklchToHex } from '../src/core/design/palette';
import { parseDesign, type Design } from '../src/core/design/schema';
import { pruneTokens, THEMES, type LineStyle } from '../src/core/design/themes';
import { applyLineStyles, hasLineStyles } from '../src/core/document/linestyle';
import { BUILTIN_ORNAMENTS } from '../src/core/layout/ornaments';
import type { Prim } from '../src/core/layout/prims';
import { openDocument } from './helpers/node-env';

const design = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

describe('paleta en OKLCH', () => {
  it('ida y vuelta entre hexadecimal y OKLCH sin perder el color', () => {
    for (const hex of ['#000000', '#ffffff', '#7a4e2d', '#2563eb', '#556b2f', '#c0392b']) expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  });

  it('negro da una escala de grises (para láser monocromo)', () => {
    const p = derivePalette('#000000', 'mono');
    for (const c of [...Object.values(p.colors), ...Object.values(p.roles), p.dots]) {
      expect(c.slice(1, 3)).toBe(c.slice(3, 5));
      expect(c.slice(3, 5)).toBe(c.slice(5, 7));
    }
  });

  it('los textos quedan oscuros (se leen impresos) y los fondos muy claros; la armonía cambia el tono', () => {
    const p = derivePalette('#2563eb', 'complementary');
    for (const c of Object.values(p.roles)) expect(hexToOklch(c).l).toBeLessThanOrEqual(0.46);
    expect(hexToOklch(p.colors.weekend).l).toBeGreaterThan(0.9);
    const base = hexToOklch('#2563eb').h;
    const heading = hexToOklch(p.roles.heading).h;
    // Complementaria: el tono de los encabezados queda a 180° del base.
    const turn = (((heading - base) % 360) + 360) % 360;
    expect(Math.abs(turn - 180)).toBeLessThan(20);
  });
});

describe('ajustes del tema', () => {
  it('se aceptan estilos de línea válidos y se descartan los inválidos', () => {
    const t = pruneTokens({
      lines: { separator: { pattern: 'center', ornament: 'builtin:scroll', size: 99, color: '#7a4e2d' }, frame: { pattern: 'zigzag', corner: 'javascript:alert(1)' } },
      colors: { roles: { title: '#123456', body: 'url(x)' } },
      palette: { base: '#7a4e2d', harmony: 'nope' },
    });
    expect(t).toEqual({ lines: { separator: { pattern: 'center', ornament: 'builtin:scroll', size: 30, color: '#7a4e2d' } }, colors: { roles: { title: '#123456' } }, palette: { base: '#7a4e2d' } });
  });

  it('un diseño viejo sin los ajustes nuevos queda igual que antes (todo liso y en negro)', () => {
    expect(hasLineStyles(THEMES.heritage!.lines)).toBe(false);
    expect(Object.values(THEMES.heritage!.colors.roles).every((c) => c === '#000000')).toBe(true);
  });
});

describe('colores por tipo de texto', () => {
  it('cada texto toma el color de su tipo en el tema', async () => {
    const { doc } = await openDocument(design((d) => void (d.theme.tokens = { colors: { roles: { title: '#7a4e2d' } } })));
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const title = doc.page(yp.index).blocks.find((b) => b.id === 'header.title')!.prims[0] as Extract<Prim, { t: 'text' }>;
    expect(title.role).toBe('title');
    expect(title.color).toBe('#7a4e2d');
  });
});

describe('estilo de líneas y ornamentos', () => {
  const separator = (): Prim => ({ t: 'line', x1: 10, y1: 20, x2: 110, y2: 20, stroke: { color: '#000000', width: 0.2, use: 'separator' } });
  const plain: LineStyle = { pattern: 'solid', ornament: '', size: 3, corner: '', color: '' };
  const lines = (sep: Partial<typeof plain>, frame: Partial<typeof plain> = {}) => ({ writing: plain, separator: { ...plain, ...sep }, table: plain, frame: { ...plain, ...frame } });

  it('sin estilos especiales devuelve las mismas primitivas (sin copiar)', () => {
    const ps = [separator()];
    expect(applyLineStyles(ps, lines({}), new Map())).toBe(ps);
  });

  it('ornamento al centro: la línea se corta y el ornamento queda en el medio', () => {
    const out = applyLineStyles([separator()], lines({ pattern: 'center', ornament: 'builtin:scroll', size: 3 }), new Map());
    const g = out[0] as Extract<Prim, { t: 'group' }>;
    expect(g.t).toBe('group');
    const segs = g.children.filter((p) => p.t === 'line') as Array<Extract<Prim, { t: 'line' }>>;
    expect(segs).toHaveLength(2);
    expect(segs[0]!.x2).toBeLessThan(50 - 9);
    expect(segs[1]!.x1).toBeGreaterThan(50 + 9);
    expect(g.children.some((p) => p.t === 'path')).toBe(true);
  });

  it('guarda repetida: los módulos integrados se juntan en un par de trazados', () => {
    const out = applyLineStyles([separator()], lines({ pattern: 'repeat', ornament: 'builtin:wave', size: 2 }), new Map());
    const g = out[0] as Extract<Prim, { t: 'group' }>;
    expect(g.children.length).toBeLessThanOrEqual(2);
    const d = (g.children[0] as Extract<Prim, { t: 'path' }>).d;
    expect((d.match(/M /g) ?? []).length).toBe(Math.floor(100 / (2 * 2.4)));
  });

  it('marco doble con esquinas: dos rectángulos y cuatro esquinas', () => {
    const frame: Prim = { t: 'rect', x: 10, y: 10, w: 60, h: 40, stroke: { color: '#000000', width: 0.3, use: 'frame' } };
    const out = applyLineStyles([frame], lines({}, { pattern: 'double', corner: 'builtin:curl', size: 5 }), new Map());
    expect(out.filter((p) => p.t === 'rect')).toHaveLength(2);
    expect(out.filter((p) => p.t === 'group')).toHaveLength(4);
  });

  it('todos los ornamentos integrados dibujan trazados válidos', () => {
    for (const o of BUILTIN_ORNAMENTS) {
      const strokes = o.draw(0, 0, 10 * o.aspect, 10);
      expect(strokes.length).toBeGreaterThan(0);
      for (const s of strokes) expect(s.d).toMatch(/^M [-\d.]+ [-\d.]+/);
    }
  });

  it('el tema Filigrana arma la agenda sin errores y con ornamentos', async () => {
    const { doc } = await openDocument(design((d) => void (d.theme.id = 'filigrana')));
    expect(doc.warnings().filter((w) => w.code === 'layoutError' || w.code === 'offPage')).toEqual([]);
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const rule = doc.page(yp.index).blocks.find((b) => b.id === 'header.rule')!;
    expect(rule.prims[0]!.t).toBe('group');
  });
});
