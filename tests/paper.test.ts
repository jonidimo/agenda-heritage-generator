/** Cambiar el tamaño de la hoja: la página que resulta, las pantallas de tableta y lo hecho a mano que acompaña el cambio. */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, SCREEN_PRESETS, PAPER_PRESETS } from '../src/core/design/schema';
import { changePaper, pageSizeFor } from '../src/core/document/paper';
import { pageFormat } from '../src/core/document/context';

const fresh = () => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

describe('tamaño de la hoja', () => {
  it('A4 cosida da páginas de media hoja; una sola hoja por página da la hoja entera menos el refilado', () => {
    const d = fresh();
    expect(pageSizeFor(d, { paper: { preset: 'A4', width: 210, height: 297 }, method: 'sewn' }).nUp).toBe(2);
    const single = pageSizeFor(d, { paper: { preset: 'A4', width: 210, height: 297 }, method: 'single' });
    expect(single.nUp).toBe(1);
    expect(single.w).toBeLessThanOrEqual(210);
  });

  it('un tamaño de pantalla es una página por hoja, para leer, del tamaño exacto de la pantalla', () => {
    for (const id of SCREEN_PRESETS) {
      const next = changePaper(fresh(), { paper: { preset: id, width: 210, height: 297 }, rescale: false });
      expect(next.binding).toMatchObject({ target: 'screen', method: 'single' });
      const f = pageFormat(next);
      expect(f.w).toBeCloseTo(PAPER_PRESETS[id].w, 5);
      expect(f.h).toBeCloseTo(PAPER_PRESETS[id].h, 5);
      // El diseño sigue siendo válido.
      expect(() => parseDesign(JSON.parse(JSON.stringify(next)))).not.toThrow();
    }
  });

  it('con «rescale», lo hecho a mano se lleva en proporción; sin él, queda igual', () => {
    const d = fresh();
    const base = {
      ...d,
      customBlocks: [{ id: 'c1', pageType: 'notes', pageKey: null, kind: 'text' as const, x: 10, y: 20, w: 50, h: 30, mirror: true, props: {} }],
      overrides: [{ ...parseDesign({ overrides: [{ pageType: 'weekLeft', blockId: 'header.title', dx: 4, dy: 6 }] }).overrides[0]! }],
    };
    const from = pageFormat(base);
    const big = changePaper(base, { paper: { preset: 'A3', width: 297, height: 420 }, rescale: true });
    const to = pageFormat(big);
    const rx = to.w / from.w;
    const ry = to.h / from.h;
    expect(big.customBlocks[0]!.x).toBeCloseTo(10 * rx, 1);
    expect(big.customBlocks[0]!.h).toBeCloseTo(30 * ry, 1);
    expect(big.overrides[0]!.dy).toBeCloseTo(6 * ry, 1);
    const same = changePaper(base, { paper: { preset: 'A3', width: 297, height: 420 }, rescale: false });
    expect(same.customBlocks[0]!.x).toBe(10);
  });
});
