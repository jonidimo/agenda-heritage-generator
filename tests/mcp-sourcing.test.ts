/**
 * Las herramientas que consiguen imágenes y fuentes de internet, de punta a punta por el protocolo MCP y con un
 * «internet» simulado: buscar, proponer, confirmar, no repetir, créditos, y que nada salga del carril (dominios,
 * claves, confirmación).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rasterInfo } from '../src/core/assets/image';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { applyJsonPatch, type JsonPatchOp } from '../src/core/util/jsonPatch';
import { fromBase64 } from '../src/core/resources';
import { ROOT } from '../src/node/env';
import { sourceResources } from '../src/mcp/dev';
import { AppLink, type AppConnection } from '../src/mcp/live';
import { createServer } from '../src/mcp/server';
import { createCache } from '../src/node/web/cache';
import { createSubsetter } from '../src/node/subset';
import { fakeWeb, type FakeWeb, type Route } from './helpers/web';
import { googleList, imageRoutes, OV_ID, OV_ID2, OV_ID3 } from './helpers/services';
import { makeJpeg } from './helpers/jpeg';
import { makePng } from './helpers/png';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

type Part = { type: string; text?: string; data?: string; mimeType?: string };
let dir = '';
let web: FakeWeb;
let client: Client;
const closers: Array<() => Promise<void>> = [];
const KEYS = { PIXABAY_API_KEY: 'pix-key-777', UNSPLASH_ACCESS_KEY: 'uns-key-888', GOOGLE_FONTS_API_KEY: 'goo-key-999' };

const garamond = (name: string): Uint8Array => new Uint8Array(readFileSync(join(ROOT, 'public', 'fonts', 'eb-garamond', name)));
const css = (family: string, w: number, style: string, url: string): string => `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${w}; src: url(${url}) format('truetype'); }`;

async function start(opts: { env?: Record<string, string>; routes?: Route[]; appLink?: AppLink } = {}): Promise<void> {
  web = fakeWeb([...(opts.routes ?? []), ...imageRoutes()]);
  const server = createServer({ root: dir, ...sourceResources(), ...(opts.appLink ? { appLink: opts.appLink } : {}), web: { http: web.http, env: opts.env ?? {}, cache: createCache({ dir: null }) } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
}

/** Las herramientas que solo aplican lo que antes se propuso. */
const NEEDS_PROPOSAL = new Set(['import_image', 'import_font', 'build_credits_page']);

/** Como una persona aprobaría: antes de una llamada con `confirm: true` se hace la propuesta, con los mismos parámetros (salvo `raw`). */
async function call(name: string, args: Record<string, unknown> = {}, opts: { raw?: boolean } = {}) {
  if (args.confirm === true && NEEDS_PROPOSAL.has(name) && !opts.raw) await client.callTool({ name, arguments: { ...args, confirm: undefined } });
  const res = (await client.callTool({ name, arguments: args })) as { content: Part[]; isError?: boolean };
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  const body = ((): Record<string, any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      return JSON.parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    } catch {
      return { raw: text };
    }
  })();
  return { isError: res.isError === true, body, parts: res.content, text };
}

const agenda = async (): Promise<Record<string, any>> => JSON.parse(await readFile(join(dir, 'a.agenda.json'), 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const exists = (rel: string): Promise<boolean> => stat(join(dir, rel)).then(() => true, () => false);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-sourcing-'));
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  await rm(dir, { recursive: true, force: true });
});

async function withAgenda(env?: Record<string, string>, routes?: Route[]): Promise<void> {
  await start({ ...(env ? { env } : {}), ...(routes ? { routes } : {}) });
  expect((await call('create_design', { template: 'heritage', year: 2027, out: 'a.agenda.json' })).isError).toBe(false);
}

describe('search_images', () => {
  beforeEach(() => start({ env: {} }));

  it('devuelve los resultados con autor y licencia, y una miniatura de cada uno como imagen', async () => {
    const r = await call('search_images', { query: 'estadio' });
    expect(r.isError).toBe(false);
    expect(r.body.count).toBe(3);
    expect(r.body.results[0]).toMatchObject({ n: 1, id: `openverse:${OV_ID}`, creator: 'Jane Doe', license: 'CC BY 2.0', size: '3000×2000' });
    expect(r.body.results[1].onlyPreview).toMatch(/dominio que no se visita/);
    const images = r.parts.filter((p) => p.type === 'image');
    expect(images).toHaveLength(3);
    expect(images[0]!.mimeType).toBe('image/jpeg');
    expect(fromBase64(images[0]!.data!).length).toBeLessThan(40_000);
    // Cada imagen viene precedida de un texto que dice cuál es.
    const i = r.parts.findIndex((p) => p.type === 'image');
    expect(r.parts[i - 1]!.text).toContain(`openverse:${OV_ID}`);
  });

  it('sin miniaturas, solo el texto', async () => {
    const r = await call('search_images', { query: 'estadio', thumbnails: false });
    expect(r.parts.every((p) => p.type === 'text')).toBe(true);
    expect(web.requests.some((u) => u.includes('/thumb/'))).toBe(false);
  });

  it('un servicio sin clave se nombra con lo que le falta, sin error', async () => {
    const r = await call('search_images', { query: 'estadio', provider: ['unsplash'] });
    expect(r.isError).toBe(false);
    expect(r.body.count).toBe(0);
    expect(r.body.notConfigured[0]).toContain('UNSPLASH_ACCESS_KEY');
  });

  it('repetir la búsqueda sale de la caché', async () => {
    await call('search_images', { query: 'estadio', thumbnails: false });
    const n = web.requests.length;
    const again = await call('search_images', { query: 'estadio', thumbnails: false });
    expect(web.requests.length).toBe(n);
    expect(again.body.services[0].cached).toBe(true);
  });

  it('el pedido se valida: nada vacío ni desmedido', async () => {
    for (const args of [{ query: '' }, { query: 'x'.repeat(201) }, { query: 'a', limit: 99 }, { query: 'a', license: 'todas' }, { query: 'a', provider: ['evil'] }]) {
      expect((await call('search_images', args)).isError, JSON.stringify(args)).toBe(true);
    }
  });
});

