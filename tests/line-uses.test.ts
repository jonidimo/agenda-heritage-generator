/** Usos de línea de un bloque: lo que el editor necesita para llevar al estilo de esa clase de línea. */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { openDocument } from './helpers/node-env';

const norma = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

describe('usos de línea de un bloque', () => {
  it('los filetes del encabezado dicen que son separadores, aun con un ornamento que reemplaza la línea', async () => {
    const plain = await openDocument(norma());
    const i = plain.doc.plan.pages.findIndex((p) => p.type === 'contacts');
    expect(plain.doc.page(i).blocks.find((b) => b.id === 'header.rule')!.uses).toEqual(['separator']);
    const styled = await openDocument(
      norma((d) => {
        d.theme.tokens = { lines: { separator: { pattern: 'repeat', ornament: 'builtin:fleuron', size: 3 } } };
      }),
    );
    const rule = styled.doc.page(i).blocks.find((b) => b.id === 'header.rule')!;
    expect(rule.uses).toEqual(['separator']);
    // Con la guarda, ya no queda ninguna línea con ese uso: sin `uses` el editor no sabría adónde llevar.
    const hasLine = (ps: readonly import('../src/core/layout/prims').Prim[]): boolean => ps.some((p) => (p.t === 'group' ? hasLine(p.children) : p.t === 'line' && p.stroke.use === 'separator'));
    expect(hasLine(rule.prims)).toBe(false);
  });
});
