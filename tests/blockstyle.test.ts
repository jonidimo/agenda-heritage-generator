/**
 * Estilo propio de un elemento del programa: grosor, color y dibujo de sus líneas, relleno de sus
 * recuadros y color de su texto. La página gana sobre el tipo en cada campo, y la geometría no cambia.
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type BlockStyle, type Design } from '../src/core/design/schema';
import type { AgendaDocument } from '../src/core/document';
import { ptToMm } from '../src/core/util/geometry';
import type { Block, LinePrim, Prim, RectPrim, TextPrim } from '../src/core/layout/prims';
import { pageToSvg } from '../src/core/render/svg';
import { openDocument } from './helpers/node-env';

const norma = (styles: Array<Partial<BlockStyle> & { pageType: string; blockId: string }> = []): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR', name: 'Norma' }));
  d.blockStyles = styles.map((s) => ({ pageKey: null, lines: {}, ...s })) as Design['blockStyles'];
  return parseDesign(d);
};

const flat = (ps: readonly Prim[]): Prim[] => ps.flatMap((p) => (p.t === 'group' ? flat(p.children) : [p]));
const linesOf = (b: Block, use: string): LinePrim[] => flat(b.prims).filter((p): p is LinePrim => p.t === 'line' && p.stroke.use === use);

function weekWithWriting(doc: AgendaDocument): { index: number; type: string; key: string; block: Block } {
  for (let i = 0; i < doc.plan.pages.length; i++) {
    const p = doc.plan.pages[i]!;
    if (p.type !== 'weekLeft') continue;
    const block = doc.page(i).blocks.find((b) => linesOf(b, 'writing').length > 0 && linesOf(b, 'separator').length + linesOf(b, 'table').length > 0);
    if (block) return { index: i, type: p.type, key: p.key, block };
  }
  throw new Error('no hay un bloque con renglones y otras líneas');
}

describe('estilo propio de un elemento', () => {
  it('cambia solo las líneas del uso pedido, sin mover nada', async () => {
    const plain = await openDocument(norma());
    const at = weekWithWriting(plain.doc);
    const styled = await openDocument(norma([{ pageType: at.type, blockId: at.block.id, lines: { writing: { widthPt: 2, color: '#ff0000' } } }]));
    const after = styled.doc.page(at.index).blocks.find((b) => b.id === at.block.id)!;
    const w = linesOf(after, 'writing');
    expect(w.length).toBe(linesOf(at.block, 'writing').length);
    for (const l of w) {
      expect(l.stroke.width).toBeCloseTo(ptToMm(2), 6);
      expect(l.stroke.color).toBe('#ff0000');
    }
    // El resto del bloque queda como estaba.
    const other = (b: Block): string => JSON.stringify(flat(b.prims).filter((p) => !(p.t === 'line' && p.stroke.use === 'writing')));
    expect(other(after)).toBe(other(at.block));
    expect(after.bbox).toEqual(at.block.bbox);
  });

  it('la página gana al tipo campo por campo, y lo que la página no dice lo pone el tipo', async () => {
    const plain = await openDocument(norma());
    const at = weekWithWriting(plain.doc);
    const both = await openDocument(
      norma([
        { pageType: at.type, blockId: at.block.id, lines: { writing: { widthPt: 2, color: '#ff0000' } } },
        { pageType: at.type, pageKey: at.key, blockId: at.block.id, lines: { writing: { color: '#00aa00' } } },
      ]),
    );
    const w = linesOf(both.doc.page(at.index).blocks.find((b) => b.id === at.block.id)!, 'writing');
    expect(w[0]!.stroke.color).toBe('#00aa00');
    expect(w[0]!.stroke.width).toBeCloseTo(ptToMm(2), 6);
    // En otra semana vale el del tipo.
    const other = both.doc.plan.pages.findIndex((p, i) => p.type === 'weekLeft' && i > at.index);
    const ow = linesOf(both.doc.page(other).blocks.find((b) => b.id === at.block.id)!, 'writing');
    expect(ow[0]!.stroke.color).toBe('#ff0000');
  });

  it('el dibujo de la línea pasa por el estilo de líneas del tema (guiones) y sale en el SVG', async () => {
    const plain = await openDocument(norma());
    const at = weekWithWriting(plain.doc);
    const dashed = await openDocument(norma([{ pageType: at.type, blockId: at.block.id, lines: { writing: { pattern: 'dashed', color: '#0000ee' } } }]));
    const model = dashed.doc.page(at.index);
    const w = linesOf(model.blocks.find((b) => b.id === at.block.id)!, 'writing');
    expect(w[0]!.stroke.dash?.length).toBeGreaterThan(0);
    const svg = pageToSvg(model, { fonts: dashed.doc.ctx.fonts });
    expect(svg).toContain('#0000ee');
    expect(svg).toContain('stroke-dasharray');
  });

  it('relleno de un recuadro y color de texto por tipo de texto', async () => {
    const plain = await openDocument(norma());
    const cover = plain.doc.plan.pages.findIndex((p) => p.type === 'titlePage');
    const name = plain.doc.page(cover).blocks.find((b) => b.id === 'title.name')!;
    const role = (flat(name.prims).find((p): p is TextPrim => p.t === 'text')!).role!;
    const styled = await openDocument(norma([{ pageType: 'titlePage', blockId: 'title.name', text: { color: '#111111', roles: { [role]: '#aa00aa' } } }]));
    const t = flat(styled.doc.page(cover).blocks.find((b) => b.id === 'title.name')!.prims).find((p): p is TextPrim => p.t === 'text')!;
    // El color del tipo de texto gana sobre el general.
    expect(t.color).toBe('#aa00aa');

    const frameAt = plain.doc.plan.pages.findIndex((p) => plain.doc.page(p.index).blocks.some((b) => b.id === 'vision.frame'));
    const framed = await openDocument(norma([{ pageType: plain.doc.plan.pages[frameAt]!.type, blockId: 'vision.frame', fill: { color: '#fff3cd' } }]));
    const r = flat(framed.doc.page(frameAt).blocks.find((b) => b.id === 'vision.frame')!.prims).find((p): p is RectPrim => p.t === 'rect')!;
    expect(r.fill?.color).toBe('#fff3cd');
    const cleared = await openDocument(norma([{ pageType: plain.doc.plan.pages[frameAt]!.type, blockId: 'vision.frame', fill: { color: null } }]));
    expect(flat(cleared.doc.page(frameAt).blocks.find((b) => b.id === 'vision.frame')!.prims).find((p): p is RectPrim => p.t === 'rect')!.fill).toBeUndefined();
  });

  it('un color que no se entiende se descarta y el PDF se genera', async () => {
    const d = norma();
    d.blockStyles.push(BlockStyleParse({ pageType: 'weekLeft', blockId: 'week.notes', lines: { writing: { color: 'rojo fuerte' } } }));
    const parsed = parseDesign(d);
    expect(parsed.blockStyles[0]!.lines.writing?.color).toBeUndefined();
    const { doc, bytes } = await openDocument(parsed);
    const pdf = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id) });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
  });
});

function BlockStyleParse(s: { pageType: string; blockId: string; lines: Record<string, Record<string, unknown>> }): BlockStyle {
  return parseDesign({ ...createDesign('heritage', {}), blockStyles: [s] } as never).blockStyles[0]!;
}