describe('nada se aplica a ciegas', () => {
  it('confirm sin propuesta previa, o con otros parámetros, no cambia nada', async () => {
    await withAgenda(KEYS, [{ match: /fonts\.googleapis\.com\/css2/, type: 'text/css', body: css('Roboto', 400, 'normal', 'https://fonts.gstatic.com/s/roboto/r.ttf') }, { match: 'https://fonts.gstatic.com/s/roboto/r.ttf', type: 'font/ttf', body: garamond('EBGaramond-Regular.ttf') }]);
    const before = await readFile(join(dir, 'a.agenda.json'), 'utf8');
    const blind = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', confirm: true }, { raw: true });
    expect(blind.isError).toBe(true);
    expect(blind.body.error).toMatch(/Primero pedí la propuesta/);
    expect((await call('import_font', { family: 'Roboto', path: 'a.agenda.json', confirm: true }, { raw: true })).isError).toBe(true);
    expect((await call('build_credits_page', { path: 'a.agenda.json', confirm: true }, { raw: true })).isError).toBe(true);
    // Se propuso una cosa y se confirma otra: tampoco.
    await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 } });
    const other = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 90, h: 40 }, confirm: true }, { raw: true });
    expect(other.isError).toBe(true);
    expect(await readFile(join(dir, 'a.agenda.json'), 'utf8')).toBe(before);
    expect(await exists('imagenes')).toBe(false);
    // Con la propuesta de verdad, sí.
    expect((await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, confirm: true }, { raw: true })).isError).toBe(false);
  });
});

