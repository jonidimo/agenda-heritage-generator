/**
 * Elementos compuestos (tabla, lista, hábitos, finanzas, minicalendario, cuadrantes, notas, línea de
 * horas, valoración, código QR): se dibujan completos en su caja, sin avisos en los papeles de siempre, con
 * valores acomodados a sus rangos y con el minicalendario tocable.
 */
import { describe, expect, it } from 'vitest';
import { ELEMENT_KINDS, customBlockPropsSchema, type ElementKind } from '../src/core/design/customBlocks';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type CustomBlock, type Design } from '../src/core/design/schema';
import { primsBounds, type Prim } from '../src/core/layout/prims';
import { openDocument } from './helpers/node-env';

const PROPS: Record<ElementKind, Record<string, unknown>> = {
  table: { rows: 6, cols: 4, header: true, headers: ['Día', 'Tarea', 'Hecho', 'Notas'] },
  checklist: { items: 12, columns: 2, shape: 'square', labels: ['Leche', 'Pan', 'Café'] },
  habits: { rows: 6, days: 31, names: ['Agua', 'Caminar', 'Leer'] },
  finance: { lines: 6, total: true, title: 'Gastos' },
  minical: { month: 'auto', title: true },
  quadrants: { titles: ['Urgente', 'Importante', 'Delegar', 'Eliminar'], style: 'lines' },
  notes: { title: 'Notas', style: 'dots', frame: true },
  timeline: { from: 7, to: 21, step: 60 },
  rating: { count: 5, shape: 'star', text: 'Ánimo' },
  qr: { text: 'https://example.com/receta?id=42', ecc: 'Q', color: '#223344' },
};

const BOX = { x: 20, y: 30, w: 80, h: 70 };

function design(kind: ElementKind, props: Record<string, unknown> = PROPS[kind], patch: (d: Design) => void = () => {}): Design {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  d.customBlocks.push({ id: 'el1', pageType: 'filler', pageKey: null, kind, ...BOX, mirror: true, props } as CustomBlock);
  patch(d);
  return parseDesign(d);
}

async function drawn(d: Design, which = 'filler') {
  const { doc } = await openDocument(d);
  const idx = doc.plan.pages.findIndex((p) => p.type === which);
  const page = doc.page(idx);
  const block = page.blocks.find((b) => b.id === 'custom.el1');
  return { doc, idx, page, block };
}

const count = (prims: readonly Prim[]): number => prims.reduce((n, p) => n + 1 + (p.t === 'group' ? count(p.children) : 0), 0);

