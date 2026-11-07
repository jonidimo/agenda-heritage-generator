/** Cuánto achicar una imagen, el filtro que la achica y la caché: la parte de remuestreo que no depende de ningún códec. */
import { describe, expect, it, vi } from 'vitest';
import { canResample, areaResize, cachedResampler, pickSmaller, resampleTarget } from '../src/core/assets/resample';
import { jpegOrientation } from '../src/core/assets/image';
import { hasTransparentPixels } from '../src/core/util/pixels';
import { makePng } from './helpers/png';

describe('resampleTarget', () => {
  it('achica a lo que hace falta al tamaño impreso, con la proporción de la imagen', () => {
    // 4000×3000 px impresa a 100×75 mm a 300 ppp: 1181,1 → 1182 (se redondea hacia arriba) × 886.
    expect(resampleTarget({ w: 4000, h: 3000 }, { maxWmm: 100, maxHmm: 75 }, 300)).toEqual({ w: 1182, h: 886 });
    expect(resampleTarget({ w: 4000, h: 3000 }, { maxWmm: 100, maxHmm: 75 }, 150)).toEqual({ w: 591, h: 443 });
  });

  it('no toca lo que no tiene al menos una vez y media lo necesario', () => {
    // Hacen falta 1182 px: con 1700 hay menos de 1,5× (1773), no vale la pena.
    expect(resampleTarget({ w: 1700, h: 1275 }, { maxWmm: 100, maxHmm: 75 }, 300)).toBeNull();
    expect(resampleTarget({ w: 1800, h: 1350 }, { maxWmm: 100, maxHmm: 75 }, 300)).not.toBeNull();
    // Una imagen chica nunca se agranda.
    expect(resampleTarget({ w: 400, h: 300 }, { maxWmm: 100, maxHmm: 75 }, 300)).toBeNull();
  });

  it('alcanza para las dos medidas: una caja ancha y baja con una imagen cuadrada conserva el ancho que hace falta', () => {
    const t = resampleTarget({ w: 4000, h: 4000 }, { maxWmm: 100, maxHmm: 20 }, 300)!;
    expect(t.w).toBeGreaterThanOrEqual(1181);
    expect(t.w).toBe(t.h);
  });

  it('medidas inválidas no dan nada', () => {
    expect(resampleTarget({ w: 0, h: 10 }, { maxWmm: 10, maxHmm: 10 }, 300)).toBeNull();
    expect(resampleTarget({ w: 4000, h: 3000 }, { maxWmm: 0, maxHmm: 10 }, 300)).toBeNull();
  });
});

describe('pickSmaller', () => {
  const original = makePng(40, 40, [1, 2, 3], { noise: true });
  it('el candidato solo si pesa menos y tiene el tamaño pedido', () => {
    const small = makePng(10, 10, [1, 2, 3]);
    expect(pickSmaller(original, small, { w: 10, h: 10 })).toBe(small);
    expect(pickSmaller(original, small, { w: 12, h: 12 })).toBe(original);
    expect(pickSmaller(original, null, { w: 10, h: 10 })).toBe(original);
    expect(pickSmaller(original, new Uint8Array([1, 2, 3]), { w: 10, h: 10 })).toBe(original);
    // Más pesado que el original: se queda el original.
    const bigger = makePng(60, 60, [1, 2, 3], { noise: true });
    expect(pickSmaller(original, bigger, { w: 60, h: 60 })).toBe(original);
  });
});

