/**
 * Imposición: cada página aparece una sola vez y, al plegar (o cortar y apilar)
 * las hojas impresas a doble faz, las páginas quedan en orden de lectura.
 */
import { describe, expect, it } from 'vitest';
import { BindingZ, type Design } from '../src/core/design/schema';
import type { PageFormat } from '../src/core/document/context';
import { backRotates, impose, impositionCoverage, type SheetSide } from '../src/core/imposition/impose';
import { planSignatures } from '../src/core/imposition/signatures';

const binding = (patch: Record<string, unknown> = {}): Design['binding'] => BindingZ.parse(patch);
const fmt2: PageFormat = { w: 148.5, h: 210, sheetW: 297, sheetH: 210, cellW: 148.5, cellH: 210, nUp: 2 } as PageFormat;

function sidesOf(sheets: SheetSide[], sheet: number): { front: SheetSide; back: SheetSide } {
  return { front: sheets.find((s) => s.sheet === sheet && s.side === 'front')!, back: sheets.find((s) => s.sheet === sheet && s.side === 'back')! };
}

/**
 * Hoja apaisada a doble faz volteada por el borde corto: detrás de la mitad derecha del
 * frente queda la mitad izquierda del dorso (y viceversa). Cada «hoja chica» (mitad de hoja)
 * debe tener una página impar al frente (recto, base 1) y la siguiente al dorso.
 */
function leaves(sheets: SheetSide[], nSheets: number): Array<{ right: [number | null, number | null]; left: [number | null, number | null] }> {
  return Array.from({ length: nSheets }, (_, i) => {
    const { front, back } = sidesOf(sheets, i);
    return { right: [front.slots[1]!.page, back.slots[0]!.page], left: [back.slots[1]!.page, front.slots[0]!.page] };
  });
}

describe('fórmula de cuadernillo', () => {
  it('2 hojas: 8|1, 2|7, 6|3, 4|5', () => {
    const plan = planSignatures(8, binding({ signature: { sheets: 2 } }));
    const s = impose(plan, fmt2, binding());
    const pages = s.map((x) => x.slots.map((sl) => (sl.page === null ? null : sl.page + 1)));
    expect(pages).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ]);
  });

  for (const sheets of [1, 2, 3, 4, 5, 6]) {
    for (const pageCount of [1, 7, 16, 37, 64, 101, 224]) {
      for (const last of ['shrink', 'pad'] as const) {
        it(`${sheets} hojas por cuadernillo, ${pageCount} páginas, último ${last}`, () => {
          const b = binding({ signature: { sheets, last } });
          const plan = planSignatures(pageCount, b);
          expect(plan.totalPages % 4).toBe(0);
          expect(plan.totalPages).toBeGreaterThanOrEqual(pageCount);
          expect(plan.signatures.reduce((a, g) => a + g.sheets, 0)).toBe(plan.totalSheets);
          if (last === 'pad') for (const g of plan.signatures) expect(g.sheets).toBe(sheets);
          const s = impose(plan, fmt2, b);
          expect(impositionCoverage(s, plan.totalPages)).toEqual({ missing: [], duplicated: [] });
          // Cada cuadernillo plegado se lee en orden: hojas chicas derechas de afuera hacia adentro, luego izquierdas de adentro hacia afuera.
          for (const g of plan.signatures) {
            const order: number[] = [];
            const ls = leaves(s, plan.totalSheets).slice(s.find((x) => x.signature === plan.signatures.indexOf(g))!.sheet, undefined).slice(0, g.sheets);
            for (const l of ls) order.push(l.right[0]!, l.right[1]!);
            for (const l of [...ls].reverse()) order.push(l.left[0]!, l.left[1]!);
            expect(order).toEqual(Array.from({ length: g.sheets * 4 }, (_, k) => g.firstPage + k));
          }
        });
      }
    }
  }

  it('equilibrado reparte las hojas en cuadernillos casi iguales', () => {
    const plan = planSignatures(224, binding({ signature: { mode: 'balanced', sheets: 5 } }));
    const sizes = plan.signatures.map((g) => g.sheets);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(56);
  });

  it('personalizado respeta la lista y achica el último', () => {
    const plan = planSignatures(40, binding({ signature: { mode: 'custom', custom: [3, 4], last: 'shrink' } }));
    expect(plan.signatures.map((g) => g.sheets)).toEqual([3, 4, 3]);
  });

  it('el creep corre las páginas hacia el lomo, más en las hojas interiores', () => {
    const b = binding({ signature: { sheets: 5 }, creep: { mode: 'caliper', caliper: 0.1 } });
    const s = impose(planSignatures(20, b), fmt2, b);
    const creeps = s.filter((x) => x.side === 'front').map((x) => x.slots[0]!.creep);
    [0, 0.1, 0.2, 0.3, 0.4].forEach((v, i) => expect(creeps[i]).toBeCloseTo(v, 9));
  });
});

describe('cortar y apilar, y una página por hoja', () => {
  it('cortar y apilar: mitad izquierda sobre la derecha da el orden correcto', () => {
    const b = binding({ method: 'cut-stack' });
    const plan = planSignatures(30, b);
    const s = impose(plan, fmt2, b);
    expect(impositionCoverage(s, plan.totalPages)).toEqual({ missing: [], duplicated: [] });
    const ls = leaves(s, plan.totalSheets);
    const order = [...ls.flatMap((l) => [l.left[1]!, l.left[0]!]), ...ls.flatMap((l) => [l.right[0]!, l.right[1]!])];
    expect(order).toEqual(Array.from({ length: plan.totalPages }, (_, k) => k));
  });

  it('una página por cara: frente impar, dorso par', () => {
    const b = binding({ method: 'single' });
    const plan = planSignatures(9, b);
    const fmt1 = { ...fmt2, sheetW: 148.5, cellW: 148.5, nUp: 1 } as PageFormat;
    const s = impose(plan, fmt1, b);
    expect(plan.totalPages).toBe(10);
    expect(s.filter((x) => x.side === 'front').map((x) => x.slots[0]!.page)).toEqual([0, 2, 4, 6, 8]);
    expect(s.filter((x) => x.side === 'back').map((x) => x.slots[0]!.page)).toEqual([1, 3, 5, 7, 9]);
  });
});

describe('dúplex', () => {
  it('solo se giran los dorsos cuando hace falta', () => {
    expect(backRotates(binding({ duplex: 'short-edge' }), 2)).toBe(false);
    expect(backRotates(binding({ duplex: 'long-edge' }), 2)).toBe(true);
    expect(backRotates(binding({ duplex: 'long-edge' }), 1)).toBe(false);
    expect(backRotates(binding({ duplex: 'manual', manualRotateBacks: true }), 2)).toBe(true);
    expect(backRotates(binding({ duplex: 'manual', manualRotateBacks: false }), 2)).toBe(false);
  });

  it('el corrimiento de registro se aplica solo a los dorsos', () => {
    const b = binding({ backOffset: { x: 0.8, y: -0.5 } });
    const s = impose(planSignatures(16, b), fmt2, b);
    for (const x of s) expect(x.offset).toEqual(x.side === 'back' ? { x: 0.8, y: -0.5 } : { x: 0, y: 0 });
  });
});
