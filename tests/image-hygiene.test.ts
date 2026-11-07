/** Qué se hace con una imagen al subirla: tope de lado y de peso, formato de salida, nombre, hash del contenido. */
import { describe, expect, it } from 'vitest';
import { ASSET_MAX_BYTES, ASSET_MAX_SIDE_PX, fitWithin, outputFormatFor, renameForFormat } from '../src/core/assets/prepare';
import { sha256Hex } from '../src/core/util/digest';
import { ASSET_FILE_MAX_BYTES } from '../src/node/env';
import { ASSET_FILE_MAX_BYTES as ELECTRON_MAX } from '../electron/lib/assets.mjs';

describe('fitWithin', () => {
  it('una imagen que entra no se toca; una que pasa del tope se achica por su lado mayor, con su proporción', () => {
    expect(fitWithin(4000, 3000)).toBeNull();
    expect(fitWithin(800, 600)).toBeNull();
    expect(fitWithin(8000, 6000)).toEqual({ w: 4000, h: 3000 });
    expect(fitWithin(3000, 6000)).toEqual({ w: 2000, h: 4000 });
    expect(fitWithin(5000, 200)).toEqual({ w: 4000, h: 160 });
    // Nunca queda un lado en cero.
    expect(fitWithin(100000, 10)).toEqual({ w: 4000, h: 1 });
  });

  it('medidas inválidas no dan nada', () => {
    expect(fitWithin(0, 5000)).toBeNull();
    expect(fitWithin(Number.NaN, 5000)).toBeNull();
  });

  it('el tope es el de la hoja A4 a unos 340 ppp', () => {
    expect(ASSET_MAX_SIDE_PX).toBe(4000);
    expect(Math.round((ASSET_MAX_SIDE_PX / 297) * 25.4)).toBe(342);
  });
});

describe('outputFormatFor', () => {
  it('con transparencia siempre PNG; las fotos, JPEG; los dibujos planos (PNG, GIF), PNG', () => {
    expect(outputFormatFor('image/webp', true)).toBe('png');
    expect(outputFormatFor('image/jpeg', true)).toBe('png');
    for (const photo of ['image/webp', 'image/avif', 'image/heic', 'image/jpeg', '']) expect(outputFormatFor(photo, false)).toBe('jpeg');
    for (const flat of ['image/png', 'image/gif']) expect(outputFormatFor(flat, false)).toBe('png');
  });
});

describe('renameForFormat', () => {
  it('cambia la extensión al formato nuevo', () => {
    expect(renameForFormat('foto.webp', 'jpeg')).toBe('foto.jpg');
    expect(renameForFormat('Escudo Boca.final.HEIC', 'jpeg')).toBe('Escudo Boca.final.jpg');
    expect(renameForFormat('logo.gif', 'png')).toBe('logo.png');
    expect(renameForFormat('sin-extension', 'png')).toBe('sin-extension.png');
    expect(renameForFormat('.webp', 'jpeg')).toBe('imagen.jpg');
  });
});

describe('sha256Hex', () => {
  it('es el SHA-256 de siempre', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('tope de peso', () => {
  it('lo que se sube, lo que se lee de una carpeta y lo que lee el escritorio comparten el mismo tope', () => {
    expect(ASSET_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(ASSET_FILE_MAX_BYTES).toBe(ASSET_MAX_BYTES);
    expect(ELECTRON_MAX).toBe(ASSET_MAX_BYTES);
  });
});
