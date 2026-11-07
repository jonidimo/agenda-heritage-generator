/** Reencontrar las imágenes por ruta entre los archivos de la carpeta que la persona elige. */
import { describe, expect, it } from 'vitest';
import { matchRelinkFiles, normalizeRelinkPath } from '../src/core/assets/relink';

const file = (path: string) => ({ path, name: path.slice(path.lastIndexOf('/') + 1) });
const asset = (id: string, path: string) => ({ id, path });
const ids = (r: ReturnType<typeof matchRelinkFiles>) => r.matched.map((m) => `${m.id}=${m.file.path}`);

describe('normalizeRelinkPath', () => {
  it('unifica separadores, quita «./» y barras repetidas, y compone Unicode', () => {
    expect(normalizeRelinkPath('.\\assets\\\\cover.png')).toBe('assets/cover.png');
    expect(normalizeRelinkPath('./assets//cover.png')).toBe('assets/cover.png');
    expect(normalizeRelinkPath('/assets/cover.png')).toBe('assets/cover.png');
    expect(normalizeRelinkPath('imagenes/café.png')).toBe('imagenes/café.png');
  });
});

describe('matchRelinkFiles', () => {
  it('la carpeta elegida es la de la agenda: la misma ruta', () => {
    const r = matchRelinkFiles([asset('a', 'assets/cover.png'), asset('b', 'assets/escudo.jpg')], [file('assets/cover.png'), file('assets/escudo.jpg'), file('a.agenda.json')]);
    expect(ids(r)).toEqual(['a=assets/cover.png', 'b=assets/escudo.jpg']);
    expect(r.missing).toEqual([]);
  });

  it('la carpeta elegida contiene a la de la agenda', () => {
    const r = matchRelinkFiles([asset('a', 'assets/cover.png')], [file('Boca/assets/cover.png'), file('Boca/otra.png')]);
    expect(ids(r)).toEqual(['a=Boca/assets/cover.png']);
  });

  it('la carpeta elegida es la de las imágenes sola', () => {
    const r = matchRelinkFiles([asset('a', 'assets/cover.png')], [file('cover.png'), file('escudo.jpg')]);
    expect(ids(r)).toEqual(['a=cover.png']);
  });

  it('sin distinguir mayúsculas, y con barras de Windows', () => {
    expect(ids(matchRelinkFiles([asset('a', 'Assets\\Cover.PNG')], [file('assets/cover.png')]))).toEqual(['a=assets/cover.png']);
  });

  it('por el nombre solo, si es el único', () => {
    expect(ids(matchRelinkFiles([asset('a', 'imagenes/cover.png')], [file('fotos/2027/cover.png'), file('fotos/otra.png')]))).toEqual(['a=fotos/2027/cover.png']);
  });

  it('con dos archivos posibles no adivina: queda sin encontrar', () => {
    const r = matchRelinkFiles([asset('a', 'imagenes/cover.png')], [file('x/cover.png'), file('y/cover.png')]);
    expect(r.matched).toEqual([]);
    expect(r.missing).toEqual(['a']);
  });

  it('la misma ruta gana sobre un nombre repetido en otra carpeta', () => {
    const r = matchRelinkFiles([asset('a', 'assets/cover.png')], [file('assets/cover.png'), file('viejo/cover.png')]);
    expect(ids(r)).toEqual(['a=assets/cover.png']);
  });

  it('lo que no está queda como faltante, y dos imágenes con la misma ruta usan el mismo archivo', () => {
    const r = matchRelinkFiles([asset('a', 'assets/cover.png'), asset('b', 'assets/cover.png'), asset('c', 'assets/no-esta.png')], [file('assets/cover.png')]);
    expect(ids(r)).toEqual(['a=assets/cover.png', 'b=assets/cover.png']);
    expect(r.missing).toEqual(['c']);
  });

  it('una carpeta vacía no encuentra nada', () => {
    expect(matchRelinkFiles([asset('a', 'x.png')], []).missing).toEqual(['a']);
  });
});
