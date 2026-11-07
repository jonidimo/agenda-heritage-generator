/** Un archivo de agenda autocontenido lleva los bytes de cada imagen y ya no la ruta que apuntaba a ella. */
import { describe, expect, it } from 'vitest';
import { embeddedAsset } from '../src/app/state/persist';

const BASE = { id: 'img1', name: 'Escudo', kind: 'raster', mime: 'image/png', width: 10, height: 10, builtin: null } as const;

describe('embeddedAsset', () => {
  it('con los bytes: van adentro en base64 y la ruta se borra', () => {
    const out = embeddedAsset({ ...BASE, path: 'assets/escudo.png' }, new Uint8Array([104, 104, 105]));
    expect(out.data).toBe('aGhp');
    expect(out.path).toBeNull();
  });

  it('sin los bytes: queda como estaba, con su ruta para que quien lo abra sepa dónde buscarlo', () => {
    expect(embeddedAsset({ ...BASE, path: 'assets/escudo.png' }, undefined)).toMatchObject({ path: 'assets/escudo.png', data: null });
    expect(embeddedAsset({ ...BASE, path: 'assets/escudo.png', data: 'aGhp' }, undefined)).toMatchObject({ path: 'assets/escudo.png', data: 'aGhp' });
  });

  it('un recurso integrado no se toca', () => {
    const builtin = { ...BASE, builtin: 'watermarks/colibri.svg' };
    expect(embeddedAsset(builtin, new Uint8Array([1]))).toBe(builtin);
  });
});
