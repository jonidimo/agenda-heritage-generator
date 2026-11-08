/** Dejar lista una imagen descargada: orientación, recorte a la proporción, ppp de impresión y códec. */
import { decode } from 'jpeg-js';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { rasterInfo } from '../src/core/assets/image';
import { ImageError, prepareRaster, sniffImage } from '../src/node/web/prepareImage';
import { makeJpeg, withOrientation } from './helpers/jpeg';
import { makePng } from './helpers/png';

/** El píxel (x, y) de un JPEG, como [r, g, b]. */
function pixel(jpeg: Uint8Array, x: number, y: number): [number, number, number] {
  const img = decode(jpeg, { useTArray: true, formatAsRGBA: true });
  const o = (y * img.width + x) * 4;
  return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
}
const isBlue = ([r, g, b]: [number, number, number]): boolean => b > 200 && r < 80 && g < 80;

describe('sniffImage', () => {
  it('reconoce PNG, JPEG y SVG; no WebP, GIF ni basura', () => {
    expect(sniffImage(makePng(2, 2, [1, 2, 3]))).toBe('png');
    expect(sniffImage(makeJpeg(8, 8))).toBe('jpeg');
    expect(sniffImage(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="x"/>'))).toBe('svg');
    expect(sniffImage(new TextEncoder().encode('<html><svg></svg></html>'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe('sniffImage con entradas hostiles', () => {
  it('comentarios repetidos no cuelgan el reconocimiento', () => {
    const t0 = Date.now();
    expect(sniffImage(new TextEncoder().encode('<!-- -->'.repeat(1000)))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<!-- -->'.repeat(40) + '<svg xmlns="x"/>'))).toBe('svg');
    expect(sniffImage(new TextEncoder().encode('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "b">]><!-- c --><svg/>'))).toBe('svg');
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('prepareRaster', () => {
  it('sin medidas ni cambios, el JPEG queda con sus bytes originales', () => {
    const src = makeJpeg(200, 100);
    const out = prepareRaster(src, { dpi: 300 });
    expect(out.untouched).toBe(true);
    expect(out.bytes).toBe(src);
    expect(out).toMatchObject({ mime: 'image/jpeg', width: 200, height: 100, effectiveDpi: null });
  });

  it('se achica a los ppp pedidos al tamaño de impresión y devuelve cuántos alcanza', () => {
    // 2400×1200 px impresa a 100×50 mm: a 300 ppp son 1181×591.
    const out = prepareRaster(makeJpeg(2400, 1200), { dpi: 300, sizeMm: { w: 100, h: 50 } });
    expect(out.untouched).toBe(false);
    expect(rasterInfo(out.bytes)).toMatchObject({ width: 1181, height: 591 });
    expect(out.effectiveDpi).toBe(300);
    expect(out.upscaleNeeded).toBe(false);
  });

  it('una imagen chica no se agranda y avisa cuántos ppp alcanza', () => {
    const out = prepareRaster(makeJpeg(600, 300), { dpi: 300, sizeMm: { w: 100, h: 50 } });
    expect(out).toMatchObject({ width: 600, height: 300, effectiveDpi: 152, upscaleNeeded: true });
  });

  it('recorta una foto apaisada para una portada vertical, alrededor del foco', () => {
    // 1200×600 → portada de 100×200 mm (1:2): queda una franja de 300×600.
    const centered = prepareRaster(makeJpeg(1200, 600), { dpi: 150, sizeMm: { w: 100, h: 200 } });
    expect(centered.kept).toEqual({ x: 450, y: 0, w: 300, h: 600 });
    expect(rasterInfo(centered.bytes)!.width / rasterInfo(centered.bytes)!.height).toBeCloseTo(0.5, 1);
    const left = prepareRaster(makeJpeg(1200, 600), { dpi: 150, sizeMm: { w: 100, h: 200 }, focus: { x: 0, y: 0.5 } });
    expect(left.kept).toMatchObject({ x: 0, w: 300 });
    // La esquina azul de la foto (arriba a la izquierda) entra en el recorte de la izquierda y no en el del centro.
    expect(isBlue(pixel(left.bytes, 3, 3))).toBe(true);
    expect(isBlue(pixel(centered.bytes, 3, 3))).toBe(false);
  });

  it('una zona elegida a mano manda', () => {
    const out = prepareRaster(makeJpeg(1000, 500), { dpi: 300, crop: { x: 0, y: 0, w: 0.2, h: 0.4 } });
    expect(out.kept).toEqual({ x: 0, y: 0, w: 200, h: 200 });
    expect(rasterInfo(out.bytes)).toMatchObject({ width: 200, height: 200 });
  });

  it('la orientación EXIF se aplica a los píxeles (queda derecha, sin marca)', () => {
    const upright = makeJpeg(160, 80);
    // «6»: el lector la gira 90° a la derecha → 80×160, y la esquina azul (arriba a la izquierda) va arriba a la derecha.
    const turned = prepareRaster(withOrientation(upright, 6), { dpi: 300 });
    expect(turned.untouched).toBe(false);
    expect(rasterInfo(turned.bytes)).toMatchObject({ width: 80, height: 160 });
    expect(isBlue(pixel(turned.bytes, 77, 3))).toBe(true);
    expect(isBlue(pixel(turned.bytes, 3, 3))).toBe(false);
    // «3»: media vuelta, la esquina azul queda abajo a la derecha.
    const half = prepareRaster(withOrientation(upright, 3), { dpi: 300 });
    expect(rasterInfo(half.bytes)).toMatchObject({ width: 160, height: 80 });
    expect(isBlue(pixel(half.bytes, 157, 77))).toBe(true);
  });

  it('un PNG sigue siendo PNG: conserva la transparencia y anota los ppp', () => {
    const src = makePng(1200, 600, [200, 30, 30], { alpha: 128 });
    const out = prepareRaster(src, { dpi: 300, sizeMm: { w: 50, h: 25 } });
    expect(out.mime).toBe('image/png');
    expect(rasterInfo(out.bytes)).toMatchObject({ width: 591, height: 295, dpi: 300 });
    const png = PNG.sync.read(Buffer.from(out.bytes));
    expect(png.data[3]).toBe(128);
    // Sin transparencia, sale RGB (un canal menos).
    const opaque = prepareRaster(makePng(1200, 600, [10, 20, 30]), { dpi: 300, sizeMm: { w: 50, h: 25 } });
    expect(PNG.sync.read(Buffer.from(opaque.bytes)).alpha).toBe(false);
  });

  it('el lado mayor se acota a 4000 px', () => {
    const out = prepareRaster(makePng(5000, 100, [1, 2, 3]), { dpi: 300 });
    expect(rasterInfo(out.bytes)).toMatchObject({ width: 4000, height: 80 });
  });

  it('lo que no es PNG ni JPEG, o está dañado, falla con un mensaje claro', () => {
    expect(() => prepareRaster(new TextEncoder().encode('GIF89a...'), { dpi: 300 })).toThrow(ImageError);
    const broken = makeJpeg(100, 100).subarray(0, 300);
    expect(() => prepareRaster(broken, { dpi: 300 })).toThrow(/dañada|leer/);
  });

  it('una tapa grande llega a los 300 ppp: el tope de 4000 px es para el resto, no para ella', () => {
    // 434 × 303 mm a 300 ppp son 5126 px de ancho: más que el tope normal.
    const src = makePng(6000, 4200, [10, 20, 30]);
    const capped = prepareRaster(src, { dpi: 300, sizeMm: { w: 434, h: 303 } });
    expect(rasterInfo(capped.bytes)!.width).toBe(4000);
    expect(capped.upscaleNeeded).toBe(true);
    const full = prepareRaster(src, { dpi: 300, sizeMm: { w: 434, h: 303 }, maxSide: 12_000 });
    expect(full.effectiveDpi).toBeGreaterThanOrEqual(285);
    expect(full.upscaleNeeded).toBe(false);
  }, 30_000);

  it('un JPEG con EXIF (ubicación, cámara) no se incrusta con él, aunque no haga falta tocarlo', () => {
    const withExif = withOrientation(makeJpeg(100, 50), 1);
    const out = prepareRaster(withExif, { dpi: 300 });
    expect(out.untouched).toBe(false);
    expect(Buffer.from(out.bytes).includes(Buffer.from('Exif'))).toBe(false);
    expect(rasterInfo(out.bytes)).toMatchObject({ width: 100, height: 50 });
  });

  it('una imagen de demasiados megapíxeles se rechaza antes de decodificarla', () => {
    expect(() => prepareRaster(makePng(8000, 7000, [1, 2, 3]), { dpi: 300 })).toThrow(/demasiado grande/);
  }, 30_000);
});

