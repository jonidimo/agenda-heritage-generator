/** Dónde se usa una imagen y cómo se quita sin dejar nada colgando. */
import { describe, expect, it } from 'vitest';
import { assetUses, removeAssetFrom } from '../src/core/design/assetUse';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';

const ASSET = { id: 'img1', name: 'Colibrí', kind: 'raster', mime: 'image/png', width: 10, height: 10, builtin: null } as const;

function withEverything(): Design {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  d.assets.push({ ...ASSET }, { ...ASSET, id: 'img2', name: 'Otra' });
  d.watermarks.push({ ...d.watermarks[0]!, id: 'w1', assetId: 'img1' } as Design['watermarks'][number]);
  d.cover.imageAssetId = 'img1';
  d.customBlocks.push(
    { id: 'b1', pageType: 'titlePage', pageKey: null, kind: 'image', x: 10, y: 10, w: 30, h: 30, mirror: true, props: { assetId: 'img1', label: 'Mi foto' } },
    { id: 'b2', pageType: 'titlePage', pageKey: null, kind: 'image', x: 10, y: 50, w: 30, h: 30, mirror: true, props: { assetId: 'img2' } },
    {
      id: 'b3',
      pageType: 'titlePage',
      pageKey: null,
      kind: 'drawing',
      x: 10,
      y: 90,
      w: 40,
      h: 30,
      mirror: true,
      props: {
        w0: 40,
        h0: 30,
        mode: 'stretch',
        prims: [
          { t: 'group', children: [{ t: 'image', asset: 'img1', x: 0, y: 0, w: 10, h: 10 }] },
          { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, stroke: { color: '#000', width: 0.2 } },
        ],
      },
    },
  );
  d.customPages.push({ id: 'p1', after: null, fallback: null, startOn: 'any', title: 'Mi página', content: { kind: 'artwork', assetId: 'img1', pdfPage: 1, fit: 'contain', area: 'page', background: 'blank', text: '', rotation: 0, opacity: 1 } } as Design['customPages'][number]);
  d.pageTemplates.push({ id: 't1', title: 'Plantilla', showTitle: true, content: { kind: 'artwork', assetId: 'img1', pdfPage: 1, fit: 'contain', area: 'page', background: 'blank', text: '', rotation: 0, opacity: 1 } } as Design['pageTemplates'][number]);
  d.theme.tokens = { lines: { separator: { pattern: 'center', ornament: 'asset:img1', size: 4 } } };
  d.blockStyles.push({ pageType: 'monthLog', pageKey: null, blockId: 'header.rule', lines: { separator: { ornament: 'asset:img1' } } } as unknown as Design['blockStyles'][number]);
  d.overrides.push({ pageType: 'titlePage', pageKey: null, blockId: 'custom.b1', dx: 1, dy: 0, dw: 0, dh: 0, scale: 1, scaleY: null, deform: false, rotation: 0, opacity: 1, hidden: false, layer: null, label: null, blend: 'normal', locked: false });
  return parseDesign(d);
}

describe('uso de una imagen', () => {
  it('lista cada lugar que la usa, sin contar los que usan otra imagen', () => {
    const uses = assetUses(withEverything(), 'img1');
    const kinds = uses.map((u) => u.kind);
    expect(kinds).toEqual(expect.arrayContaining(['watermark', 'cover', 'block', 'page', 'template', 'ornament']));
    // El elemento imagen y el dibujo que la lleva adentro, y no el que usa la otra.
    expect(uses.filter((u) => u.kind === 'block').map((u) => (u as { id: string }).id)).toEqual(['b1', 'b3']);
    expect(uses.filter((u) => u.kind === 'ornament').map((u) => (u as { where: string }).where).sort()).toEqual(['blockStyle', 'theme']);
    expect(assetUses(withEverything(), 'img2').map((u) => u.kind)).toEqual(['block']);
  });

  it('una imagen que nadie usa no figura en ningún lado', () => {
    const d = withEverything();
    d.assets.push({ ...ASSET, id: 'sola', name: 'Sola' });
    expect(assetUses(d, 'sola')).toEqual([]);
  });
});

describe('quitar una imagen', () => {
  it('se va de la agenda y de todo lo que la usaba, y lo demás queda como estaba', () => {
    const d = structuredClone(withEverything());
    removeAssetFrom(d, 'img1');
    expect(d.assets.map((a) => a.id)).not.toContain('img1');
    expect(d.assets.map((a) => a.id)).toContain('img2');
    expect(d.watermarks.some((w) => w.assetId === 'img1')).toBe(false);
    expect(d.cover.imageAssetId).toBeNull();
    // El elemento imagen se va (con su ajuste); el que usa otra imagen se queda.
    expect(d.customBlocks.map((c) => c.id)).toEqual(['b2', 'b3']);
    expect(d.overrides.some((o) => o.blockId === 'custom.b1')).toBe(false);
    // El dibujo se queda sin la imagen (y sin el grupo que la tenía), pero conserva su línea.
    const drawing = d.customBlocks.find((c) => c.id === 'b3')!;
    expect((drawing.props.prims as Array<{ t: string }>).map((p) => p.t)).toEqual(['line']);
    expect(d.customPages[0]!.content.assetId).toBeNull();
    expect(d.pageTemplates[0]!.content.assetId).toBeNull();
    // Los ornamentos vuelven a los del tema, sin dejar la referencia.
    expect(JSON.stringify(d.theme.tokens)).not.toContain('asset:img1');
    expect(JSON.stringify(d.blockStyles)).not.toContain('asset:img1');
    expect(assetUses(d, 'img1')).toEqual([]);
    // Y sigue siendo una agenda válida.
    expect(() => parseDesign(d)).not.toThrow();
  });

  it('con una imagen que no está, no cambia nada', () => {
    const d = structuredClone(withEverything());
    const before = JSON.stringify(d);
    removeAssetFrom(d, 'no-existe');
    expect(JSON.stringify(d)).toBe(before);
  });
});
