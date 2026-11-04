import { describe, expect, it } from 'vitest';
import { resizeRect } from '../src/core/layout/resize';

const o = { x: 20, y: 30, w: 40, h: 10 };
const page = { x: 0, y: 0, w: 148.5, h: 210 };

describe('redimensionar con tiradores', () => {
  it('los lados cambian una sola medida y dejan fijo el lado opuesto', () => {
    expect(resizeRect(o, 'e', 15, 99, { bounds: page })).toEqual({ x: 20, y: 30, w: 55, h: 10 });
    expect(resizeRect(o, 's', 99, 6, { bounds: page })).toEqual({ x: 20, y: 30, w: 40, h: 16 });
    expect(resizeRect(o, 'w', -5, 0, { bounds: page })).toEqual({ x: 15, y: 30, w: 45, h: 10 });
    expect(resizeRect(o, 'n', 0, -10, { bounds: page })).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });

  it('las esquinas cambian ancho y alto libremente, o en proporción con Mayús', () => {
    expect(resizeRect(o, 'se', 20, 2, { bounds: page })).toEqual({ x: 20, y: 30, w: 60, h: 12 });
    const p = resizeRect(o, 'se', 20, 2, { bounds: page, keepAspect: true });
    expect(p.w / p.h).toBeCloseTo(4, 6);
    expect(p).toEqual({ x: 20, y: 30, w: 60, h: 15 });
    const nw = resizeRect(o, 'nw', -20, 0, { bounds: page, keepAspect: true });
    expect(nw.x + nw.w).toBeCloseTo(60, 6);
    expect(nw.y + nw.h).toBeCloseTo(40, 6);
  });

  it('nunca sale de la página ni baja del mínimo', () => {
    expect(resizeRect(o, 'e', 500, 0, { bounds: page })).toEqual({ x: 20, y: 30, w: 128.5, h: 10 });
    expect(resizeRect(o, 'w', 500, 0, { bounds: page, min: 2 })).toEqual({ x: 58, y: 30, w: 2, h: 10 });
    const big = resizeRect(o, 'se', 500, 500, { bounds: page, keepAspect: true });
    expect(big.x + big.w).toBeLessThanOrEqual(148.5 + 1e-9);
    expect(big.w / big.h).toBeCloseTo(4, 6);
  });
});
