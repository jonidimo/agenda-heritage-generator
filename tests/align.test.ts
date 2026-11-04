import { describe, expect, it } from 'vitest';
import { alignDeltas, centerGroupDeltas, distributeDeltas, tidyGridDeltas, unionRect } from '../src/core/layout/align';

const r = (x: number, y: number, w = 10, h = 5) => ({ x, y, w, h });
const apply = (rects: ReturnType<typeof r>[], ds: Array<{ dx: number; dy: number }>) => rects.map((q, i) => ({ ...q, x: q.x + ds[i]!.dx, y: q.y + ds[i]!.dy }));

describe('alinear y distribuir', () => {
  it('alinea a la izquierda, al centro y abajo de la selección', () => {
    const rs = [r(10, 0), r(14, 10, 20), r(7, 20, 6)];
    const ref = unionRect(rs);
    expect(apply(rs, alignDeltas(rs, 'left', ref)).map((q) => q.x)).toEqual([7, 7, 7]);
    expect(apply(rs, alignDeltas(rs, 'centerH', ref)).map((q) => q.x + q.w / 2)).toEqual([20.5, 20.5, 20.5]);
    expect(apply(rs, alignDeltas(rs, 'bottom', ref)).map((q) => q.y + q.h)).toEqual([25, 25, 25]);
  });

  it('distribuye con huecos iguales aunque los tamaños difieran', () => {
    const rs = [r(0, 0, 10), r(13, 0, 30), r(70, 0, 10)];
    const out = apply(rs, distributeDeltas(rs, 'x'));
    const gaps = [out[1]!.x - (out[0]!.x + out[0]!.w), out[2]!.x - (out[1]!.x + out[1]!.w)];
    expect(gaps[0]).toBeCloseTo(gaps[1]!, 9);
    expect(out[0]!.x).toBe(0);
    expect(out[2]!.x).toBe(70);
  });

  it('centra el grupo sin cambiar las posiciones relativas', () => {
    const rs = [r(0, 0), r(20, 10)];
    const out = apply(rs, centerGroupDeltas(rs, { x: 0, y: 0, w: 100, h: 100 }));
    const u = unionRect(out);
    expect(u.x + u.w / 2).toBeCloseTo(50, 9);
    expect(u.y + u.h / 2).toBeCloseTo(50, 9);
    expect(out[1]!.x - out[0]!.x).toBe(20);
  });

  it('ordena en cuadrícula doce meses en dos columnas', () => {
    const rs = Array.from({ length: 12 }, (_, i) => r(i % 2 === 0 ? 15 : 80, 20 + Math.floor(i / 2) * 30, 50, 25));
    rs[5] = { ...rs[5]!, x: rs[5]!.x + 2.3, y: rs[5]!.y - 1.7, w: 60, h: 30 }; // uno agrandado y corrido
    const out = apply(rs, tidyGridDeltas(rs));
    for (let i = 0; i < 12; i++) {
      expect(out[i]!.x).toBeCloseTo(i % 2 === 0 ? 15 : 80, 9);
      expect(out[i]!.y).toBeCloseTo(20 + Math.floor(i / 2) * 30, 9);
    }
  });
});
