/** El remuestreo de imágenes en Node (línea de comandos y servidor MCP): mismo códec, menos píxeles, menos bytes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { rasterInfo } from '../src/core/assets/image';
import { nodeResampler } from '../src/node/resample';
import { makePng } from './helpers/png';
import { ROOT } from './helpers/node-env';

const FOTO = new Uint8Array(readFileSync(join(ROOT, 'docs/images/tapa.jpg')));

describe('nodeResampler', () => {
  it('un JPEG sigue siendo JPEG, con el tamaño pedido y menos bytes', async () => {
    const out = await nodeResampler(FOTO, 'image/jpeg', { w: 300, h: 404 }, 0.9);
    expect(out).not.toBeNull();
    expect(rasterInfo(out!)).toMatchObject({ mime: 'image/jpeg', width: 300, height: 404 });
    expect(out!.length).toBeLessThan(FOTO.length / 2);
  });

  it('un PNG opaco sigue siendo PNG y va como RGB; con transparencia, como RGBA y con su alfa', async () => {
    const opaque = makePng(1200, 800, [30, 140, 70], { noise: true });
    const small = await nodeResampler(opaque, 'image/png', { w: 400, h: 267 }, 0.9);
    expect(rasterInfo(small!)).toMatchObject({ mime: 'image/png', width: 400, height: 267 });
    expect(small![25]).toBe(2); // tipo de color de IHDR: RGB
    // (Que pese menos no está garantizado en un PNG: por eso, al exportar, solo se usa si pesa menos que el original.)

    const translucent = makePng(600, 600, [30, 140, 70], { alpha: 128 });
    const smallAlpha = await nodeResampler(translucent, 'image/png', { w: 200, h: 200 }, 0.9);
    expect(smallAlpha![25]).toBe(6); // RGBA
    const read = PNG.sync.read(Buffer.from(smallAlpha!));
    expect([read.data[0], read.data[1], read.data[2], read.data[3]]).toEqual([30, 140, 70, 128]);
  });

  it('el color de una imagen lisa no cambia al achicarla', async () => {
    const flat = makePng(900, 900, [200, 30, 30]);
    const out = PNG.sync.read(Buffer.from((await nodeResampler(flat, 'image/png', { w: 300, h: 300 }, 0.9))!));
    expect(Array.from(out.data.subarray(0, 4))).toEqual([200, 30, 30, 255]);
  });

  it('no agranda, ni toca lo que no se puede leer', async () => {
    expect(await nodeResampler(FOTO, 'image/jpeg', { w: 2000, h: 2000 }, 0.9)).toBeNull();
    expect(await nodeResampler(new Uint8Array([1, 2, 3, 4]), 'image/jpeg', { w: 2, h: 2 }, 0.9)).toBeNull();
    expect(await nodeResampler(new Uint8Array([1, 2, 3, 4]), 'image/png', { w: 2, h: 2 }, 0.9)).toBeNull();
  });
});
