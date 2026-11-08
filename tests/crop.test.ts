/** Recorte, orientación y tamaño de salida de las imágenes importadas. */
import { describe, expect, it } from 'vitest';
import { cropRgba, orientRgba, outputSize, planCrop } from '../src/core/assets/crop';

describe('planCrop', () => {
  it('sin pedido, la imagen entera', () => {
    expect(planCrop({ w: 400, h: 300 }, {})).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('a una proporción: la zona más grande, centrada', () => {
    // Apaisada 4:3 a vertical 1:2: la altura se conserva y se recorta el ancho.
    expect(planCrop({ w: 400, h: 300 }, { aspect: 0.5 })).toEqual({ x: 125, y: 0, w: 150, h: 300 });
    // Vertical a apaisada: se conserva el ancho.
    expect(planCrop({ w: 300, h: 400 }, { aspect: 2 })).toEqual({ x: 0, y: 125, w: 300, h: 150 });
    // La misma proporción: nada que recortar.
    expect(planCrop({ w: 400, h: 300 }, { aspect: 4 / 3 })).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('el foco corre el recorte sin salirse de la imagen', () => {
    expect(planCrop({ w: 400, h: 300 }, { aspect: 0.5, focus: { x: 0, y: 0.5 } })).toMatchObject({ x: 0, w: 150 });
    expect(planCrop({ w: 400, h: 300 }, { aspect: 0.5, focus: { x: 1, y: 0.5 } })).toMatchObject({ x: 250, w: 150 });
    expect(planCrop({ w: 400, h: 300 }, { aspect: 0.5, focus: { x: 0.25, y: 0.5 } })).toMatchObject({ x: 25 });
    expect(planCrop({ w: 300, h: 400 }, { aspect: 2, focus: { x: 0.5, y: 1 } })).toMatchObject({ y: 250 });
    // Un foco fuera de rango se acota.
    expect(planCrop({ w: 400, h: 300 }, { aspect: 0.5, focus: { x: 9, y: -3 } })).toMatchObject({ x: 250 });
  });

  it('una zona elegida manda sobre la proporción y se acota a la imagen', () => {
    expect(planCrop({ w: 1000, h: 500 }, { aspect: 0.5, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } })).toEqual({ x: 100, y: 100, w: 500, h: 250 });
    const r = planCrop({ w: 100, h: 100 }, { crop: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } });
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
    expect(r.w).toBeGreaterThan(0);
  });
});

/** Una imagen RGBA donde cada píxel lleva su posición (x en rojo, y en verde). */
const grid = (w: number, h: number): Uint8Array => {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x, y, 0, 255], (y * w + x) * 4);
  return d;
};
const at = (img: { data: Uint8Array; w: number }, x: number, y: number): [number, number] => [img.data[(y * img.w + x) * 4]!, img.data[(y * img.w + x) * 4 + 1]!];

describe('orientRgba', () => {
  // Una imagen de 3×2: el píxel (0,0) es el de arriba a la izquierda.
  const src = grid(3, 2);

  it('1 y valores raros: sin cambios', () => {
    expect(orientRgba(src, 3, 2, 1)).toMatchObject({ w: 3, h: 2 });
    expect(orientRgba(src, 3, 2, 9)).toMatchObject({ w: 3, h: 2 });
    expect(orientRgba(src, 3, 2, 0)).toMatchObject({ w: 3, h: 2 });
  });

  it.each([
    // [orientación, ancho, alto, dónde queda lo que era el píxel (0,0) de arriba a la izquierda]
    [2, 3, 2, [2, 0]],
    [3, 3, 2, [2, 1]],
    [4, 3, 2, [0, 1]],
    [5, 2, 3, [0, 0]],
    [6, 2, 3, [1, 0]],
    [7, 2, 3, [1, 2]],
    [8, 2, 3, [0, 2]],
  ] as const)('orientación %i: %i×%i y la esquina original va a %j', (o, w, h, [cx, cy]) => {
    const out = orientRgba(src, 3, 2, o);
    expect([out.w, out.h]).toEqual([w, h]);
    // Donde llegó la esquina (0,0) original se lee su marca (0,0).
    expect(at(out, cx, cy)).toEqual([0, 0]);
    // Y ningún píxel se pierde ni se repite.
    const seen = new Set<string>();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) seen.add(at(out, x, y).join(','));
    expect(seen.size).toBe(6);
  });

  it('6 es girar 90° en el sentido del reloj: lo de arriba a la derecha queda abajo a la derecha', () => {
    const out = orientRgba(src, 3, 2, 6);
    // El píxel (2,0) original (arriba a la derecha) pasa a (1,2) (abajo a la derecha).
    expect(at(out, 1, 2)).toEqual([2, 0]);
  });
});

describe('cropRgba', () => {
  it('copia solo la zona', () => {
    const out = cropRgba(grid(5, 4), 5, { x: 1, y: 2, w: 3, h: 2 });
    expect(out.length).toBe(3 * 2 * 4);
    expect([out[0], out[1]]).toEqual([1, 2]);
    expect([out[(1 * 3 + 2) * 4], out[(1 * 3 + 2) * 4 + 1]]).toEqual([3, 3]);
  });
});

describe('outputSize', () => {
  it('sin medidas solo se acota el lado mayor', () => {
    expect(outputSize({ w: 2000, h: 1000 }, null, 300, 4000)).toEqual({ w: 2000, h: 1000 });
    expect(outputSize({ w: 8000, h: 4000 }, null, 300, 4000)).toEqual({ w: 4000, h: 2000 });
  });

  it('achica a los ppp pedidos al tamaño en que se imprime, sin agrandar nunca', () => {
    // 100 × 50 mm a 300 ppp = 1181 × 591 px.
    expect(outputSize({ w: 4000, h: 2000 }, { w: 100, h: 50 }, 300, 4000)).toEqual({ w: 1181, h: 591 });
    expect(outputSize({ w: 800, h: 400 }, { w: 100, h: 50 }, 300, 4000)).toEqual({ w: 800, h: 400 });
  });

  it('con proporciones distintas cubre las dos medidas', () => {
    const o = outputSize({ w: 4000, h: 3000 }, { w: 100, h: 100 }, 300, 4000);
    expect(o.w).toBeGreaterThanOrEqual(1181);
    expect(o.h).toBeGreaterThanOrEqual(1181);
  });
});
