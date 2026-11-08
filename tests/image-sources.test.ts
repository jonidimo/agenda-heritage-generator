/** Openverse, Pixabay y Unsplash: leer sus respuestas, filtrar, cachear y no depender de que todos anden. */
import { describe, expect, it } from 'vitest';
import { createCache } from '../src/node/web/cache';
import { downloadImage, fetchThumbnail, resolveHit, searchImages, sourceContext } from '../src/node/web/images';
import { openverseHit } from '../src/node/web/sources/openverse';
import { pixabayHit } from '../src/node/web/sources/pixabay';
import { unsplashHit } from '../src/node/web/sources/unsplash';
import { IMAGE_FILE_HOSTS } from '../src/node/web/guard';
import type { SearchRequest } from '../src/node/web/sources/types';
import { fakeWeb } from './helpers/web';
import { imageRoutes, OV_ID, openverseResults, pixabayResults, unsplashResults } from './helpers/services';

const request = (over: Partial<SearchRequest> = {}): SearchRequest => ({ query: 'estadio', license: 'any', type: 'any', limit: 6, page: 1, ...over });
const KEYS = { PIXABAY_API_KEY: 'pix-key-777', UNSPLASH_ACCESS_KEY: 'uns-key-888' };
function setup(env: Record<string, string> = {}, routes = imageRoutes()) {
  const web = fakeWeb(routes);
  return { web, ctx: sourceContext({ http: web.http, env, cache: createCache({ dir: null }) }) };
}

describe('las fichas', () => {
  it('Openverse: licencia con nombre y enlace, y de dónde se baja', () => {
    const [full, preview, svg] = (openverseResults() as { results: unknown[] }).results.map((r) => openverseHit(r, IMAGE_FILE_HOSTS))!;
    expect(full).toMatchObject({ id: `openverse:${OV_ID}`, license: 'CC BY 2.0', licenseKind: 'by', fileKind: 'full', fileUrl: 'https://live.staticflickr.com/65535/estadio_b.jpg', format: 'jpeg', creator: 'Jane Doe' });
    expect(full!.attribution).toBe('“Estadio de noche” de Jane Doe (CC BY 2.0), https://www.flickr.com/photos/jane/1');
    // Un dominio que no está en la lista: se baja la copia reducida de Openverse.
    expect(preview).toMatchObject({ license: 'CC0 1.0', licenseKind: 'cc0', fileKind: 'preview', format: 'other' });
    expect(preview!.fileUrl).toMatch(/^https:\/\/api\.openverse\.org\/v1\/images\/.+\/thumb\/$/);
    // Sin la dirección de la licencia, se arma.
    expect(svg).toMatchObject({ license: 'CC BY-SA 4.0', licenseKind: 'by-sa', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', format: 'svg' });
  });

  it('Openverse: lo que no tiene identificador o licencia, o viene raro, se descarta', () => {
    expect(openverseHit(null, IMAGE_FILE_HOSTS)).toBeNull();
    expect(openverseHit({ id: 'no es un uuid!', license: 'by', url: 'https://x.org/a.jpg' }, IMAGE_FILE_HOSTS)).toBeNull();
    expect(openverseHit({ id: OV_ID, url: 'https://x.org/a.jpg' }, IMAGE_FILE_HOSTS)).toBeNull();
    expect(openverseHit({ id: OV_ID, license: 'by', url: 'javascript:alert(1)', thumbnail: 'ftp://x/y' }, IMAGE_FILE_HOSTS)).toBeNull();
    // El texto de internet se limpia: sin caracteres de control ni largos desmedidos.
    const h = openverseHit({ id: OV_ID, license: 'by', license_version: '4.0', title: 'a\u0000b\n\nc' + 'x'.repeat(1000), url: 'http://live.staticflickr.com/a.jpg', thumbnail: null }, IMAGE_FILE_HOSTS)!;
    expect(h.title).toMatch(/^a b c/);
    expect(h.title.length).toBeLessThanOrEqual(300);
    expect(h.fileUrl).toBe('https://live.staticflickr.com/a.jpg');
  });

  it('Pixabay: el tamaño que se baja es la versión grande (1280 px)', () => {
    const h = pixabayHit((pixabayResults() as { hits: unknown[] }).hits[0])!;
    expect(h).toMatchObject({ id: 'pixabay:195893', license: 'Pixabay Content License', licenseKind: 'pixabay', creator: 'Josch13', width: 1280, height: 960, format: 'jpeg' });
    expect(h.title).toBe('flower, blossom, bloom, yellow');
    expect(h.creatorUrl).toBe('https://pixabay.com/users/Josch13-1664300/');
    expect(pixabayHit({ id: 'x', largeImageURL: 'https://pixabay.com/a.jpg' })).toBeNull();
  });

  it('Unsplash: pide jpg de hasta 4000 px, conserva el ixid y nombra al fotógrafo', () => {
    const h = unsplashHit((unsplashResults() as { results: unknown[] }).results[0])!;
    const u = new URL(h.fileUrl);
    expect(u.hostname).toBe('images.unsplash.com');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ ixid: 'XYZ', w: '4000', fm: 'jpg', fit: 'max' });
    expect(h).toMatchObject({ id: 'unsplash:abc123XYZ', license: 'Unsplash License', creator: 'Lía Gómez', width: 4000, height: 2667 });
    expect(h.creatorUrl).toContain('utm_source=heritage_studio');
    expect(h.downloadPing).toContain('/download');
  });
});

