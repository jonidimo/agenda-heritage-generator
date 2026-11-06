/** La barra superior se mide a sí misma: baja de nivel si no entra y vuelve a subir con margen. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitStep, LEVEL_HYSTERESIS, overflowGroups, TOP_LEVEL, type FitState, type TopbarLevel } from '../../src/app/state/topbarLayout';

/** Una barra simulada: cada nivel necesita este ancho. */
const NEED: Record<TopbarLevel, number> = { 3: 1500, 2: 1250, 1: 1000, 0: 0 };

/** Lo que haría la barra al dibujarse con `width`: repetir el paso hasta que se quede quieta. */
function settle(state: FitState, width: number): FitState {
  let s = state;
  for (let i = 0; i < 10; i++) {
    const next = fitStep(s, NEED[s.level], width);
    if (next.level === s.level) return next;
    s = next;
  }
  return s;
}

describe('nivel de la barra', () => {
  it('baja hasta que el contenido entra, y recuerda cuánto necesitaba cada nivel', () => {
    const s = settle({ level: TOP_LEVEL, need: {} }, 1100);
    expect(s.level).toBe(1);
    expect(s.need).toMatchObject({ 3: 1500, 2: 1250 });
  });

  it('vuelve a subir solo con el ancho que necesita más el margen', () => {
    const s = settle({ level: TOP_LEVEL, need: {} }, 1100);
    expect(fitStep(s, NEED[1], 1250 + LEVEL_HYSTERESIS - 1).level).toBe(1);
    expect(fitStep(s, NEED[1], 1250 + LEVEL_HYSTERESIS).level).toBe(2);
  });

  it('para cualquier ancho termina en el nivel más completo que entra, sin oscilar (propiedades)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 300, max: 2400 }), fc.integer({ min: 300, max: 2400 }), (w1, w2) => {
        const a = settle({ level: TOP_LEVEL, need: {} }, w1);
        expect(NEED[a.level]).toBeLessThanOrEqual(w1);
        const b = settle(a, w2);
        expect(NEED[b.level]).toBeLessThanOrEqual(w2);
        // Quieto: otro paso con el mismo ancho no cambia nada.
        expect(fitStep(b, NEED[b.level], w2).level).toBe(b.level);
      }),
    );
  });

  it('lo que pasa al menú «⋯» en cada nivel', () => {
    expect(overflowGroups(3)).toEqual([]);
    expect(overflowGroups(2)).toEqual([]);
    expect(overflowGroups(1)).toEqual(['toggles']);
    expect(overflowGroups(0)).toEqual(['history', 'zoom', 'toggles']);
  });
});
