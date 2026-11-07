/** Los bytes de una imagen que se reemplazan no dejan atrás lo que se sabía de los anteriores; sin Web Crypto no se cae nada. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resources } from '../../src/app/state/resources';
import { trySha256Hex, sha256Hex } from '../../src/core/util/digest';
import type { AssetInfo } from '../../src/core/layout/context';

const info = (id: string): AssetInfo => ({ id, kind: 'raster', aspect: 1, width: 10, height: 10, pxWidth: 10, pxHeight: 10 });

afterEach(() => {
  vi.unstubAllGlobals();
  resources.assetBytes.clear();
  resources.assetInfos.clear();
  resources.assetHashes.clear();
});

describe('putAsset', () => {
  it('con otros bytes para la misma id, el hash y las medidas de los anteriores se descartan', () => {
    resources.putAsset('logo', new Uint8Array([1]), info('logo'));
    resources.assetHashes.set('logo', 'viejo');
    resources.putAsset('logo', new Uint8Array([2]));
    expect(resources.assetBytes.get('logo')).toEqual(new Uint8Array([2]));
    expect(resources.assetHashes.has('logo')).toBe(false);
    expect(resources.assetInfos.has('logo')).toBe(false);
  });

  it('con sus medidas nuevas las guarda', () => {
    resources.putAsset('cover', new Uint8Array([3]), info('cover'));
    expect(resources.assetInfos.get('cover')).toEqual(info('cover'));
  });
});

describe('hash sin Web Crypto', () => {
  it('trySha256Hex devuelve null en lugar de fallar, y sha256Hex dice por qué', async () => {
    vi.stubGlobal('crypto', undefined);
    expect(await trySha256Hex(new Uint8Array([1]))).toBeNull();
    await expect(sha256Hex(new Uint8Array([1]))).rejects.toThrow(/Web Crypto/);
  });

  it('con Web Crypto da el hash de siempre', async () => {
    expect(await trySha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
