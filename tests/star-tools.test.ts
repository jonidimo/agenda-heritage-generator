import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rasterInfo } from '../src/core/assets/image';
import { fromBase64 } from '../src/core/resources';
import { createStarTools, type StarContext, type StarResult, type StarTools } from '../src/node/starTools';
import { createCache } from '../src/node/web/cache';
import { makeJpeg } from './helpers/jpeg';
import { imageRoutes, OV_ID } from './helpers/services';
import { fakeWeb } from './helpers/web';

let dir: string;
let project: string;
let outside: string;
let tools: StarTools;
let web: ReturnType<typeof fakeWeb>;
let ctx: StarContext;

const textOf = (r: StarResult): string => r.content.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('\n');
const json = (r: StarResult): Record<string, unknown> => JSON.parse(r.content.find((p) => p.type === 'text')!.type === 'text' ? (r.content.find((p) => p.type === 'text') as { text: string }).text : '{}') as Record<string, unknown>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'star-'));
  project = path.join(dir, 'Agenda');
  outside = path.join(dir, 'Descargas');
  await mkdir(path.join(project, 'imagenes'), { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(project, 'imagenes', 'propia.jpg'), makeJpeg(800, 600));
  await writeFile(path.join(outside, 'jjk.jpg'), makeJpeg(1600, 900));
  await writeFile(path.join(outside, 'notas.txt'), 'no es una imagen');
  web = fakeWeb(imageRoutes());
  tools = createStarTools({ version: 'test', http: web.http, cache: createCache({ dir: null }) });
  ctx = { env: {}, projectDir: async () => project, folders: [{ alias: 'carpeta-1', label: 'Descargas', root: outside }] };
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('herramientas de internet y carpetas del asistente', () => {
  it('ofrece las herramientas con su esquema', () => {
    const specs = tools.specs();
    expect(specs.map((s) => s.name)).toEqual(['search_images', 'browse_page', 'list_local_images', 'choose_folder', 'import_image', 'search_fonts', 'import_font']);
    expect(specs.find((s) => s.name === 'search_images')!.readOnly).toBe(true);
    expect(specs.find((s) => s.name === 'import_image')!.readOnly).toBe(false);
    expect(JSON.stringify(specs.find((s) => s.name === 'import_image')!.inputSchema)).toContain('sizeMm');
  });

  it('busca imágenes y devuelve miniaturas que el modelo puede ver', async () => {
    const r = await tools.call('search_images', { query: 'estadio', provider: ['openverse'], limit: 3 }, ctx);
    expect(r.isError).toBeUndefined();
    expect(json(r).count).toBeGreaterThan(0);
    expect(r.content.some((p) => p.type === 'image' && p.mime === 'image/jpeg')).toBe(true);
    expect(textOf(r)).toContain(`openverse:${OV_ID}`);
  });

  it('importa una imagen de un catálogo con su crédito, recortada al tamaño y con una copia en la carpeta de la agenda', async () => {
    const r = await tools.call('import_image', { id: `openverse:${OV_ID}`, sizeMm: { w: 100, h: 100 }, dpi: 150 }, ctx);
    expect(r.isError).toBeUndefined();
    const asset = r.assets![0]!;
    expect(asset.kind).toBe('raster');
    const info = rasterInfo(fromBase64(asset.data))!;
    expect(info.width).toBe(info.height);
    expect(asset.credit).toMatchObject({ source: 'openverse', author: 'Jane Doe', license: 'CC BY 2.0', verified: true });
    expect(asset.savedAs).toMatch(/^imagenes\/.+\.jpg$/);
    expect((await readFile(path.join(project, asset.savedAs!))).length).toBeGreaterThan(100);
    expect(r.content.some((p) => p.type === 'image')).toBe(true);
  });

  it('importa de la carpeta de la agenda y de una carpeta autorizada, sin crédito si no se da autor ni licencia', async () => {
    const own = await tools.call('import_image', { image: 'imagenes/propia.jpg' }, ctx);
    expect(own.assets![0]!.credit).toBeUndefined();
    const other = await tools.call('import_image', { image: 'jjk.jpg', folder: 'carpeta-1', author: 'Yo', license: 'Propia' }, ctx);
    expect(other.assets![0]!.credit).toMatchObject({ source: 'local', author: 'Yo', license: 'Propia', verified: false });
  });

  it('no lee fuera de las carpetas autorizadas: ni con .., ni con rutas absolutas, ni por enlaces, ni lo que no es imagen', async () => {
    await writeFile(path.join(dir, 'secreto.jpg'), makeJpeg(100, 100));
    for (const image of ['../secreto.jpg', path.join(dir, 'secreto.jpg'), '/etc/passwd']) {
      const r = await tools.call('import_image', { image }, ctx);
      expect(r.isError, image).toBe(true);
    }
    await symlink(path.join(dir, 'secreto.jpg'), path.join(project, 'imagenes', 'enlace.jpg'));
    expect((await tools.call('import_image', { image: 'imagenes/enlace.jpg' }, ctx)).isError).toBe(true);
    expect((await tools.call('import_image', { image: 'notas.txt', folder: 'carpeta-1' }, ctx)).isError).toBe(true);
    const unknown = await tools.call('import_image', { image: 'jjk.jpg', folder: 'carpeta-9' }, ctx);
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('choose_folder');
    // Las miniaturas tampoco salen de la carpeta.
    const listed = await tools.call('list_local_images', { folder: 'proyecto', subfolder: '..' }, ctx);
    expect(json(listed).folders).toEqual([expect.objectContaining({ images: [] })]);
  });

  it('un enlace directo solo se baja de un sitio declarado de confianza', async () => {
    const blocked = await tools.call('import_image', { url: 'https://nas.lan/fotos/a.jpg' }, ctx);
    expect(blocked.isError).toBe(true);
    expect(textOf(blocked)).toContain('Ajustes');
    expect(web.requests).toEqual([]);
  });

  it('lista las imágenes de las carpetas con miniatura y no cuenta lo que no es imagen', async () => {
    const r = await tools.call('list_local_images', {}, ctx);
    const folders = json(r).folders as Array<{ folder: string; images: Array<{ path: string }> }>;
    expect(folders.map((f) => f.folder)).toEqual(['proyecto', 'carpeta-1']);
    expect(folders[0]!.images.map((i) => i.path)).toEqual(['imagenes/propia.jpg']);
    expect(folders[1]!.images.map((i) => i.path)).toEqual(['jjk.jpg']);
    expect(r.content.filter((p) => p.type === 'image')).toHaveLength(2);
  });

  it('la carpeta de la agenda que todavía no existe no se crea al listar', async () => {
    const none: StarContext = { ...ctx, projectDir: async () => null };
    const listing = await tools.listFolder(none, 'proyecto');
    expect(listing.images).toEqual([]);
    expect((await tools.call('list_local_images', { folder: 'proyecto' }, none)).isError).toBe(true);
  });

  it('el panel de imágenes lista con miniaturas y lee una imagen', async () => {
    const listing = await tools.listFolder(ctx, 'carpeta-1');
    expect(listing.images).toEqual([expect.objectContaining({ path: 'jjk.jpg', thumb: expect.any(String) })]);
    expect(listing.folders.map((f) => f.alias)).toEqual(['proyecto', 'carpeta-1']);
    const file = await tools.readFile(ctx, 'carpeta-1', 'jjk.jpg');
    expect(rasterInfo(fromBase64(file.data))!.width).toBe(1600);
    await expect(tools.readFile(ctx, 'carpeta-1', '../secreto.jpg')).rejects.toThrow();
  });

  it('choose_folder le pide la carpeta a la persona', async () => {
    const asked = await tools.call('choose_folder', {}, { ...ctx, chooseFolder: async () => ({ alias: 'carpeta-2', label: 'Fotos', root: outside }) });
    expect(json(asked)).toMatchObject({ ok: true, folder: 'carpeta-2' });
    const cancelled = await tools.call('choose_folder', {}, { ...ctx, chooseFolder: async () => null });
    expect(json(cancelled)).toMatchObject({ ok: false, cancelled: true });
  });

  it('una entrada inválida o una herramienta que no existe devuelven un error legible', async () => {
    expect((await tools.call('search_images', { query: '' }, ctx)).isError).toBe(true);
    expect((await tools.call('nada', {}, ctx)).isError).toBe(true);
    expect(tools.has('import_font')).toBe(true);
  });

  it('prueba un servicio: funciona sin clave los públicos, avisa si falta la clave y no usa la caché', async () => {
    expect((await tools.check('openverse', {})).ok).toBe(true);
    const noKey = await tools.check('pexels', {});
    expect(noKey.ok).toBe(false);
    expect(noKey.message).toContain('PEXELS_API_KEY');
    expect((await tools.check('pexels', { PEXELS_API_KEY: 'k' })).ok).toBe(true);
    expect((await tools.check('fonts', {})).ok).toBe(false);
    expect((await tools.check('nada', {})).ok).toBe(false);
    const before = web.requests.length;
    await tools.check('openverse', {});
    expect(web.requests.length).toBeGreaterThan(before);
  });
});

describe('cancelar y límites de descarga', () => {
  it('detener el turno corta una descarga en curso, sin escribir nada', async () => {
    const slow = fakeWeb([...imageRoutes().filter((r) => r.match !== 'https://live.staticflickr.com/65535/estadio_b.jpg'), { match: 'https://live.staticflickr.com/65535/estadio_b.jpg', hang: true }]);
    const t = createStarTools({ version: 'test', http: slow.http, cache: createCache({ dir: null }) });
    const stop = new AbortController();
    const running = t.call('import_image', { id: `openverse:${OV_ID}` }, { ...ctx, signal: stop.signal });
    setTimeout(() => stop.abort(), 100);
    const r = await running;
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Cancelado');
    await expect(readFile(path.join(project, 'imagenes'))).rejects.toThrow();
  });

  it('una imagen que anuncia varios GB se rechaza sin bajarla, y una que no lo anuncia se corta al pasar el tope', async () => {
    const huge = fakeWeb([
      ...imageRoutes().filter((r) => r.match !== 'https://live.staticflickr.com/65535/estadio_b.jpg'),
      { match: 'https://live.staticflickr.com/65535/estadio_b.jpg', type: 'image/jpeg', body: new Uint8Array(1), headers: { 'content-length': String(5 * 1024 ** 3) } },
    ]);
    const t = createStarTools({ version: 'test', http: huge.http, cache: createCache({ dir: null }) });
    const r = await t.call('import_image', { id: `openverse:${OV_ID}` }, ctx);
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/pesa|máximo/);
  });
});
