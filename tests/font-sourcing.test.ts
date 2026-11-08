/** Fuentes de Google Fonts: buscar, resolver archivos, revisar la cobertura y recortar. */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessFont } from '../src/core/text/coverage';
import { openFont } from '../src/core/text/fontkit';
import { ROOT } from '../src/node/env';
import { createSubsetter, isSfnt, LATIN_SUBSET } from '../src/node/subset';
import { createCache } from '../src/node/web/cache';
import { FAMILY_NAME, googleFontList, parseVariant, resolveFontFiles, searchFontList, variantName } from '../src/node/web/fonts';
import { sourceContext } from '../src/node/web/images';
import { fakeWeb } from './helpers/web';
import { googleList } from './helpers/services';

const font = async (rel: string): Promise<Uint8Array> => new Uint8Array(await readFile(join(ROOT, 'public', 'fonts', rel)));
const subsetWasm = createRequire(import.meta.url).resolve('harfbuzzjs/dist/harfbuzz-subset.wasm');
const subset = createSubsetter(async () => new Uint8Array(await readFile(subsetWasm)));

describe('assessFont', () => {
  it('una fuente completa: castellano, cifras y puntuación', async () => {
    const a = assessFont(openFont(await font('eb-garamond/EBGaramond-Regular.ttf')), { category: 'serif', weights: 6 });
    expect(a.fit).toBe('complete');
    expect(a.titleOnly).toEqual([]);
    expect(a.roles).toContain('body');
    expect(a.glyphs).toBeGreaterThan(300);
  });

  it('a una fuente sin ñ, tildes ni «¿¡» no la propone', async () => {
    const small = await subset(await font('manrope/Manrope-Bold.ttf'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,');
    const a = assessFont(openFont(small!), { weights: 3 });
    expect(a.fit).toBe('unsuitable');
    expect(a.missing.spanish).toEqual(expect.arrayContaining(['ñ', 'á', '¿', '¡']));
    expect(a.missing.basic).toEqual([]);
  });

  it('falta solo la puntuación o las cifras: sirve para castellano pero conviene solo para títulos', async () => {
    const small = await subset(await font('manrope/Manrope-Bold.ttf'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzñÑáéíóúüÁÉÍÓÚÜ¿¡ ');
    const a = assessFont(openFont(small!), { weights: 3 });
    expect(a.fit).toBe('incomplete');
    expect(a.missing.digits).toHaveLength(10);
    expect(a.titleOnly.join(' ')).toMatch(/cifras/);
    expect(a.roles).toEqual(['display', 'title']);
  });

  it('display, manuscritas y de un solo peso avisan que son para títulos', async () => {
    const f = openFont(await font('eb-garamond/EBGaramond-Regular.ttf'));
    expect(assessFont(f, { category: 'display' }).titleOnly[0]).toMatch(/exhibición/);
    expect(assessFont(f, { category: 'handwriting' }).titleOnly[0]).toMatch(/manuscrito/);
    expect(assessFont(f, { weights: 1 }).titleOnly[0]).toMatch(/un solo peso/);
  });
});

describe('createSubsetter', () => {
  it('recorta a las letras pedidas y conserva las que quedan', async () => {
    const src = await font('eb-garamond/EBGaramond-Regular.ttf');
    const small = (await subset(src, LATIN_SUBSET))!;
    expect(isSfnt(small)).toBe(true);
    const f = openFont(small);
    expect(f.hasGlyphForCodePoint('ñ'.codePointAt(0)!)).toBe(true);
    expect(f.hasGlyphForCodePoint('¿'.codePointAt(0)!)).toBe(true);
    expect(f.hasGlyphForCodePoint(0x20ac)).toBe(true);
    const tiny = (await subset(src, 'Hola ñ'))!;
    expect(tiny.length).toBeLessThan(src.length / 4);
    const t = openFont(tiny);
    expect(t.hasGlyphForCodePoint('ñ'.codePointAt(0)!)).toBe(true);
    expect(t.hasGlyphForCodePoint('Z'.codePointAt(0)!)).toBe(false);
  });

  it('conserva el kerning y la licencia, y el nombre de la familia', async () => {
    const src = await font('eb-garamond/EBGaramond-Regular.ttf');
    const before = openFont(src);
    const after = openFont((await subset(src, LATIN_SUBSET))!);
    expect(after.familyName).toBe(before.familyName);
    expect(after.availableFeatures).toContain('kern');
    expect(after.getName?.('copyright')).toBeTruthy();
    // El mismo texto ocupa lo mismo: el espaciado entre letras no cambia.
    expect(after.layout('Ave ñandú').advanceWidth).toBeCloseTo(before.layout('Ave ñandú').advanceWidth, 0);
  });

  it('una fuente comprimida (WOFF) o algo que no es una fuente no se toca', async () => {
    expect(await subset(new TextEncoder().encode('wOFF....'), 'a')).toBeNull();
    expect(await subset(new Uint8Array([1, 2, 3]), 'a')).toBeNull();
    await expect(subset(new Uint8Array([0, 1, 0, 0, 9, 9, 9, 9]), 'a')).rejects.toThrow();
    // Y la siguiente sigue andando.
    expect(await subset(await font('manrope/Manrope-Bold.ttf'), 'a')).not.toBeNull();
  });
});

describe('variantes y búsqueda', () => {
  it('los nombres de variante de Google', () => {
    expect(parseVariant('regular')).toEqual({ weight: 400, style: 'normal' });
    expect(parseVariant('italic')).toEqual({ weight: 400, style: 'italic' });
    expect(parseVariant('700italic')).toEqual({ weight: 700, style: 'italic' });
    expect(parseVariant('500')).toEqual({ weight: 500, style: 'normal' });
    expect(parseVariant('variable')).toBeNull();
    for (const v of ['regular', 'italic', '300', '700italic']) expect(variantName(parseVariant(v)!)).toBe(v);
  });

  it('nombres de familia: letras, números y unos pocos signos', () => {
    for (const ok of ['Bangers', 'Shippori Mincho', 'IBM Plex Sans', 'M PLUS 1p', "Rock 3D", 'Playfair Display SC']) expect(FAMILY_NAME.test(ok), ok).toBe(true);
    for (const bad of ['', '../etc', 'a;b', 'a\nb', '<script>', 'x'.repeat(81), ' Roboto']) expect(FAMILY_NAME.test(bad), bad).toBe(false);
  });

  it('busca sin importar tildes ni mayúsculas, ordena por cercanía y filtra', async () => {
    const web = fakeWeb([{ match: /webfonts\/v1\/webfonts/, body: googleList() }]);
    const ctx = sourceContext({ http: web.http, env: { GOOGLE_FONTS_API_KEY: 'goo-key-999' }, cache: createCache({ dir: null }) });
    const list = await googleFontList(ctx);
    expect(list.map((f) => f.family)).toEqual(['Roboto', 'Bangers', 'Shippori Mincho', 'Noto Sans JP']);
    expect(list[0]!.files['regular']).toBe('https://fonts.gstatic.com/s/roboto/r.ttf');
    const names = (q: Parameters<typeof searchFontList>[1]) => searchFontList(list, q).map((f) => f.family);
    expect(names({ query: 'bangers', limit: 5 })).toEqual(['Bangers']);
    expect(names({ query: 'MINCHO', limit: 5 })).toEqual(['Shippori Mincho']);
    expect(names({ query: '', category: 'display', limit: 5 })).toEqual(['Bangers']);
    expect(names({ query: '', subset: 'latin', limit: 10 })).toEqual(['Roboto', 'Bangers', 'Shippori Mincho']);
    expect(names({ query: '', italic: true, limit: 10 })).toEqual(['Roboto']);
    expect(names({ query: 'o', limit: 2 })).toHaveLength(2);
    expect(names({ query: 'inexistente', limit: 5 })).toEqual([]);
    // La lista se pide una sola vez (24 horas): buscar de nuevo no gasta llamadas.
    await googleFontList(ctx);
    expect(web.requests).toHaveLength(1);
    expect(new URL(web.requests[0]!).searchParams.get('key')).toBe('goo-key-999');
  });

  it('sin clave la búsqueda explica cómo conseguirla', async () => {
    const web = fakeWeb([]);
    const ctx = sourceContext({ http: web.http, env: {}, cache: createCache({ dir: null }) });
    await expect(googleFontList(ctx)).rejects.toThrow(/GOOGLE_FONTS_API_KEY/);
    expect(web.requests).toEqual([]);
  });
});

describe('resolveFontFiles', () => {
  it('con la lista de la API: la dirección de cada variante, y se avisa si falta una', async () => {
    const web = fakeWeb([{ match: /webfonts\/v1\/webfonts/, body: googleList() }]);
    const ctx = sourceContext({ http: web.http, env: { GOOGLE_FONTS_API_KEY: 'k' }, cache: createCache({ dir: null }) });
    const r = await resolveFontFiles('roboto', [{ weight: 400, style: 'normal' }, { weight: 700, style: 'normal' }], ctx);
    expect(r).toMatchObject({ family: 'Roboto', category: 'sans-serif' });
    expect(r.files.map((f) => f.url)).toEqual(['https://fonts.gstatic.com/s/roboto/r.ttf', 'https://fonts.gstatic.com/s/roboto/b.ttf']);
    await expect(resolveFontFiles('Bangers', [{ weight: 700, style: 'normal' }], ctx)).rejects.toThrow(/no tiene la variante 700/);
    await expect(resolveFontFiles('No Existe', [{ weight: 400, style: 'normal' }], ctx)).rejects.toThrow(/no tiene una familia/);
  });

  it('sin clave: la hoja de estilos de Google da las direcciones, con las variantes pedidas ordenadas', async () => {
    const css = (w: number, st: string) => `@font-face { font-family: 'Bangers'; font-style: ${st}; font-weight: ${w}; src: url(https://fonts.gstatic.com/s/bangers/v25/${st}${w}.ttf) format('truetype'); }`;
    const web = fakeWeb([{ match: /fonts\.googleapis\.com\/css2/, type: 'text/css; charset=utf-8', body: [css(400, 'normal'), css(700, 'normal'), css(400, 'italic')].join('\n') }]);
    const ctx = sourceContext({ http: web.http, env: {}, cache: createCache({ dir: null }) });
    const r = await resolveFontFiles('Shippori Mincho', [{ weight: 700, style: 'normal' }, { weight: 400, style: 'italic' }, { weight: 400, style: 'normal' }], ctx);
    expect(decodeURIComponent(web.requests[0]!)).toContain('family=Shippori+Mincho:ital,wght@0,400;0,700;1,400');
    expect(r.files).toHaveLength(3);
    expect(r.files.every((f) => f.url.startsWith('https://fonts.gstatic.com/'))).toBe(true);
    // Si Google no devuelve alguna, se dice cuál.
    const partial = fakeWeb([{ match: /css2/, type: 'text/css', body: css(400, 'normal') }]);
    await expect(resolveFontFiles('X', [{ weight: 400, style: 'normal' }, { weight: 900, style: 'normal' }], sourceContext({ http: partial.http, env: {}, cache: createCache({ dir: null }) }))).rejects.toThrow(/900/);
    // Una familia que no existe: Google contesta 400.
    const none = fakeWeb([{ match: /css2/, status: 400, body: 'Bad Request' }]);
    await expect(resolveFontFiles('Nada', [{ weight: 400, style: 'normal' }], sourceContext({ http: none.http, env: {}, cache: createCache({ dir: null }) }))).rejects.toThrow(/no tiene «Nada»/);
    await expect(resolveFontFiles('../x', [{ weight: 400, style: 'normal' }], ctx)).rejects.toThrow(/no es válido/);
  });
});
