/**
 * Marcas del pliego: la marca de cotejo queda sobre el lomo, pero el número del cuadernillo no cruza
 * la marca de doblez ni la de cotejo (antes estaba centrado justo sobre el doblez).
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import type { AgendaDocument } from '../src/core/document';
import { SIGNATURE_LABEL_GAP } from '../src/core/imposition/compose';
import type { Prim, TextPrim } from '../src/core/layout/prims';
import { openDocument } from './helpers/node-env';

const design = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

/** Primitivas de marcas de la primera cara frontal del primer cuadernillo (sin las páginas, que van en grupos). */
function firstFront(doc: AgendaDocument): { marks: Prim[]; cx: number } {
  const side = doc.sides().find((s) => s.side === 'front' && s.sheetInSignature === 0 && s.signature === 0)!;
  const sheet = doc.sheet(side);
  const outer = sheet.prims[0];
  const children = outer?.t === 'group' ? outer.children : [];
  return { marks: children.filter((p) => p.t !== 'group'), cx: doc.format.cellW };
}

const labelOf = (marks: Prim[]): TextPrim | undefined => marks.find((p): p is TextPrim => p.t === 'text');

describe('número de cuadernillo', () => {
  it('queda a la derecha del doblez, sin cruzar su marca ni la de cotejo', async () => {
    const { doc } = await openDocument(design((d) => void (d.binding.method = 'sewn')));
    const { marks, cx } = firstFront(doc);
    const label = labelOf(marks);
    expect(label).toBeDefined();
    expect(label!.x).toBeCloseTo(cx + SIGNATURE_LABEL_GAP, 6);
    // La marca de cotejo (cx ± 1) y la de doblez (la línea en cx) quedan a su izquierda.
    const collation = marks.find((p) => p.t === 'rect');
    expect(collation).toBeDefined();
    expect(label!.x).toBeGreaterThan(cx + 1);
    for (const p of marks) if (p.t === 'line' && p.x1 === p.x2) expect(p.x1).toBeLessThan(label!.x);
  });

  it('sin la opción no hay número; en cuadernillo a caballete no hay número ni cotejo', async () => {
    const off = await openDocument(design((d) => void ((d.binding.method = 'sewn'), (d.binding.marks.signatureLabel = false))));
    expect(labelOf(firstFront(off.doc).marks)).toBeUndefined();
    const saddle = await openDocument(design((d) => void (d.binding.method = 'saddle')));
    const { marks } = firstFront(saddle.doc);
    expect(labelOf(marks)).toBeUndefined();
    expect(marks.some((p) => p.t === 'rect')).toBe(false);
  });
});
