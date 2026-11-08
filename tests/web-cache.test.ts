/** La caché de búsquedas: memoria, disco, vencimiento y que no guarde claves. */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cacheName, CACHE_TTL_MS, createCache, defaultCacheDir } from '../src/node/web/cache';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-cache-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createCache', () => {
  it('guarda y devuelve en memoria', async () => {
    const c = createCache({ dir: null });
    expect(await c.get('search', 'gato')).toBeUndefined();
    await c.set('search', 'gato', { hits: [1, 2] });
    expect(await c.get('search', 'gato')).toEqual({ hits: [1, 2] });
    expect(await c.get('hit', 'gato')).toBeUndefined();
  });

  it('vence a las 24 horas', async () => {
    let now = 1_000_000;
    const c = createCache({ dir: null, now: () => now });
    await c.set('s', 'k', 'v');
    now += CACHE_TTL_MS - 1;
    expect(await c.get('s', 'k')).toBe('v');
    now += 2;
    expect(await c.get('s', 'k')).toBeUndefined();
  });

  it('sobrevive a un reinicio: otro proceso la lee del disco', async () => {
    await createCache({ dir }).set('search', 'gato negro', { total: 3 });
    const other = createCache({ dir });
    expect(await other.get('search', 'gato negro')).toEqual({ total: 3 });
  });

  it('no escribe el texto de la clave ni deja archivos a medias', async () => {
    await createCache({ dir }).set('search', 'https://pixabay.com/api/?key=SECRETA&q=gato', { ok: 1 });
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^search-[0-9a-f]{40}\.json$/);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(await readFile(join(dir, files[0]!), 'utf8')).not.toContain('SECRETA');
  });

  it('un archivo dañado es como no tener nada', async () => {
    await writeFile(join(dir, cacheName('search', 'x')), '{no es json');
    expect(await createCache({ dir }).get('search', 'x')).toBeUndefined();
    await writeFile(join(dir, cacheName('search', 'y')), JSON.stringify({ solo: 'esto' }));
    expect(await createCache({ dir }).get('search', 'y')).toBeUndefined();
  });

  it('con una carpeta imposible de escribir sigue funcionando en memoria', async () => {
    const c = createCache({ dir: join(dir, 'archivo.txt', 'dentro') });
    await writeFile(join(dir, 'archivo.txt'), 'x');
    await c.set('s', 'k', 1);
    expect(await c.get('s', 'k')).toBe(1);
  });

  it('la memoria tiene tope: se va el más viejo', async () => {
    const c = createCache({ dir: null, memoryMax: 2 });
    await c.set('s', 'a', 1);
    await c.set('s', 'b', 2);
    await c.set('s', 'c', 3);
    expect(await c.get('s', 'a')).toBeUndefined();
    expect(await c.get('s', 'c')).toBe(3);
  });
});

describe('defaultCacheDir', () => {
  it('cada sistema tiene su carpeta, y se puede cambiar o apagar', () => {
    expect(defaultCacheDir({}, 'linux', '/home/ana')).toBe('/home/ana/.cache/heritage-studio');
    expect(defaultCacheDir({ XDG_CACHE_HOME: '/x' }, 'linux', '/home/ana')).toBe('/x/heritage-studio');
    expect(defaultCacheDir({}, 'darwin', '/Users/ana')).toBe('/Users/ana/Library/Caches/HeritageStudio');
    expect(defaultCacheDir({ LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\Users\\ana')).toContain('HeritageStudio');
    expect(defaultCacheDir({ AGENDA_CACHE_DIR: '/otra' }, 'linux', '/h')).toBe('/otra');
    expect(defaultCacheDir({ AGENDA_CACHE_DIR: '' }, 'linux', '/h')).toBeNull();
  });
});
