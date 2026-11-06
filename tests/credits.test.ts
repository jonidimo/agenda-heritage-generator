/** Los créditos del autor al final de la guía: texto, enlaces y un QR que se puede leer. */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { qrPrims, qrSquare, QR_QUIET_MODULES } from '../src/core/layout/qr';
import { AUTHOR } from '../src/core/sections/guide';
import { qrEncode } from '../src/core/util/qr';
import { openDocument } from './helpers/node-env';

const norma = (patch?: (d: Design) => void): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch?.(d);
  return parseDesign(d);
};

describe('créditos del autor', () => {
  it('van en la guía, antes de las referencias, con enlaces a las tres direcciones y al código', async () => {
    const { doc } = await openDocument(norma());
    const guide = doc.plan.pages.filter((p) => p.type === 'guide');
    const at = guide.find((p) => doc.page(p.index).blocks.some((b) => b.id === 'guide.credits'));
    expect(at).toBeDefined();
    const page = doc.page(at!.index);
    const ids = page.blocks.map((b) => b.id);
    const refs = ids.indexOf('guide.refsTitle');
    if (refs >= 0) expect(ids.indexOf('guide.credits')).toBeLessThan(refs);
    const urls = doc.links(at!.index).filter((l) => l.blockId === 'guide.credits').map((l) => l.url);
    expect(new Set(urls)).toEqual(new Set([AUTHOR.instagram, AUTHOR.source, AUTHOR.site]));
    // El QR también lleva al código fuente.
    expect(urls.filter((u) => u === AUTHOR.source).length).toBe(2);
    const text = page.blocks.find((b) => b.id === 'guide.credits')!.prims.flatMap((p) => (p.t === 'text' ? [p.run.text] : []));
    expect(text).toContain(AUTHOR.name);
  });

  it('se pueden quitar, y la guía no cambia de cantidad de páginas por ellos en las plantillas', async () => {
    const off = await openDocument(norma((d) => void (d.methods.guide.credits = false)));
    expect(off.doc.plan.pages.some((p) => p.type === 'guide' && off.doc.page(p.index).blocks.some((b) => b.id === 'guide.credits'))).toBe(false);
    for (const tpl of ['heritage', 'heritage-norma', 'clara', 'minimal'] as const) {
      const counts = await Promise.all(
        [true, false].map(async (on) => {
          const d = parseDesign(createDesign(tpl, { year: 2027, locale: 'es-AR', country: 'AR' }));
          d.methods.guide.credits = on;
          return (await openDocument(parseDesign(d))).doc.pageCount;
        }),
      );
      expect(counts[0], tpl).toBe(counts[1]);
    }
  });

  it('un archivo viejo (sin la opción) los muestra', () => {
    const d = norma();
    const raw = JSON.parse(JSON.stringify(d)) as { methods: { guide: Record<string, unknown> } };
    delete raw.methods.guide.credits;
    expect(parseDesign(raw).methods.guide.credits).toBe(true);
  });
});

describe('QR dibujado', () => {
  it('un cuadrado centrado con su margen claro, módulos dentro de la caja y filas unidas', () => {
    const box = { x: 10, y: 20, w: 30, h: 18 };
    const sq = qrSquare(box);
    expect(sq).toEqual({ x: 16, y: 20, w: 18, h: 18 });
    const prims = qrPrims(AUTHOR.source, box);
    const qr = qrEncode(AUTHOR.source);
    const unit = sq.w / (qr.size + QR_QUIET_MODULES * 2);
    expect(prims[0]).toMatchObject({ t: 'rect', ...sq, fill: { color: '#ffffff' } });
    const dark = prims.slice(1);
    const darkModules = qr.modules.flat().filter(Boolean).length;
    let covered = 0;
    for (const p of dark) {
      if (p.t !== 'rect') throw new Error('se esperaban rectángulos');
      expect(p.x).toBeGreaterThanOrEqual(sq.x + QR_QUIET_MODULES * unit - 1e-9);
      expect(p.x + p.w).toBeLessThanOrEqual(sq.x + sq.w - QR_QUIET_MODULES * unit + 0.011);
      covered += Math.round((p.w - 0.01) / unit);
    }
    expect(covered).toBe(darkModules);
    // Menos rectángulos que módulos: los de una misma fila van juntos.
    expect(dark.length).toBeLessThan(darkModules);
    expect(qrPrims('x', box, { background: null })[0]).not.toMatchObject({ fill: { color: '#ffffff' } });
  });
});