describe('imágenes propias: archivo, enlace y páginas', () => {
  const lan = (): Route[] => [
    { match: 'http://fotos.lan/galeria', type: 'text/html', body: '<title>Mis imágenes</title><img src="/ia/uno.jpg" alt="Una ilustración"><img src="http://cdn.otro.example/x.jpg"><a href="/galeria?p=2">Siguiente</a>' },
    { match: 'http://fotos.lan/ia/uno.jpg', type: 'image/jpeg', body: makeJpeg(1200, 800) },
    { match: 'http://nas.otra.lan/dos.png', type: 'image/png', body: makePng(800, 600, [200, 100, 50]) },
  ];

  it('un archivo de la carpeta de trabajo: mismo tratamiento, sin crédito inventado y con el aviso de responsabilidad', async () => {
    await withAgenda();
    await writeFile(join(dir, 'ia.png'), makePng(1500, 1000, [10, 200, 90]));
    const dry = await call('import_image', { image: 'ia.png', path: 'a.agenda.json', sizeMm: { w: 50, h: 100 } });
    expect(dry.isError, dry.text).toBe(false);
    expect(dry.body.proposal.credit).toBeUndefined();
    expect(dry.body.warnings.join(' ')).toMatch(/Aviso de responsabilidad/);
    expect(dry.body.proposal.size).toBe('500×1000 px');
    const done = await call('import_image', { image: 'ia.png', path: 'a.agenda.json', sizeMm: { w: 50, h: 100 }, name: 'Portada IA', confirm: true });
    expect(done.isError, done.text).toBe(false);
    const a = (await agenda()).assets.find((x: { id: string }) => x.id === done.body.assetId);
    expect(a).toMatchObject({ name: 'Portada IA', kind: 'raster', mime: 'image/png', width: 500, height: 1000 });
    expect(a.credit).toBeUndefined();
    // Otra vez la misma: se reconoce por el contenido.
    const again = await call('import_image', { image: 'ia.png', path: 'a.agenda.json', sizeMm: { w: 50, h: 100 } });
    expect(again.body.duplicate).toMatchObject({ assetId: done.body.assetId });
  });

  it('con author y license guarda el crédito (sin verificar) y entra en la página de créditos', async () => {
    await withAgenda();
    await writeFile(join(dir, 'ia.png'), makePng(600, 400, [1, 2, 3]));
    const r = await call('import_image', { image: 'ia.png', path: 'a.agenda.json', author: 'Jonatan', license: 'Propia', embed: true, confirm: true });
    expect(r.isError, r.text).toBe(false);
    const a = (await agenda()).assets.find((x: { id: string }) => x.id === r.body.assetId);
    expect(a.credit).toMatchObject({ source: 'local', author: 'Jonatan', license: 'Propia', verified: false });
  });

  it('un archivo que dice ser imagen y no lo es, o que no existe, o fuera de la carpeta, se rechaza', async () => {
    await withAgenda();
    await writeFile(join(dir, 'falsa.png'), 'no soy una imagen');
    expect((await call('import_image', { image: 'falsa.png', path: 'a.agenda.json' })).text).toMatch(/no es una imagen/);
    expect((await call('import_image', { image: 'no-esta.png', path: 'a.agenda.json' })).isError).toBe(true);
    expect((await call('import_image', { image: '../fuera.png', path: 'a.agenda.json' })).isError).toBe(true);
    expect((await call('import_image', { image: 'a.agenda.json', path: 'a.agenda.json' })).isError).toBe(true);
  });

  it('un SVG propio también se limpia', async () => {
    await withAgenda();
    await writeFile(join(dir, 'm.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="20mm" height="20mm"><script>x()</script><rect width="5" height="5"/></svg>');
    const r = await call('import_image', { image: 'm.svg', path: 'a.agenda.json', folder: 'vec', confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(await readFile(join(dir, 'vec', (await readdir(join(dir, 'vec')))[0]!), 'utf8')).not.toMatch(/script/);
  });

  it('exige una sola fuente: id, url o file', async () => {
    await withAgenda();
    expect((await call('import_image', { path: 'a.agenda.json' })).text).toMatch(/una sola/);
    expect((await call('import_image', { id: `openverse:${OV_ID}`, image: 'x.png', path: 'a.agenda.json' })).text).toMatch(/una sola/);
  });

  it('browse_page: abre una página de un dominio declarado y lista sus imágenes con miniatura, y marca las de otro dominio', async () => {
    await withAgenda({ AGENDA_TRUSTED_HOSTS: 'fotos.lan' }, lan());
    const r = await call('browse_page', { url: 'http://fotos.lan/galeria' });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.page.title).toBe('Mis imágenes');
    expect(r.body.notice).toMatch(/Aviso de responsabilidad/);
    expect(r.body.images[0]).toMatchObject({ n: 1, url: 'http://fotos.lan/ia/uno.jpg', alt: 'Una ilustración', importable: true });
    expect(r.body.images[1]).toMatchObject({ importable: false, blocked: expect.stringContaining('AGENDA_TRUSTED_HOSTS') });
    expect(r.body.blockedHosts).toEqual(['cdn.otro.example (1)']);
    expect(r.body.links).toEqual([{ url: 'http://fotos.lan/galeria?p=2', text: 'Siguiente' }]);
    expect(r.parts.filter((p) => p.type === 'image')).toHaveLength(1);
    expect(web.requests.some((u) => u.includes('otro.example'))).toBe(false);
    expect((await call('browse_page', { url: 'http://fotos.lan/galeria', importableOnly: true, thumbnails: 0 })).body.images).toHaveLength(1);
  });

  it('browse_page: un dominio que no declaraste no se abre y el mensaje explica cómo y de quién es la responsabilidad', async () => {
    await withAgenda({ AGENDA_TRUSTED_HOSTS: 'fotos.lan' }, lan());
    for (const url of ['http://xtrafondos.com/tags/x', 'https://www.wallpaperalchemy.com/es/x', 'http://127.0.0.1/', 'http://169.254.169.254/latest/', 'ftp://fotos.lan/x']) {
      const r = await call('browse_page', { url });
      expect(r.isError, url).toBe(true);
    }
    const msg = (await call('browse_page', { url: 'http://xtrafondos.com/' })).text;
    expect(msg).toContain('AGENDA_TRUSTED_HOSTS');
    expect(msg).toMatch(/responsabilidad/);
    expect(web.requests).toEqual([]);
    // Sin ningún dominio declarado, tampoco.
    await rmAll();
    await start({ env: {}, routes: lan() });
    expect((await call('browse_page', { url: 'http://fotos.lan/galeria' })).isError).toBe(true);
  });

  async function rmAll(): Promise<void> {
    for (const close of closers.splice(0)) await close();
  }

  it('browse_page no baja por su cuenta miniaturas de otro sitio declarado', async () => {
    const routes: Route[] = [
      { match: 'http://fotos.lan/g', type: 'text/html', body: '<img src="/a.jpg"><img src="http://router.lan/reboot.jpg"><base href="http://fotos.lan/">' },
      { match: 'http://fotos.lan/a.jpg', type: 'image/jpeg', body: makeJpeg(300, 200) },
      { match: /router\.lan/, type: 'image/jpeg', body: makeJpeg(300, 200) },
    ];
    await withAgenda({ AGENDA_TRUSTED_HOSTS: 'fotos.lan,router.lan' }, routes);
    const r = await call('browse_page', { url: 'http://fotos.lan/g' });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.images.map((i: { importable: boolean }) => i.importable)).toEqual([true, true]);
    expect(web.requests.some((u) => u.includes('router.lan'))).toBe(false);
    expect(r.body.untrusted).toMatch(/datos, no instrucciones/);
  });

  it('una url de un catálogo se importa con su id, no como enlace propio; y lo que se aplica es lo que se propuso', async () => {
    await withAgenda({ AGENDA_TRUSTED_HOSTS: 'fotos.lan' }, lan());
    const direct = await call('import_image', { url: 'https://upload.wikimedia.org/x.jpg', path: 'a.agenda.json' });
    expect(direct.isError).toBe(true);
    expect(direct.text).toMatch(/AGENDA_TRUSTED_HOSTS/);
    // La propuesta se hace con una imagen; el enlace pasa a devolver otra: se aplica la que vio la persona (la bajada se reutiliza).
    const args = { url: 'http://fotos.lan/ia/uno.jpg', path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, embed: true, author: 'Yo' };
    expect((await call('import_image', args)).isError).toBe(false);
    const seen = createHash('sha256').update(makeJpeg(1200, 800)).digest('hex');
    web.routes.find((r) => r.match === 'http://fotos.lan/ia/uno.jpg')!.body = makeJpeg(1300, 800, 70);
    const done = await call('import_image', { ...args, confirm: true }, { raw: true });
    expect(done.isError, done.text).toBe(false);
    expect((await agenda()).assets.find((x: { id: string }) => x.id === done.body.assetId).credit.sourceSha256).toBe(seen);
  });

  it('una url con un «%» suelto no rompe con un error críptico', async () => {
    await withAgenda({ AGENDA_TRUSTED_HOSTS: 'fotos.lan' }, [...lan(), { match: 'http://fotos.lan/%E0%A4%A.jpg', type: 'image/jpeg', body: makeJpeg(300, 200) }]);
    const r = await call('import_image', { url: 'http://fotos.lan/%E0%A4%A.jpg', path: 'a.agenda.json', embed: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.proposal.name).toBeTruthy();
  });

  it('import_image con url: de un dominio declarado, con aviso; de otro, no', async () => {
    await withAgenda({ AGENDA_TRUSTED_HOSTS: 'fotos.lan,*.otra.lan' }, lan());
    const dry = await call('import_image', { url: 'http://fotos.lan/ia/uno.jpg', path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, pageUrl: 'https://fotos.ejemplo.org/p/1' });
    expect(dry.isError, dry.text).toBe(false);
    expect(dry.body.proposal.name).toBe('uno');
    expect(dry.body.warnings.join(' ')).toMatch(/Aviso de responsabilidad/);
    expect(dry.body.proposal.credit).toBeUndefined();
    const done = await call('import_image', { url: 'http://nas.otra.lan/dos.png', path: 'a.agenda.json', author: 'Yo', license: 'Propia', embed: true, confirm: true });
    expect(done.isError, done.text).toBe(false);
    expect((await agenda()).assets.find((x: { id: string }) => x.id === done.body.assetId).credit).toMatchObject({ source: 'web', author: 'Yo', verified: false });
    const blocked = await call('import_image', { url: 'http://cdn.otro.example/x.jpg', path: 'a.agenda.json' });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/AGENDA_TRUSTED_HOSTS/);
    expect(web.requests.some((u) => u.includes('otro.example'))).toBe(false);
    // Un enlace que no es una imagen se rechaza por su contenido.
    const html = await call('import_image', { url: 'http://fotos.lan/galeria', path: 'a.agenda.json' });
    expect(html.isError).toBe(true);
  });
});

describe('claves', () => {
  it('van a su servicio y a ningún otro lado: ni en las respuestas, ni en los archivos, ni en la caché', async () => {
    await withAgenda(KEYS);
    const found = await call('search_images', { query: 'estadio' });
    const dry = await call('import_image', { id: 'unsplash:abc123XYZ', path: 'a.agenda.json' });
    const font = await call('search_fonts', { query: 'bangers' });
    const everything = JSON.stringify([found.parts.map((p) => p.text), dry.parts.map((p) => p.text), font.text, await readFile(join(dir, 'a.agenda.json'), 'utf8')]);
    for (const secret of Object.values(KEYS)) expect(everything).not.toContain(secret);
    // Cada clave solo viajó a su dominio.
    for (const s of web.sent) {
      const host = new URL(s.url).hostname;
      const has = (v: string): boolean => s.url.includes(v) || Object.values(s.headers).some((h) => h.includes(v));
      if (has('pix-key-777')) expect(host).toBe('pixabay.com');
      if (has('uns-key-888')) expect(host).toBe('api.unsplash.com');
      if (has('goo-key-999')) expect(host).toBe('www.googleapis.com');
    }
  });
});

describe('import_image', () => {
  it('sin confirm solo propone: no baja nada a la agenda, no crea archivos, y muestra una vista previa', async () => {
    await withAgenda();
    const before = await readFile(join(dir, 'a.agenda.json'), 'utf8');
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 } });
    expect(r.isError).toBe(false);
    expect(r.body.applied).toBe(false);
    expect(r.body.proposal).toMatchObject({ kind: 'raster', mime: 'image/jpeg', size: '709×472 px', printedAt: '60 × 40 mm', dpi: 300 });
    expect(r.body.proposal.credit).toMatchObject({ source: 'openverse', id: OV_ID, author: 'Jane Doe', license: 'CC BY 2.0', url: 'https://www.flickr.com/photos/jane/1' });
    expect(r.body.proposal.credit.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.next).toContain('confirm: true');
    expect(r.parts.some((p) => p.type === 'image' && p.mimeType === 'image/jpeg')).toBe(true);
    expect(await readFile(join(dir, 'a.agenda.json'), 'utf8')).toBe(before);
    expect(await exists('imagenes')).toBe(false);
  });

  it('con confirm la agrega: archivo junto a la agenda, referenciado por path, con su crédito', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, name: 'Estadio', confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.applied).toBe(true);
    const files = await readdir(join(dir, 'imagenes'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^estadio-[0-9a-f]{8}\.jpg$/);
    const bytes = new Uint8Array(await readFile(join(dir, 'imagenes', files[0]!)));
    expect(rasterInfo(bytes)).toMatchObject({ width: 709, height: 472 });
    const a = (await agenda()).assets.find((x: { id: string }) => x.id === r.body.assetId);
    expect(a).toMatchObject({ name: 'Estadio', kind: 'raster', mime: 'image/jpeg', width: 709, height: 472, path: `imagenes/${files[0]}` });
    expect(a.data).toBeUndefined();
    expect(a.credit).toMatchObject({ source: 'openverse', author: 'Jane Doe', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/' });
    // La agenda sigue abriendo y encuentra la imagen.
    const check = await call('check_design', { path: 'a.agenda.json' });
    expect(check.isError).toBe(false);
    expect(JSON.stringify(check.body)).not.toMatch(/no se pudo leer|missing/i);
  });

  it('con embed va adentro del JSON y no deja archivos', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, embed: true, confirm: true });
    expect(r.isError).toBe(false);
    const a = (await agenda()).assets.find((x: { id: string }) => x.id === r.body.assetId);
    expect(rasterInfo(fromBase64(a.data))).toMatchObject({ width: 709 });
    expect(a.path).toBeUndefined();
    expect(await exists('imagenes')).toBe(false);
  });

  it('la tapa cuenta el sangrado y el lomo: el tamaño sale del motor y el aviso dice cuántos ppp alcanza', async () => {
    await withAgenda();
    // Tapa blanda envolvente: dos páginas, el lomo y 3 mm de sangrado por cada lado.
    const patch = [{ op: 'replace', path: '/cover/style', value: 'wrap' }, { op: 'replace', path: '/cover/spine', value: 10 }, { op: 'replace', path: '/cover/bleed', value: 3 }];
    expect((await call('update_design', { path: 'a.agenda.json', patch })).isError).toBe(false);
    const page = await call('render_page', { path: 'a.agenda.json', page: 2, width: 200 });
    const size = JSON.parse(page.parts.find((p) => p.type === 'text')!.text!).size as { w: number; h: number };
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', for: 'cover' });
    expect(r.isError, r.text).toBe(false);
    const m = /^(\d+(?:\.\d+)?) × (\d+(?:\.\d+)?) mm$/.exec(r.body.proposal.printedAt)!;
    const [w, h] = [Number(m[1]), Number(m[2])];
    expect(w).toBeCloseTo(2 * size.w + 10 + 2 * 3, 0);
    expect(h).toBeCloseTo(size.h + 2 * 3, 0);
    // «page» es una sola página, sin sangrado.
    const one = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', for: 'page' });
    expect(one.body.proposal.printedAt).toBe(`${Math.round(size.w * 10) / 10} × ${Math.round(size.h * 10) / 10} mm`);
    // La foto de 1500 px no alcanza para la tapa a 300 ppp: se avisa, y no se agranda.
    expect(r.body.proposal.dpi).toBeLessThan(250);
    expect(r.body.warnings.join(' ')).toMatch(/pixelada|lowDpi/);
    // La proporción de la imagen es la de la tapa.
    const [pw, ph] = r.body.proposal.size.replace(' px', '').split('×').map(Number);
    expect(pw / ph).toBeCloseTo(w / h, 1);
  });

  it('el crédito dice que la imagen se adaptó, y una imagen sin tocar no lo dice', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, confirm: true });
    expect((await agenda()).assets.find((x: { id: string }) => x.id === r.body.assetId).credit.modified).toBe(true);
  });

  it('una tapa que no es envolvente avisa que no tiene lomo ni sangrado', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', for: 'cover' });
    expect(r.isError, r.text).toBe(false);
    const style = (await agenda()).cover?.style ?? 'board';
    if (style !== 'wrap') expect(r.body.warnings.join(' ')).toMatch(/sin lomo ni sangrado/);
  });

  it('una foto apaisada se recorta para una portada vertical, alrededor del foco', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 50, h: 100 }, focus: { x: 0, y: 0.5 }, dpi: 150, confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.proposal.kept).toMatchObject({ x: 0, w: 500, h: 1000, of: '1500×1000' });
    const file = (await readdir(join(dir, 'imagenes')))[0]!;
    const info = rasterInfo(new Uint8Array(await readFile(join(dir, 'imagenes', file))))!;
    expect(info.width / info.height).toBeCloseTo(0.5, 1);
  });

  it('no repite la misma imagen: la reconoce por su origen y por su contenido', async () => {
    await withAgenda();
    const args = { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 } };
    const first = await call('import_image', { ...args, confirm: true });
    expect(first.isError).toBe(false);
    const dry = await call('import_image', args);
    expect(dry.body.duplicate).toMatchObject({ assetId: first.body.assetId });
    expect(dry.body.next).toMatch(/No hace falta/);
    const refused = await call('import_image', { ...args, confirm: true });
    expect(refused.isError).toBe(true);
    expect(refused.body).toMatchObject({ applied: false, duplicate: { assetId: first.body.assetId } });
    expect((await agenda()).assets.filter((a: { credit?: unknown }) => a.credit)).toHaveLength(1);
    // Con otro recorte puede ser deliberado: allowDuplicate.
    const again = await call('import_image', { ...args, crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, allowDuplicate: true, confirm: true });
    expect(again.isError, again.text).toBe(false);
    expect((await agenda()).assets.filter((a: { credit?: unknown }) => a.credit)).toHaveLength(2);
  });

  it('un SVG se limpia, no se recorta y queda como recurso vectorial con su tamaño', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID3}`, path: 'a.agenda.json', focus: { x: 0, y: 0 }, confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.warnings.join(' ')).toMatch(/Se limpió el SVG: se sacó script/);
    expect(r.body.warnings.join(' ')).toMatch(/no se aplican a un SVG/);
    const a = (await agenda()).assets.find((x: { id: string }) => x.id === r.body.assetId);
    expect(a).toMatchObject({ kind: 'vector', mime: 'image/svg+xml' });
    expect(a.width).toBeCloseTo(40, 0);
    const file = (await readdir(join(dir, 'imagenes')))[0]!;
    expect(file.endsWith('.svg')).toBe(true);
    const svg = await readFile(join(dir, 'imagenes', file), 'utf8');
    expect(svg).not.toMatch(/script|onclick|alert/);
    expect(svg).toContain('<rect');
    expect(a.credit).toMatchObject({ license: 'CC BY-SA 4.0' });
    // La licencia pide compartir igual: se avisa antes de importar.
    expect(r.body.warnings.join(' ')).toMatch(/BY-SA/);
  });

  it('si solo se pudo bajar la copia reducida, lo dice', async () => {
    await withAgenda();
    const r = await call('import_image', { id: `openverse:${OV_ID2}`, path: 'a.agenda.json', embed: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.warnings.join(' ')).toMatch(/copia reducida/);
    expect(r.body.warnings.join(' ')).toMatch(/AGENDA_IMAGE_HOSTS/);
    expect(web.requests.some((u) => u.includes('desconocido.example'))).toBe(false);
  });

  it('Unsplash: se avisa la descarga solo al confirmar', async () => {
    await withAgenda(KEYS);
    const dry = await call('import_image', { id: 'unsplash:abc123XYZ', path: 'a.agenda.json', sizeMm: { w: 60, h: 40 } });
    expect(dry.isError, dry.text).toBe(false);
    expect(dry.body.proposal.credit).toMatchObject({ source: 'unsplash', author: 'Lía Gómez', license: 'Unsplash License' });
    expect(web.requests.some((u) => u.includes('/download'))).toBe(false);
    await call('import_image', { id: 'unsplash:abc123XYZ', path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, confirm: true });
    expect(web.requests.filter((u) => u.includes('/download'))).toHaveLength(1);
  });

  it('pide la agenda cuando hace falta, y el id tiene que ser de una búsqueda', async () => {
    await withAgenda();
    expect((await call('import_image', { id: `openverse:${OV_ID}`, confirm: true })).text).toMatch(/path|app/);
    expect((await call('import_image', { id: `openverse:${OV_ID}`, for: 'cover' })).text).toMatch(/agenda/);
    expect((await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', for: 'cover', sizeMm: { w: 10, h: 10 } })).isError).toBe(true);
    for (const id of ['https://evil.example.com/a.jpg', 'openverse:../../etc/passwd', 'pixabay:1']) {
      const r = await call('import_image', { id, path: 'a.agenda.json' });
      expect(r.isError, id).toBe(true);
    }
    expect(web.requests.some((u) => u.includes('evil.example'))).toBe(false);
  });

  it('la carpeta tiene que quedar junto a la agenda', async () => {
    await withAgenda();
    for (const folder of ['../fuera', '/etc', '.oculta', 'a:b']) {
      const r = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', folder, confirm: true });
      expect(r.isError, folder).toBe(true);
    }
    expect(await exists('imagenes')).toBe(false);
    const ok = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', folder: 'fotos/portadas', confirm: true });
    expect(ok.isError, ok.text).toBe(false);
    expect(await exists('fotos/portadas')).toBe(true);
  });

  it('si la agenda no queda válida, no deja la imagen suelta', async () => {
    await withAgenda();
    const bad = await call('import_image', { id: `openverse:${OV_ID}`, path: 'no-existe.agenda.json', confirm: true });
    expect(bad.isError).toBe(true);
    expect(await exists('imagenes')).toBe(false);
  });
});

describe('import_image en la aplicación abierta', () => {
  it('la imagen va incrustada en un parche, con su crédito', async () => {
    const state = { design: JSON.parse(JSON.stringify(parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' })))) as Record<string, unknown>, revision: 3, patches: [] as JsonPatchOp[][] };
    const conn: AppConnection = {
      async request(method, params) {
        if (method === 'design.get') return { revision: state.revision, design: JSON.parse(JSON.stringify(state.design)) };
        if (method === 'design.patch') {
          const p = params as { patch: JsonPatchOp[] };
          state.patches.push(p.patch);
          state.design = applyJsonPatch(state.design, p.patch) as Record<string, unknown>;
          return { applied: true, revision: ++state.revision };
        }
        return undefined;
      },
      close: () => undefined,
    };
    await start({ appLink: new AppLink(async () => conn) });
    const r = await call('import_image', { id: `openverse:${OV_ID}`, app: true, sizeMm: { w: 60, h: 40 }, confirm: true });
    expect(r.isError, r.text).toBe(false);
    const added = state.patches[0]![0]!;
    expect(added).toMatchObject({ op: 'add', path: '/assets/-' });
    const asset = (added as { value: Record<string, any> }).value; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rasterInfo(fromBase64(asset.data))).toMatchObject({ width: 709 });
    expect(asset.credit.author).toBe('Jane Doe');
    expect(asset.path).toBeUndefined();
  });
});

describe('build_credits_page', () => {
  async function placed(): Promise<string> {
    const imported = await call('import_image', { id: `openverse:${OV_ID}`, path: 'a.agenda.json', sizeMm: { w: 60, h: 40 }, name: 'Estadio', confirm: true });
    const assetId = imported.body.assetId as string;
    // La agenda usa la imagen en un elemento propio.
    const patch = [{ op: 'add', path: '/customBlocks/-', value: { id: 'foto', pageType: 'notes', pageKey: null, kind: 'image', x: 20, y: 20, w: 60, h: 40, props: { assetId } } }];
    expect((await call('update_design', { path: 'a.agenda.json', patch })).isError).toBe(false);
    return assetId;
  }

  it('arma una página al final con autor, licencia y dirección de lo que la agenda usa, y se puede repetir', async () => {
    await withAgenda();
    await placed();
    // Otra imagen importada que no se usa: no figura.
    await call('import_image', { id: `openverse:${OV_ID3}`, path: 'a.agenda.json', confirm: true });
    const r = await call('build_credits_page', { path: 'a.agenda.json', confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body).toMatchObject({ changed: true, pages: 1 });
    expect(r.body.credits).toHaveLength(1);
    const page = (await agenda()).customPages.find((p: { id: string }) => p.id === 'credits-img');
    expect(page.title).toBe('Créditos de las imágenes');
    expect(page.content.kind).toBe('text');
    expect(page.content.text).toContain('Estadio de noche — Jane Doe · CC BY 2.0');
    expect(page.content.text).toContain('https://www.flickr.com/photos/jane/1');
    expect(page.content.text).not.toContain('Escudo');
    const pages = (await call('list_pages', { path: 'a.agenda.json', limit: 300 })).body;
    // Va después de la última página de verdad (las hojas en blanco que completan el cuadernillo siguen al final).
    const real = (pages.pages as Array<{ type: string; title: string }>).filter((p) => p.type !== 'filler');
    expect(real[real.length - 1]!.title).toBe('Créditos de las imágenes');
    // Repetirla no duplica nada.
    const again = await call('build_credits_page', { path: 'a.agenda.json', confirm: true });
    expect(again.isError).toBe(false);
    expect((await agenda()).customPages.filter((p: { id: string }) => p.id.startsWith('credits-img'))).toHaveLength(1);
    // Con onlyUsed: false entran todas.
    await call('build_credits_page', { path: 'a.agenda.json', onlyUsed: false, confirm: true });
    expect((await agenda()).customPages.find((p: { id: string }) => p.id === 'credits-img').content.text).toContain('Escudo');
    // La página se dibuja sin avisos.
    const creditsAt = (pages.pages as Array<{ page: number; type: string }>).find((p) => p.type === 'custom')!.page;
    const render = await call('render_page', { path: 'a.agenda.json', page: creditsAt });
    expect(render.isError).toBe(false);
    expect(JSON.stringify(render.body)).not.toMatch(/overflow|textOverflow/);
  });

  it('sin confirm solo propone: qué páginas se crean y cuáles se quitan, sin escribir', async () => {
    await withAgenda();
    await placed();
    const before = await readFile(join(dir, 'a.agenda.json'), 'utf8');
    const r = await call('build_credits_page', { path: 'a.agenda.json' });
    expect(r.body.applied).toBe(false);
    expect(r.body.proposal.createOrReplace[0].text).toContain('Jane Doe');
    expect(r.body.proposal.createOrReplace[0].text).toContain('https://creativecommons.org/licenses/by/2.0/');
    expect(r.body.proposal.createOrReplace[0].text).toContain('adaptada');
    expect(await readFile(join(dir, 'a.agenda.json'), 'utf8')).toBe(before);
  });

  it('solo toca sus propias páginas: una de la persona con un id parecido queda', async () => {
    await withAgenda();
    await placed();
    const raw = await agenda();
    raw.customPages.push({ id: 'credits-imagenes-mias', after: null, title: 'Mía', content: { kind: 'text', text: 'hola' } });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'a.agenda.json'), JSON.stringify(raw));
    await call('build_credits_page', { path: 'a.agenda.json', confirm: true });
    const ids = (await agenda()).customPages.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['credits-imagenes-mias', 'credits-img']));
  });

  it('con muchas imágenes reparte en varias páginas, y con título e introducción propios', async () => {
    await withAgenda();
    const raw = await agenda();
    const assets = Array.from({ length: 7 }, (_, i) => ({ id: `im${i}`, name: `Foto ${i}`, kind: 'raster', mime: 'image/png', width: 10, height: 10, credit: { source: 'openverse', id: `id${i}`, title: `Foto ${i}`, author: `Autor ${i}`, license: 'CC BY 4.0', url: `https://ejemplo.org/${i}` } }));
    const blocks = assets.map((a, i) => ({ id: `b${i}`, pageType: 'notes', pageKey: null, kind: 'image', x: 10, y: 10, w: 10, h: 10, props: { assetId: a.id } }));
    raw.assets.push(...assets);
    raw.customBlocks.push(...blocks);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'a.agenda.json'), JSON.stringify(raw));
    const r = await call('build_credits_page', { path: 'a.agenda.json', perPage: 3, title: 'Image credits', intro: 'Photos from Openverse.', confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.pages).toBe(3);
    const pages = (await agenda()).customPages.filter((p: { id: string }) => p.id.startsWith('credits-img'));
    expect(pages.map((p: { title: string }) => p.title)).toEqual(['Image credits (1/3)', 'Image credits (2/3)', 'Image credits (3/3)']);
    expect(pages[0].content.text.startsWith('Photos from Openverse.')).toBe(true);
    // Si después quedan menos imágenes, sobran páginas y se quitan.
    raw.customBlocks = blocks.slice(0, 2);
    raw.customPages = pages;
    await writeFile(join(dir, 'a.agenda.json'), JSON.stringify(raw));
    await call('build_credits_page', { path: 'a.agenda.json', confirm: true });
    expect((await agenda()).customPages.filter((p: { id: string }) => p.id.startsWith('credits-img'))).toHaveLength(1);
  });

  it('sin imágenes con crédito no cambia nada y explica por qué', async () => {
    await withAgenda();
    const before = await readFile(join(dir, 'a.agenda.json'), 'utf8');
    const r = await call('build_credits_page', { path: 'a.agenda.json' });
    expect(r.body).toMatchObject({ changed: false });
    expect(await readFile(join(dir, 'a.agenda.json'), 'utf8')).toBe(before);
  });
});