describe('areaResize', () => {
  const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
  it('promedia el área: dos píxeles negro y blanco dan gris, y una reducción exacta por 2 promedia cuatro', () => {
    const src = new Uint8Array([...px(0, 0, 0), ...px(255, 255, 255)]);
    expect(Array.from(areaResize(src, 2, 1, 1, 1))).toEqual([128, 128, 128, 255]);
    const four = new Uint8Array([...px(0, 0, 0), ...px(100, 0, 0), ...px(0, 100, 0), ...px(0, 0, 100)]);
    expect(Array.from(areaResize(four, 2, 2, 1, 1))).toEqual([25, 25, 25, 255]);
  });

  it('un color liso sigue igual a cualquier tamaño, incluso con un factor que no es entero', () => {
    const w = 7;
    const h = 5;
    const src = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) src.set(px(200, 30, 90), i * 4);
    const out = areaResize(src, w, h, 3, 2);
    for (let i = 0; i < 6; i++) expect(Array.from(out.subarray(i * 4, i * 4 + 4))).toEqual([200, 30, 90, 255]);
  });

  it('el color se promedia con el alfa por delante: un borde transparente no se mancha de negro', () => {
    // Un píxel rojo opaco al lado de uno transparente (que guarda negro): queda rojo, a media opacidad.
    const src = new Uint8Array([...px(255, 0, 0), ...px(0, 0, 0, 0)]);
    expect(Array.from(areaResize(src, 2, 1, 1, 1))).toEqual([255, 0, 0, 128]);
  });

  it('solo achica, y rechaza buffers que no son del tamaño dicho', () => {
    expect(() => areaResize(new Uint8Array(16), 2, 2, 4, 4)).toThrow(RangeError);
    expect(() => areaResize(new Uint8Array(4), 2, 2, 1, 1)).toThrow(RangeError);
  });
});

describe('cachedResampler', () => {
  it('el mismo contenido y tamaño se achica una vez', async () => {
    const inner = vi.fn(async () => new Uint8Array([1]));
    const cached = cachedResampler(inner);
    const bytes = makePng(8, 8, [9, 9, 9]);
    await cached(bytes, 'image/png', { w: 4, h: 4 }, 0.9);
    await cached(new Uint8Array(bytes), 'image/png', { w: 4, h: 4 }, 0.9);
    expect(inner).toHaveBeenCalledTimes(1);
    await cached(bytes, 'image/png', { w: 2, h: 2 }, 0.9);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

describe('qué se puede remuestrear', () => {
  /** Un JPEG mínimo (solo cabeceras) con una marca de orientación EXIF. */
  function jpegWithOrientation(orientation: number | null, little = true): Uint8Array {
    const exif: number[] = [];
    if (orientation !== null) {
      const w16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
      const w32 = (v: number) => (little ? [v & 255, (v >> 8) & 255, 0, 0] : [0, 0, (v >> 8) & 255, v & 255]);
      exif.push(...[0x45, 0x78, 0x69, 0x66, 0, 0], ...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...w16(42), ...w32(8), ...w16(1), ...w16(0x0112), ...w16(3), ...w32(1), ...w16(orientation), 0, 0, ...w32(0));
    }
    const app1 = orientation === null ? [] : [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif];
    // SOF0: 8 bits, 4×4, 3 componentes.
    const sof = [0xff, 0xc0, 0, 17, 8, 0, 4, 0, 4, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0];
    return new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xd9]);
  }

  it('lee la orientación EXIF en los dos órdenes de bytes, y sin marca es la derecha', () => {
    expect(jpegOrientation(jpegWithOrientation(null))).toBe(1);
    expect(jpegOrientation(jpegWithOrientation(6))).toBe(6);
    expect(jpegOrientation(jpegWithOrientation(8, false))).toBe(8);
    expect(jpegOrientation(jpegWithOrientation(99))).toBe(1);
    expect(jpegOrientation(new Uint8Array([1, 2, 3]))).toBe(1);
  });

  it('un JPEG girado por EXIF no se remuestrea; uno derecho sí; tampoco lo que no es una imagen', () => {
    expect(canResample(jpegWithOrientation(null))).toBe(true);
    expect(canResample(jpegWithOrientation(1))).toBe(true);
    expect(canResample(jpegWithOrientation(6))).toBe(false);
    expect(canResample(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
    expect(canResample(makePng(4, 4, [1, 1, 1]))).toBe(true);
  });

  it('hasTransparentPixels mira solo el alfa', () => {
    expect(hasTransparentPixels(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
    expect(hasTransparentPixels(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(true);
  });
});