describe('searchImages', () => {
  it('Openverse anda sin clave, y los otros dos avisan qué les falta', async () => {
    const { web, ctx } = setup();
    const r = await searchImages(request({ limit: 12 }), ['openverse', 'pixabay', 'unsplash'], ctx);
    expect(r.hits.map((h) => h.provider)).toEqual(['openverse', 'openverse', 'openverse']);
    expect(r.notConfigured.map((n) => n.provider)).toEqual(['pixabay', 'unsplash']);
    expect(r.notConfigured[0]!.needs).toContain('PIXABAY_API_KEY');
    expect(web.requests).toHaveLength(1);
    // Sin pedir un servicio, se usan los que están listos.
    const auto = await searchImages(request(), undefined, ctx);
    expect(auto.services.map((s) => s.provider)).toEqual(['openverse', 'wikimedia']);
  });

  it('con claves, junta los tres e intercala los resultados', async () => {
    const { web, ctx } = setup(KEYS);
    const r = await searchImages(request({ limit: 12 }), ['openverse', 'pixabay', 'unsplash'], ctx);
    expect(r.hits.map((h) => h.provider)).toEqual(['openverse', 'pixabay', 'unsplash', 'openverse', 'openverse']);
    const pix = web.requests.find((u) => u.includes('pixabay.com/api'))!;
    expect(new URL(pix).searchParams.get('key')).toBe('pix-key-777');
    expect(new URL(pix).searchParams.get('safesearch')).toBe('true');
    expect(web.sent.find((s) => s.url.includes('api.unsplash.com'))!.headers['authorization']).toBe('Client-ID uns-key-888');
  });

  it('el límite corta la lista', async () => {
    const { ctx } = setup(KEYS);
    expect((await searchImages(request({ limit: 2 }), undefined, ctx)).hits).toHaveLength(2);
  });

  it('el filtro de licencias libres deja CC0, dominio público y CC BY', async () => {
    const { web, ctx } = setup(KEYS);
    const r = await searchImages(request({ license: 'free', limit: 12 }), ['openverse', 'pixabay', 'unsplash'], ctx);
    expect(r.hits.map((h) => h.licenseKind).sort()).toEqual(['by', 'cc0']);
    expect(new URL(web.requests[0]!).searchParams.get('license')).toBe('cc0,pdm,by');
    expect(r.hits.some((h) => h.provider !== 'openverse')).toBe(false);
    const cc0 = await searchImages(request({ license: 'cc0', limit: 12 }), ['openverse'], setup(KEYS).ctx);
    expect(cc0.hits.map((h) => h.licenseKind)).toEqual(['cc0']);
    const by = await searchImages(request({ license: 'by', limit: 12 }), ['openverse'], setup(KEYS).ctx);
    expect(by.hits.map((h) => h.licenseKind)).toEqual(['by']);
  });

  it('orientación y ancho mínimo viajan al servicio o se aplican acá', async () => {
    const { web, ctx } = setup(KEYS);
    await searchImages(request({ orientation: 'vertical', minWidth: 2500, limit: 12 }), undefined, ctx);
    const [ov, pix, uns] = ['api.openverse.org', 'pixabay.com/api', 'api.unsplash.com'].map((h) => new URL(web.requests.find((u) => u.includes(h))!).searchParams);
    expect(ov!.get('aspect_ratio')).toBe('tall');
    expect(pix!.get('orientation')).toBe('vertical');
    expect(pix!.get('min_width')).toBe('2500');
    expect(uns!.get('orientation')).toBe('portrait');
    // Vector: Pixabay y Unsplash no tienen, no se les pregunta.
    const v = setup(KEYS);
    await searchImages(request({ type: 'vector' }), undefined, v.ctx);
    expect(v.web.requests.filter((u) => u.includes('pixabay.com/api') || u.includes('unsplash.com'))).toEqual([]);
  });

  it('repetir la búsqueda no gasta llamadas: sale de la caché', async () => {
    const { web, ctx } = setup(KEYS);
    const a = await searchImages(request(), undefined, ctx);
    const calls = web.requests.length;
    const b = await searchImages(request(), undefined, ctx);
    expect(web.requests.length).toBe(calls);
    expect(b.services.every((s) => s.cached)).toBe(true);
    expect(b.hits).toEqual(a.hits);
    // Otra búsqueda sí pide.
    await searchImages(request({ query: 'otra cosa' }), undefined, ctx);
    expect(web.requests.length).toBeGreaterThan(calls);
  });

  it('si un servicio falla, los demás igual responden y el error no lleva la clave', async () => {
    const routes = imageRoutes().filter((r) => !String(r.match).includes('pixabay\\.com\\/api'));
    routes.unshift({ match: /^https:\/\/pixabay\.com\/api\//, status: 500, body: 'error' });
    const { ctx } = setup(KEYS, routes);
    const r = await searchImages(request({ limit: 12 }), undefined, ctx);
    expect(r.hits.some((h) => h.provider === 'openverse')).toBe(true);
    const pix = r.services.find((s) => s.provider === 'pixabay')!;
    expect(pix.error).toContain('500');
    expect(pix.error).not.toContain('pix-key-777');
    const rate = await searchImages(request({ query: 'x' }), ['unsplash'], setup(KEYS, [{ match: /./, status: 403, body: 'Rate Limit Exceeded' }]).ctx);
    expect(rate.services[0]!.error).toContain('clave');
  });
});

describe('resolveHit y downloadImage', () => {
  it('una ficha de una búsqueda anterior sale de la caché; si no, se pide al servicio', async () => {
    const { web, ctx } = setup();
    await searchImages(request(), ['openverse'], ctx);
    const calls = web.requests.length;
    expect((await resolveHit(`openverse:${OV_ID}`, ctx)).title).toBe('Estadio de noche');
    expect(web.requests.length).toBe(calls);
    const cold = setup();
    expect((await resolveHit(`openverse:${OV_ID}`, cold.ctx)).license).toBe('CC BY 2.0');
    expect(cold.web.requests).toHaveLength(1);
  });

  it('un id raro no llega a la red', async () => {
    const { web, ctx } = setup(KEYS);
    for (const bad of ['', 'foo:1', 'openverse:../../etc/passwd', 'openverse:zzz', 'pixabay:12;ls', 'https://evil.example.com/a.jpg', 'unsplash:a/b']) {
      await expect(resolveHit(bad, ctx), bad).rejects.toThrow();
    }
    expect(web.requests).toEqual([]);
  });

  it('un servicio sin clave no se consulta', async () => {
    const { web, ctx } = setup();
    await expect(resolveHit('pixabay:195893', ctx)).rejects.toThrow('PIXABAY_API_KEY');
    expect(web.requests).toEqual([]);
  });

  it('baja la imagen solo de los dominios permitidos y la reconoce por dentro, no por lo que diga el servidor', async () => {
    const { ctx } = setup();
    const hit = openverseHit((openverseResults() as { results: unknown[] }).results[0], IMAGE_FILE_HOSTS)!;
    expect((await downloadImage(hit, ctx)).kind).toBe('jpeg');
    // Una dirección fuera de la lista no se pide, aunque llegue en una ficha.
    await expect(downloadImage({ ...hit, fileUrl: 'https://evil.example.com/a.jpg' }, ctx)).rejects.toThrow(/no está entre los dominios/);
    await expect(downloadImage({ ...hit, fileUrl: 'https://169.254.169.254/latest' }, ctx)).rejects.toThrow(/IP/);
    // Un archivo que no es PNG, JPEG ni SVG se rechaza aunque diga ser image/jpeg.
    const html = setup({}, [{ match: /./, type: 'image/jpeg', body: '<html>hola</html>' }]);
    await expect(downloadImage(hit, html.ctx)).rejects.toThrow(/no es una imagen/);
    const gif = setup({}, [{ match: /./, type: 'image/gif', body: new TextEncoder().encode('GIF89a...') }]);
    await expect(downloadImage(hit, gif.ctx)).rejects.toThrow(/WebP, GIF/);
  });

  it('un SVG se limpia al bajarlo', async () => {
    const { ctx } = setup();
    const svgHit = openverseHit((openverseResults() as { results: unknown[] }).results[2], IMAGE_FILE_HOSTS)!;
    const got = await downloadImage(svgHit, ctx);
    expect(got.kind).toBe('svg');
    const text = new TextDecoder().decode(got.bytes);
    expect(text).not.toMatch(/script|onclick|alert/);
    expect(got.removed).toEqual(expect.arrayContaining(['script']));
  });

  it('la miniatura sale chica (~320 px) y si no se puede bajar es null', async () => {
    const { ctx } = setup();
    const hit = openverseHit((openverseResults() as { results: unknown[] }).results[0], IMAGE_FILE_HOSTS)!;
    const t = await fetchThumbnail(hit, ctx);
    expect(t!.mime).toBe('image/jpeg');
    expect(t!.data.length).toBeLessThan(40_000);
    expect(await fetchThumbnail({ ...hit, thumbUrl: 'https://evil.example.com/t.jpg' }, ctx)).toBeNull();
    expect(await fetchThumbnail({ ...hit, thumbUrl: null }, ctx)).toBeNull();
  });
});