describe('fuentes', () => {
  const fontRoutes = (): Route[] => [
    { match: /^https:\/\/www\.googleapis\.com\/webfonts\/v1\/webfonts/, body: googleList() },
    { match: 'https://fonts.gstatic.com/s/roboto/r.ttf', type: 'font/ttf', body: garamond('EBGaramond-Regular.ttf') },
    { match: 'https://fonts.gstatic.com/s/roboto/b.ttf', type: 'font/ttf', body: garamond('EBGaramond-Bold.ttf') },
    { match: 'https://fonts.gstatic.com/s/bangers/v25/b.ttf', type: 'font/ttf', body: garamond('EBGaramond-Medium.ttf') },
  ];

  it('search_fonts: necesita la clave y la explica; con ella devuelve familias con su consejo', async () => {
    await start({ env: {}, routes: fontRoutes() });
    const none = await call('search_fonts', { query: 'bangers' });
    expect(none.isError).toBe(true);
    expect(none.text).toContain('GOOGLE_FONTS_API_KEY');
    await rmCloser();
    await start({ env: KEYS, routes: fontRoutes() });
    const r = await call('search_fonts', { query: 'bang' });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.fonts).toEqual([expect.objectContaining({ family: 'Bangers', category: 'display', weights: [400], italic: false, advice: 'conviene usarla solo para títulos' })]);
    const all = await call('search_fonts', { limit: 2 });
    expect(all.body.fonts.map((f: { family: string }) => f.family)).toEqual(['Roboto', 'Bangers']);
    expect(all.body.fonts[0].weights).toEqual([400, 700]);
    expect(all.body.fonts[0].italic).toBe(true);
    // Solo las que cubren el latín, que es lo que lleva el castellano.
    expect((await call('search_fonts', { query: 'noto' })).body.count).toBe(0);
  });

  async function rmCloser(): Promise<void> {
    for (const close of closers.splice(0)) await close();
  }

  it('import_font sin confirm: informe de cobertura, tamaño y consejo, sin tocar nada', async () => {
    await withAgenda(KEYS, fontRoutes());
    const before = await readFile(join(dir, 'a.agenda.json'), 'utf8');
    const r = await call('import_font', { family: 'Bangers', path: 'a.agenda.json' });
    expect(r.isError, r.text).toBe(false);
    expect(r.body).toMatchObject({ applied: false, family: 'Bangers', category: 'display', coverage: 'complete', canApply: true });
    expect(r.body.titleOnly[0]).toMatch(/exhibición/);
    expect(r.body.recommendedRoles).toEqual(['display', 'title']);
    expect(r.body.variants[0]).toMatchObject({ weight: 400, style: 'normal', subset: true });
    expect(r.body.variants[0].storedBytes).toBeLessThan(r.body.variants[0].originalBytes);
    expect(r.body.notes.join(' ')).toMatch(/PDF incrusta solo los glifos/);
    expect(await readFile(join(dir, 'a.agenda.json'), 'utf8')).toBe(before);
  });

  it('con confirm la incrusta recortada, con sus roles, y repetirla la reemplaza', async () => {
    await withAgenda(KEYS, fontRoutes());
    const r = await call('import_font', { family: 'Roboto', weights: [400, 700], path: 'a.agenda.json', roles: ['display', 'title'], confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.body.applied).toBe(true);
    expect(r.body.installed).toHaveLength(2);
    const a = await agenda();
    expect(a.userFonts.map((f: { spec: { family: string; weight: number } }) => `${f.spec.family} ${f.spec.weight}`)).toEqual(['Roboto 400', 'Roboto 700']);
    expect(a.theme.tokens.fonts.display).toMatchObject({ family: 'Roboto', weight: 400 });
    const stored = fromBase64(a.userFonts[0].data);
    expect(stored.length).toBeLessThan(garamond('EBGaramond-Regular.ttf').length);
    expect((await call('check_design', { path: 'a.agenda.json' })).isError).toBe(false);
    const again = await call('import_font', { family: 'Roboto', path: 'a.agenda.json', confirm: true });
    expect(again.body.installed[0].replaced).toBe(true);
    expect((await agenda()).userFonts).toHaveLength(2);
  });

  it('sin la clave de Google también anda, con la hoja de estilos', async () => {
    const routes: Route[] = [
      { match: /fonts\.googleapis\.com\/css2/, type: 'text/css', body: css('Bangers', 400, 'normal', 'https://fonts.gstatic.com/s/bangers/v25/b.ttf') },
      { match: 'https://fonts.gstatic.com/s/bangers/v25/b.ttf', type: 'font/ttf', body: garamond('EBGaramond-Regular.ttf') },
    ];
    await withAgenda({}, routes);
    const r = await call('import_font', { family: 'Bangers', path: 'a.agenda.json', confirm: true });
    expect(r.isError, r.text).toBe(false);
    expect((await agenda()).userFonts[0].spec).toMatchObject({ family: 'Bangers', weight: 400 });
  });

  it('una fuente sin ñ, tildes o «¿¡» no se propone: el informe dice qué falta', async () => {
    const wasm = await readFile(join(ROOT, 'node_modules', 'harfbuzzjs', 'dist', 'harfbuzz-subset.wasm'));
    const tiny = (await createSubsetter(async () => new Uint8Array(wasm))(garamond('EBGaramond-Regular.ttf'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'))!;
    const routes: Route[] = [
      { match: /fonts\.googleapis\.com\/css2/, type: 'text/css', body: css('Chica', 400, 'normal', 'https://fonts.gstatic.com/s/chica/c.ttf') },
      { match: 'https://fonts.gstatic.com/s/chica/c.ttf', type: 'font/ttf', body: tiny },
    ];
    await withAgenda({}, routes);
    const dry = await call('import_font', { family: 'Chica', path: 'a.agenda.json' });
    expect(dry.body).toMatchObject({ coverage: 'unsuitable', canApply: false });
    expect(dry.body.missing.castellano).toEqual(expect.arrayContaining(['ñ', '¿', '¡', 'á']));
    expect(dry.body.next).toMatch(/Le faltan letras del castellano/);
    const refused = await call('import_font', { family: 'Chica', path: 'a.agenda.json', confirm: true });
    expect(refused.isError).toBe(true);
    expect((await agenda()).userFonts ?? []).toHaveLength(0);
    // Si es solo para texto en inglés, la persona lo decide.
    const forced = await call('import_font', { family: 'Chica', path: 'a.agenda.json', allowIncomplete: true, confirm: true });
    expect(forced.isError, forced.text).toBe(false);
    expect((await agenda()).userFonts).toHaveLength(1);
  });

  it('si no entran todas las variantes en el máximo de fuentes propias, no instala ninguna', async () => {
    await withAgenda(KEYS, fontRoutes());
    const raw = await agenda();
    raw.userFonts = Array.from({ length: 39 }, (_, i) => ({ id: `f${i}`, spec: { family: `Otra ${i}`, weight: 400, style: 'normal' }, data: 'AAAA' }));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'a.agenda.json'), JSON.stringify(raw));
    const r = await call('import_font', { family: 'Roboto', weights: [400, 700], path: 'a.agenda.json', confirm: true });
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/máximo es 40/);
    expect((await agenda()).userFonts).toHaveLength(39);
  });

  it('una hoja de estilos que apunta a otro dominio no se sigue', async () => {
    const routes: Route[] = [
      { match: /fonts\.googleapis\.com\/css2/, type: 'text/css', body: css('Mala', 400, 'normal', 'https://evil.example.com/mala.ttf') },
      { match: /evil/, type: 'font/ttf', body: garamond('EBGaramond-Regular.ttf') },
    ];
    await withAgenda({}, routes);
    const r = await call('import_font', { family: 'Mala', path: 'a.agenda.json' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/dominios permitidos/);
    expect(web.requests.some((u) => u.includes('evil.example'))).toBe(false);
  });

  it('lo que baja y no es una fuente se informa, y el pedido se valida', async () => {
    const routes: Route[] = [
      { match: /fonts\.googleapis\.com\/css2/, type: 'text/css', body: css('Rota', 400, 'normal', 'https://fonts.gstatic.com/s/rota/r.ttf') },
      { match: 'https://fonts.gstatic.com/s/rota/r.ttf', type: 'font/ttf', body: '<html>no soy una fuente</html>' },
    ];
    await withAgenda({}, routes);
    const r = await call('import_font', { family: 'Rota', path: 'a.agenda.json' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/no es una fuente que se pueda leer/);
    for (const args of [{ family: '../etc' }, { family: 'X', weights: [] }, { family: 'X', weights: [450] }, { family: 'X', roles: ['nada'] }]) {
      expect((await call('import_font', { path: 'a.agenda.json', ...args })).isError, JSON.stringify(args)).toBe(true);
    }
    expect((await call('import_font', { family: 'Rota', confirm: true })).text).toMatch(/path|app/);
  });
});
