/**
 * Un ajuste «por tipo» con escala, en un tipo de página que cae a ambos lados: la página izquierda es el
 * espejo de la derecha también en el tamaño (la escala crece hacia afuera en las dos).
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { blockBounds } from '../src/core/document/layout';
import { ov } from './helpers/overrides';
import { openDocument } from './helpers/node-env';

const base = (): Design => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

describe('escala espejada en páginas izquierdas', () => {
  it('la caja que se ve en la izquierda es el espejo de la de la derecha, con y sin deformar', async () => {
    const { doc } = await openDocument(base());
    const type = 'notes';
    expect(doc.ctx.mirrorTypes?.has(type)).toBe(true);
    const recto = doc.plan.pages.findIndex((p) => p.type === type && p.side === 'recto');
    const verso = doc.plan.pages.findIndex((p) => p.type === type && p.side === 'verso');
    const id = doc.page(recto).blocks.find((b) => b.id === 'notes.area')!.id;
    for (const extra of [{ scale: 0.8 }, { scale: 0.7, scaleY: 0.9, deform: true }, { scale: 0.9, dw: -10 }]) {
      const d = parseDesign({ ...base(), overrides: [ov({ blockId: id, pageType: type, pageKey: null, dx: 4, dy: 3, ...extra })] });
      const { doc: out } = await openDocument(d);
      const r = blockBounds(out.page(recto).blocks.find((b) => b.id === id)!);
      const v = blockBounds(out.page(verso).blocks.find((b) => b.id === id)!);
      const W = out.page(recto).w;
      expect(v.w).toBeCloseTo(r.w, 3);
      expect(v.h).toBeCloseTo(r.h, 3);
      expect(v.y).toBeCloseTo(r.y, 3);
      // El borde exterior de la izquierda está a la misma distancia del borde del papel que el de la derecha.
      expect(v.x).toBeCloseTo(W - r.x - r.w, 3);
    }
  });

  it('un ajuste de una sola página no se espeja', async () => {
    const { doc } = await openDocument(base());
    const verso = doc.plan.pages.find((p) => p.type === 'notes' && p.side === 'verso')!;
    const before = blockBounds(doc.page(verso.index).blocks.find((b) => b.id === 'notes.area')!);
    const d = parseDesign({ ...base(), overrides: [ov({ blockId: 'notes.area', pageType: 'notes', pageKey: verso.key, scale: 0.8 })] });
    const { doc: out } = await openDocument(d);
    const after = blockBounds(out.page(verso.index).blocks.find((b) => b.id === 'notes.area')!);
    // La esquina superior izquierda queda donde estaba: la escala de una página sola se ancla ahí, como siempre.
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.w).toBeCloseTo(before.w * 0.8, 3);
  });
});
