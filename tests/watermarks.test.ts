/** Marcas de agua: en qué lado van, cómo se funden con lo de abajo, en grises, y los archivos de antes. */
import { describe, expect, it } from 'vitest';
import { grayPixels } from '../src/core/util/color';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import type { Prim } from '../src/core/layout/prims';
import { pageToSvg } from '../src/core/render/svg';
import { grayOf } from '../src/core/util/color';
import { openDocument } from './helpers/node-env';

const base = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

const colors = (prims: readonly Prim[]): string[] =>
  prims.flatMap((p) => (p.t === 'group' ? colors(p.children) : p.t === 'path' ? [p.fill?.color, p.stroke?.color].filter((c): c is string => typeof c === 'string') : []));

describe('marcas de agua', () => {
  it('un archivo de antes (sin lado, fusión ni gris) se abre igual: todas las páginas, normal, en color', () => {
    const d = base();
    expect(d.watermarks[0]).toMatchObject({ side: 'both', blend: 'normal', grayscale: false });
  });

  it('«solo derechas» va solo en las páginas derechas, y «solo izquierdas» al revés', async () => {
    for (const side of ['recto', 'verso'] as const) {
      const { doc } = await openDocument(base((d) => void (d.watermarks[0]!.side = side)));
      const pages = doc.plan.pages.filter((p) => p.type === 'notes' || p.type === 'weekLeft' || p.type === 'weekRight').slice(0, 12);
      for (const p of pages) {
        const has = doc.page(p.index).blocks.some((b) => b.id === 'wm.colibri');
        expect(has, `${p.key} (${p.side})`).toBe(p.side === side);
      }
    }
  });

  it('la fusión llega al bloque y al dibujo de la página', async () => {
    const { doc } = await openDocument(base((d) => void (d.watermarks[0]!.blend = 'multiply')));
    const page = doc.plan.pages.find((p) => p.type === 'weekLeft')!;
    const model = doc.page(page.index);
    expect(model.blocks.find((b) => b.id === 'wm.colibri')!.blend).toBe('multiply');
    expect(pageToSvg(model, { fonts: doc.ctx.fonts })).toContain('multiply');
  });

  it('en grises, los colores del dibujo vectorial pasan a grises de la misma luminosidad', async () => {
    const colored = base((d) => {
      d.assets.push({ id: 'rojo', name: 'Rojo', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null, data: btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#cc2200"/></svg>') });
      d.watermarks[0]!.assetId = 'rojo';
    });
    const page = (d: Design) => openDocument(d).then(({ doc }) => doc.page(doc.plan.pages.find((p) => p.type === 'weekLeft')!.index).blocks.find((b) => b.id === 'wm.colibri')!);
    const before = colors((await page(colored)).prims);
    expect(before).toContain('#cc2200');
    const after = colors((await page(parseDesign({ ...colored, watermarks: [{ ...colored.watermarks[0]!, grayscale: true }] }))).prims);
    expect(after).toEqual(before.map(grayOf));
    for (const c of after) expect(c).toMatch(/^#([0-9a-f]{2})\1\1$/);
  });

  it('el gris de un color y de una imagen respetan la luminosidad y la transparencia', () => {
    expect(grayOf('#ffffff')).toBe('#ffffff');
    expect(grayOf('#000')).toBe('#000000');
    expect(grayOf('#00ff00')).toBe('#b6b6b6');
    expect(grayOf('none')).toBe('none');
    const px = new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 255, 255]);
    grayPixels(px);
    expect([...px]).toEqual([54, 54, 54, 128, 18, 18, 18, 255]);
  });
});