describe('elementos compuestos', () => {
  for (const kind of ELEMENT_KINDS) {
    it(`${kind}: se dibuja dentro de su caja y sin avisos`, async () => {
      const { doc, page, block } = await drawn(design(kind));
      expect(block).toBeDefined();
      expect(block!.role).toBe('custom');
      expect(count(block!.prims)).toBeGreaterThan(3);
      const ink = primsBounds(block!.prims)!;
      // Nada se sale de la caja (con una pizca de tolerancia por el grosor de los trazos).
      expect(ink.x).toBeGreaterThanOrEqual(BOX.x - 1);
      expect(ink.y).toBeGreaterThanOrEqual(BOX.y - 1);
      expect(ink.x + ink.w).toBeLessThanOrEqual(BOX.x + BOX.w + 1);
      expect(ink.y + ink.h).toBeLessThanOrEqual(BOX.y + BOX.h + 1);
      expect(doc.pageWarnings(page.index).filter((w) => w.code !== 'abbreviated')).toEqual([]);
    });

    it(`${kind}: con valores absurdos se acomoda y no falla`, async () => {
      const junk = { rows: 1e9, cols: -5, items: 'x', columns: 99, days: 0, lines: NaN, count: 1000, from: 99, to: -3, step: 1, names: 'no', labels: [1, null, 'a'], headers: { a: 1 }, titles: 7, shape: 'rombo', style: {}, month: '2027-99' };
      const { block } = await drawn(design(kind, junk));
      expect(block).toBeDefined();
      expect(count(block!.prims)).toBeGreaterThan(0);
    });

    it(`${kind}: es determinista`, async () => {
      const a = await drawn(design(kind));
      const b = await drawn(design(kind));
      expect(JSON.stringify(a.block!.prims)).toBe(JSON.stringify(b.block!.prims));
    });

    it(`${kind}: el esquema JSON describe sus propiedades`, () => {
      const schema = customBlockPropsSchema(kind) as { properties: Record<string, unknown> };
      expect(Object.keys(schema.properties).length).toBeGreaterThan(1);
      // Todo lo que el ejemplo usa está descrito.
      for (const key of Object.keys(PROPS[kind])) expect(schema.properties).toHaveProperty(key);
    });
  }

  it('tabla: más filas son más líneas, y los títulos van arriba solo si se piden', async () => {
    const few = await drawn(design('table', { rows: 3, cols: 2, header: false }));
    const many = await drawn(design('table', { rows: 12, cols: 2, header: false }));
    expect(count(many.block!.prims)).toBeGreaterThan(count(few.block!.prims));
    const noHeader = await drawn(design('table', { rows: 3, cols: 2, header: false, headers: ['A', 'B'] }));
    const withHeader = await drawn(design('table', { rows: 3, cols: 2, header: true, headers: ['A', 'B'] }));
    const texts = (b: { prims: Prim[] }) => b.prims.filter((p) => p.t === 'text').length;
    expect(texts(noHeader.block!)).toBe(0);
    expect(texts(withHeader.block!)).toBe(2);
  });

  it('lista: las columnas reparten los renglones y los textos escritos salen en su renglón', async () => {
    const one = await drawn(design('checklist', { items: 10, columns: 1, labels: ['uno'] }));
    const two = await drawn(design('checklist', { items: 10, columns: 2, labels: ['uno'] }));
    const lines = (b: { prims: Prim[] }) => b.prims.filter((p) => p.t === 'line').length;
    expect(lines(one.block!)).toBe(10);
    expect(lines(two.block!)).toBe(10);
    expect(one.block!.prims.filter((p) => p.t === 'text')).toHaveLength(1);
  });

  it('minicalendario: usa el mes de la página y sus días llevan a la página de ese día', async () => {
    const { doc, idx } = await drawn(design('minical'));
    const links = doc.links(idx).filter((l) => l.blockId === 'custom.el1');
    expect(links.length).toBeGreaterThanOrEqual(28);
    expect(links.every((l) => l.target.kind === 'date')).toBe(true);
    // Los días enlazados son del mes de la página.
    const own = doc.plan.pages[idx]!.params?.month as { y: number; m: number } | undefined;
    if (own) expect(links.every((l) => l.target.kind !== 'date' || l.target.iso.startsWith(`${own.y}-${String(own.m).padStart(2, '0')}`))).toBe(true);
  });

  it('minicalendario: un mes elegido manda sobre el de la página', async () => {
    const { doc, idx } = await drawn(design('minical', { month: '2027-09' }));
    const links = doc.links(idx).filter((l) => l.blockId === 'custom.el1');
    expect(links.length).toBe(30);
    expect(links.every((l) => l.target.kind === 'date' && l.target.iso.startsWith('2027-09'))).toBe(true);
  });

  it('línea de horas: una fila por tramo, y un fin anterior al comienzo se acomoda', async () => {
    const day = await drawn(design('timeline', { from: 8, to: 12, step: 30 }));
    // 8 renglones de tramo + línea final + línea vertical.
    expect(day.block!.prims.filter((p) => p.t === 'line')).toHaveLength(8 + 2);
    const odd = await drawn(design('timeline', { from: 20, to: 5, step: 60 }));
    expect(odd.block!.prims.filter((p) => p.t === 'line')).toHaveLength(1 + 2);
  });

  it('con fondo blanco, un rectángulo blanco va debajo de todo lo demás', async () => {
    const plain = await drawn(design('table'));
    const paper = await drawn(design('table', { ...PROPS.table, paper: true }));
    const first = paper.block!.prims[0]!;
    expect(first).toMatchObject({ t: 'rect', ...BOX, fill: { color: '#ffffff' } });
    expect(paper.block!.prims.slice(1)).toEqual(plain.block!.prims);
  });

  it('valoración: dibuja la cantidad pedida de figuras', async () => {
    for (const shape of ['star', 'circle', 'heart', 'square']) {
      const { block } = await drawn(design('rating', { count: 7, shape }));
      const figures = block!.prims.filter((p) => p.t === 'path' || p.t === 'circle' || p.t === 'rect');
      expect(figures).toHaveLength(7);
    }
  });

  it('código QR: un cuadrado centrado, tocable si guarda una dirección, y un aviso si no entra', async () => {
    const { doc, idx, block } = await drawn(design('qr'));
    const ink = primsBounds(block!.prims)!;
    expect(ink.w).toBeCloseTo(ink.h, 1);
    expect(ink.x - BOX.x).toBeCloseTo(BOX.x + BOX.w - (ink.x + ink.w), 1);
    const links = doc.links(idx).filter((l) => l.blockId === 'custom.el1');
    expect(links.map((l) => l.url)).toEqual(['https://example.com/receta?id=42']);
    // Con el color pedido.
    expect(block!.prims.some((p) => p.t === 'rect' && p.fill?.color === '#223344')).toBe(true);
    // Un texto que no es una dirección, o con el enlace apagado: no hay zona tocable.
    for (const props of [{ text: 'javascript:alert(1)' }, { text: 'https://example.com', link: false }]) {
      const r = await drawn(design('qr', props));
      expect(r.doc.links(r.idx).filter((l) => l.blockId === 'custom.el1')).toEqual([]);
    }
    // Vacío: solo el recuadro que marca dónde va, sin avisos.
    const empty = await drawn(design('qr', { text: '  ' }));
    expect(empty.block!.prims).toHaveLength(1);
    expect(empty.doc.pageWarnings(empty.page.index)).toEqual([]);
    // Más de lo que entra en un QR (con corrección máxima): recuadro y aviso.
    // Más largo que el tope del campo (aunque entraría con corrección baja): se avisa en lugar de cortarlo.
    const capped = await drawn(design('qr', { text: 'x'.repeat(1600), ecc: 'L' }));
    expect(capped.doc.pageWarnings(capped.page.index).map((w) => w.code)).toContain('qrTooLong');
    const long = await drawn(design('qr', { text: 'x'.repeat(1400), ecc: 'H' }));
    expect(long.block!.prims).toHaveLength(1);
    expect(long.doc.pageWarnings(long.page.index).map((w) => w.code)).toContain('qrTooLong');
  });

  it('cada tipo entra en una hoja chica sin avisos de la revisión (A5 en LETTER y LEGAL)', async () => {
    for (const paper of ['LETTER', 'LEGAL'] as const) {
      for (const kind of ELEMENT_KINDS) {
        const { doc, page } = await drawn(design(kind, PROPS[kind], (d) => void (d.paper.preset = paper)));
        expect(doc.pageWarnings(page.index).filter((w) => w.code !== 'abbreviated'), `${kind} · ${paper}`).toEqual([]);
      }
    }
  });
});
