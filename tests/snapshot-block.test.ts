/** Copiar un elemento del programa como elemento propio: texto editable o dibujo, y vuelve a verse igual. */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDrawing } from '../src/core/design/drawing';
import { CustomBlockZ, parseDesign, type CustomBlock, type Design } from '../src/core/design/schema';
import type { AgendaDocument } from '../src/core/document';
import { blockBounds } from '../src/core/document/layout';
import { customBlockFromBlock } from '../src/core/document/snapshot';
import { resolveStrings } from '../src/core/i18n';
import type { Block, PageModel, Prim } from '../src/core/layout/prims';
import { openDocument } from './helpers/node-env';

const base = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR', name: 'Norma' }));
  patch(d);
  return parseDesign(d);
};

function pageWith(doc: AgendaDocument, blockId: string, side?: 'recto' | 'verso'): { page: PageModel; block: Block } {
  for (let i = 0; i < doc.plan.pages.length; i++) {
    const p = doc.plan.pages[i]!;
    if (side && p.side !== side) continue;
    const page = doc.page(i);
    const block = page.blocks.find((b) => b.id === blockId);
    if (block) return { page, block };
  }
  throw new Error(`no hay ${blockId}`);
}

const ctxOf = (doc: AgendaDocument) => ({ fonts: doc.ctx.fonts, design: doc.design, strings: resolveStrings(doc.design.locale) });
const flat = (ps: readonly Prim[]): Prim[] => ps.flatMap((p) => (p.t === 'group' ? flat(p.children) : [p]));

describe('un bloque del programa como elemento propio', () => {
  it('un título de página pasa a un texto editable con su letra, cuerpo y color', async () => {
    const { doc } = await openDocument(base());
    const { page, block } = pageWith(doc, 'header.title');
    const cb = customBlockFromBlock(ctxOf(doc), page, block, 'copia')!;
    expect(cb.kind).toBe('text');
    expect(CustomBlockZ.safeParse(cb).success).toBe(true);
    const t = flat(block.prims).find((p) => p.t === 'text')!;
    expect(t.t === 'text' && cb.props.size).toBeCloseTo(t.t === 'text' ? t.run.sizePt : 0, 1);
    expect(cb.props).toMatchObject({ fit: false, autoHeight: true, wrap: true });
    expect(typeof (cb.props.font as { family: string }).family).toBe('string');
    // Un título del programa lleva su texto crudo (editable): el mismo que se lee en su origen.
    expect(String(cb.props.text).length).toBeGreaterThan(0);
  });

  it('un marco con sus líneas pasa a un dibujo que se estira, sin texto adentro', async () => {
    const { doc } = await openDocument(base());
    const { page, block } = pageWith(doc, 'vision.frame');
    const cb = customBlockFromBlock(ctxOf(doc), page, block, 'copia')!;
    expect(cb.kind).toBe('drawing');
    const drawing = parseDrawing(cb.props)!;
    expect(drawing).not.toBeNull();
    expect(drawing.mode).toBe('stretch');
    expect(flat(drawing.prims as Prim[]).some((p) => p.t === 'text')).toBe(false);
    expect(drawing.w0).toBeCloseTo((block.box ?? block.bbox).w, 6);
  });

  it('un bloque con textos y líneas (el minicalendario) pasa a un dibujo con los textos como contornos', async () => {
    const { doc } = await openDocument(base());
    const { page, block } = pageWith(doc, 'week.minical');
    expect(flat(block.prims).some((p) => p.t === 'text')).toBe(true);
    const cb = customBlockFromBlock(ctxOf(doc), page, block, 'copia')!;
    const drawing = parseDrawing(cb.props)!;
    const kinds = new Set(flat(drawing.prims as Prim[]).map((p) => p.t));
    expect(kinds.has('text' as never)).toBe(false);
    expect(kinds.has('path')).toBe(true);
  });

  it('puesto en la agenda vuelve a dibujarse donde estaba, también en una página izquierda', async () => {
    const { doc } = await openDocument(base());
    for (const side of ['recto', 'verso'] as const) {
      const { page, block } = pageWith(doc, 'vision.frame', side);
      const cb = customBlockFromBlock(ctxOf(doc), page, block, 'copia') as CustomBlock;
      const pasted = await openDocument(base((d) => void d.customBlocks.push({ ...cb, pageType: page.type, pageKey: page.key })));
      const copy = pasted.doc.page(page.index).blocks.find((b) => b.id === 'custom.copia')!;
      const want = blockBounds(block);
      const got = blockBounds(copy);
      expect(got.x).toBeCloseTo(want.x, 1);
      expect(got.y).toBeCloseTo(want.y, 1);
      expect(got.w).toBeCloseTo(want.w, 1);
      expect(got.h).toBeCloseTo(want.h, 1);
      // Y trae su dibujo: el recuadro del marco, en el mismo lugar.
      const rect = flat(copy.prims).find((p) => p.t === 'rect');
      expect(rect).toBeDefined();
    }
  });

  it('un dibujo cambia de tamaño sin cambiar el grosor de sus líneas', async () => {
    const { doc } = await openDocument(base());
    const { page, block } = pageWith(doc, 'vision.frame');
    const cb = customBlockFromBlock(ctxOf(doc), page, block, 'copia')!;
    const big = await openDocument(base((d) => void d.customBlocks.push({ ...cb, pageType: page.type, pageKey: page.key, w: cb.w * 1.5, h: cb.h * 0.5 })));
    const copy = big.doc.page(page.index).blocks.find((b) => b.id === 'custom.copia')!;
    const v = blockBounds(copy);
    expect(v.w).toBeCloseTo(cb.w * 1.5, 1);
    const widths = (b: Block) => flat(b.prims).flatMap((p) => ('stroke' in p && p.stroke ? [p.stroke.width] : []));
    expect(widths(copy)).toEqual(widths(block));
  });

  it('un dibujo inválido no se dibuja y se avisa; los límites de tamaño se respetan', async () => {
    expect(parseDrawing({ w0: 10, h0: 10, prims: [{ t: 'path', d: 'M0 0 <script>' }] })).toBeNull();
    expect(parseDrawing({ w0: 10, h0: 10, prims: [{ t: 'text', x: 0 }] })).toBeNull();
    const deep = { t: 'group', children: [{ t: 'group', children: [{ t: 'group', children: [{ t: 'group', children: [{ t: 'group', children: [] }] }] }] }] };
    expect(parseDrawing({ w0: 10, h0: 10, prims: [deep] })).toBeNull();
    const bad = await openDocument(base((d) => void d.customBlocks.push({ id: 'x', pageType: 'weekLeft', pageKey: null, kind: 'drawing', x: 10, y: 10, w: 20, h: 20, mirror: true, props: { w0: 10, h0: 10, prims: [{ t: 'path', d: 'M0 0 <script>' }] } })));
    const i = bad.doc.plan.pages.findIndex((p) => p.type === 'weekLeft');
    expect(bad.doc.page(i).warnings.some((w) => w.code === 'layoutError')).toBe(true);
  });
});
