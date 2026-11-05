/** Encuadre del lienzo: el zoom que hace entrar un rectángulo y cuánto desplazar para verlo. */
import { describe, expect, it } from 'vitest';
import { scrollDelta, zoomForRect } from '../../src/app/state/viewport';

describe('zoomForRect', () => {
  it('llena el lado que primero se acaba, descontando el margen', () => {
    // Área 1000×600, margen 50 → útil 900×500. Un rectángulo de 90×25 mm: manda el ancho (10 px/mm).
    expect(zoomForRect({ w: 90, h: 25 }, { w: 1000, h: 600 }, 2, 50)).toBeCloseTo(5);
    // Uno alto: manda el alto (500/50 = 10 px/mm).
    expect(zoomForRect({ w: 10, h: 50 }, { w: 1000, h: 600 }, 4, 50)).toBeCloseTo(2.5);
  });

  it('un rectángulo sin tamaño no divide por cero', () => {
    expect(Number.isFinite(zoomForRect({ w: 0, h: 0 }, { w: 800, h: 600 }, 3, 40))).toBe(true);
  });
});

describe('scrollDelta', () => {
  const area = { w: 800, h: 600 };
  it('para centrar, lleva el centro del rectángulo al centro del área', () => {
    expect(scrollDelta({ x: 500, y: 100, w: 100, h: 50 }, area, false)).toEqual({ dx: 150, dy: -175 });
  });

  it('si se ve entero con margen, no mueve nada', () => {
    expect(scrollDelta({ x: 100, y: 100, w: 100, h: 50 }, area, true)).toEqual({ dx: 0, dy: 0 });
  });

  it('si queda fuera, mueve lo justo para que entre con su margen', () => {
    expect(scrollDelta({ x: 760, y: 10, w: 100, h: 50 }, area, true, 20)).toEqual({ dx: 80, dy: -10 });
    expect(scrollDelta({ x: -50, y: 590, w: 100, h: 50 }, area, true, 20)).toEqual({ dx: -70, dy: 60 });
  });

  it('si no cabe en el área, lo centra', () => {
    expect(scrollDelta({ x: 0, y: 0, w: 2000, h: 100 }, area, true).dx).toBe(600);
  });
});
