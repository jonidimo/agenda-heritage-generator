/** Ornamentos integrados de tipo «centro» dibujados solo con M, L, C y Z: simétricos respecto de su eje vertical. */
import { describe, expect, it } from 'vitest';
import { BUILTIN_ORNAMENTS } from '../src/core/layout/ornaments';

/** Posiciones horizontales (x) de todos los puntos de control de un trazado con comandos M, L, C, Z absolutos. */
function xs(d: string): number[] {
  const out: number[] = [];
  for (const part of d.split(/(?=[MLCZ])/)) {
    const cmd = part[0];
    const nums = (part.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (cmd === 'Z') continue;
    for (let i = 0; i < nums.length; i += 2) out.push(nums[i]!);
  }
  return out;
}

describe('ornamentos de tipo centro', () => {
  for (const id of ['fleuron', 'scroll']) {
    it(`${id}: la extensión horizontal es simétrica respecto del centro`, () => {
      const o = BUILTIN_ORNAMENTS.find((x) => x.id === id)!;
      expect(o.kind).toBe('center');
      const w = 100;
      const all = o.draw(0, 0, w, w / o.aspect).flatMap((s) => xs(s.d));
      expect(all.length).toBeGreaterThan(0);
      expect((Math.min(...all) + Math.max(...all)) / 2).toBeCloseTo(w / 2, 3);
    });
  }

  it('el fleurón es solo el corazón: un único relleno que ocupa toda su caja', () => {
    const o = BUILTIN_ORNAMENTS.find((x) => x.id === 'fleuron')!;
    const shapes = o.draw(0, 0, 100, 100 / o.aspect);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.mode).toBe('fill');
    const all = xs(shapes[0]!.d);
    expect(Math.min(...all)).toBeLessThan(5);
    expect(Math.max(...all)).toBeGreaterThan(95);
  });
});
