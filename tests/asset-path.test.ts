/**
 * Imágenes por ruta (`assets[].path`): relativas a la carpeta del `.agenda.json` y sin salir de ella.
 * La línea de comandos, el servidor MCP y la aplicación de escritorio las leen; la de la aplicación
 * abierta les llegan con sus datos.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { applyJsonPatch, type JsonPatchOp } from '../src/core/util/jsonPatch';
import { isRelativeAssetPath, RELATIVE_PATH_PATTERN } from '../src/core/util/relpath';
import { designJsonSchema } from '../src/core/design/jsonSchema';
import { checkDesignData } from '../src/node/check';
import { sourceResources } from '../src/mcp/dev';
import { AppLink, type AppConnection } from '../src/mcp/live';
import { createServer } from '../src/mcp/server';
import { folderIO, inlinePathAssets, openNodeDocument, ROOT } from '../src/node/env';
import { isRelativeAssetPath as electronRule } from '../electron/lib/assets.mjs';

const run = promisify(execFile);
let dir = '';
let svg: Uint8Array;

/** Una agenda con un elemento imagen en la portada interior que usa `logo` por ruta. */
function withPathImage(path: string): Design {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  d.assets.push({ id: 'logo', name: 'Logo', kind: 'vector', mime: 'image/svg+xml', width: 20, height: 20, builtin: null, path });
  d.customBlocks.push({ id: 'pic', pageType: 'titlePage', pageKey: null, kind: 'image', x: 20, y: 20, w: 30, h: 30, mirror: true, props: { assetId: 'logo' } });
  return parseDesign(d);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-path-'));
  svg = new Uint8Array(await readFile(join(ROOT, 'public/watermarks/colibri.svg')));
  await mkdir(join(dir, 'proyecto', 'imagenes'), { recursive: true });
  await writeFile(join(dir, 'proyecto', 'imagenes', 'logo.svg'), svg);
  await writeFile(join(dir, 'secreto.svg'), svg);
  // Un enlace adentro de la carpeta que apunta afuera.
  await symlink(join(dir, 'secreto.svg'), join(dir, 'proyecto', 'imagenes', 'atajo.svg'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('la regla de las rutas', () => {
  it('acepta rutas relativas dentro de la carpeta y rechaza las que salen o no son rutas', () => {
    for (const ok of ['logo.png', 'imagenes/logo.png', 'a/b/c/Mi foto 2.jpg', 'ñandú.svg']) expect(isRelativeAssetPath(ok), ok).toBe(true);
    for (const bad of ['', '/etc/passwd', '../x.png', 'a/../../x.png', 'a/./x.png', 'a//x.png', 'C:/x.png', 'C:\\\\x.png', 'a\\\\x.png', 'file:x.png', 'https://x/y.png', ' x.png', 'x.png ', 'a/\u0000.png', 'x'.repeat(301)])
      expect(isRelativeAssetPath(bad), JSON.stringify(bad)).toBe(false);
  });

  it('ninguna ruta con un segmento «..» pasa, y la regla de Electron dice siempre lo mismo (propiedades)', () => {
    const seg = fc.stringMatching(/^[a-zA-Z0-9 ._:\\-]{0,6}$/);
    fc.assert(
      fc.property(fc.array(fc.oneof(seg, fc.constant('..'), fc.constant('.')), { minLength: 1, maxLength: 6 }), (parts) => {
        const p = parts.join('/');
        expect(electronRule(p)).toBe(isRelativeAssetPath(p));
        if (parts.includes('..')) expect(isRelativeAssetPath(p)).toBe(false);
      }),
    );
  });

  it('la expresión del esquema JSON dice lo mismo que la regla (propiedades)', () => {
    const re = new RegExp(RELATIVE_PATH_PATTERN, 'u');
    const piece = fc.oneof(fc.constant('/'), fc.constant('.'), fc.constant('..'), fc.constant(' '), fc.constant('\u00a0'), fc.constant(':'), fc.constant('\\'), fc.constant('\u0007'), fc.string({ maxLength: 4 }));
    fc.assert(fc.property(fc.array(piece, { maxLength: 8 }), (parts) => {
      const p = parts.join('');
      expect(re.test(p) && p.length <= 300, JSON.stringify(p)).toBe(isRelativeAssetPath(p));
    }), { numRuns: 2000 });
  });

  it('la revisión de un archivo avisa una ruta que no vale, en lugar de descartarla callada', () => {
    const raw = JSON.parse(JSON.stringify(withPathImage('imagenes/logo.svg'))) as { assets: Array<{ id: string; path: string }> };
    raw.assets.find((a) => a.id === 'logo')!.path = '../secreto.svg';
    const check = checkDesignData(raw);
    expect(check.issues.map((i) => i.path).join(' ')).toMatch(/assets.*path/);
    // El esquema JSON lleva la regla (la leen Ajv y los modelos de lenguaje).
    const assetSchema = (designJsonSchema() as { properties: { assets: { items: { properties: { path: { anyOf: Array<{ pattern?: string }> } } } } } }).properties.assets.items.properties.path;
    const pattern = new RegExp(assetSchema.anyOf.find((x) => x.pattern)!.pattern!, 'u');
    expect(pattern.test('imagenes/logo.png')).toBe(true);
    expect(pattern.test('../secreto.svg')).toBe(false);
  });

  it('el esquema descarta una ruta que sale de la carpeta', () => {
    expect(withPathImage('../secreto.svg').assets.find((a) => a.id === 'logo')!.path).toBeNull();
    expect(withPathImage('imagenes/logo.svg').assets.find((a) => a.id === 'logo')!.path).toBe('imagenes/logo.svg');
  });
});

describe('lectura desde Node', () => {
  it('con la carpeta de la agenda, la imagen se dibuja; sin carpeta, el error dice qué pasa', async () => {
    const d = withPathImage('imagenes/logo.svg');
    const withDir = await openNodeDocument(d, undefined, { baseDir: join(dir, 'proyecto') });
    expect(withDir.errors).toEqual([]);
    expect(withDir.bytes.get('logo')).toEqual(svg);
    const title = withDir.doc.plan.pages.find((p) => p.type === 'titlePage')!;
    expect(withDir.doc.pageWarnings(title.index).filter((w) => w.code === 'missingAsset')).toEqual([]);
    const without = await openNodeDocument(d);
    expect(without.errors.join(' ')).toMatch(/archivo aparte \(imagenes\/logo\.svg\)/);
    expect(without.doc.pageWarnings(title.index).map((w) => w.code)).toContain('missingAsset');
  });

  it('un enlace simbólico que lleva afuera, o un archivo que no está, no se leen', async () => {
    const io = folderIO(join(dir, 'proyecto'));
    await expect(io.read('imagenes/atajo.svg')).rejects.toThrow(/fuera de la carpeta/);
    await expect(io.read('imagenes/no-esta.svg')).rejects.toThrow(/no está junto a la agenda/);
    await expect(io.read('../secreto.svg')).rejects.toThrow(/relativa/);
    await expect(io.read('imagenes')).rejects.toThrow(/no es un archivo/);
  });

  it('inlinePathAssets pone los datos adentro y avisa lo que no pudo leer', async () => {
    const d = withPathImage('imagenes/logo.svg');
    d.assets.push({ id: 'otra', name: 'Otra', kind: 'vector', mime: 'image/svg+xml', width: 1, height: 1, builtin: null, path: 'imagenes/no-esta.svg' });
    const { design, errors } = await inlinePathAssets(d, join(dir, 'proyecto'));
    expect(design.assets.find((a) => a.id === 'logo')!.data).toBe(Buffer.from(svg).toString('base64'));
    expect(design.assets.find((a) => a.id === 'otra')!.data ?? null).toBeNull();
    expect(errors).toHaveLength(1);
  });

  it('la línea de comandos lee las imágenes junto al archivo', async () => {
    const file = join(dir, 'proyecto', 'mia.agenda.json');
    await writeFile(file, JSON.stringify(withPathImage('imagenes/logo.svg')));
    const { stdout } = await run('npx', ['tsx', join(ROOT, 'src/cli/agenda.ts'), 'info', file], { cwd: ROOT });
    expect(stdout).toMatch(/Avisos: 0/);
    expect(stdout).not.toMatch(/Falta|no se pudo leer|archivo aparte/i);
  }, 60_000);
});

describe('servidor MCP', () => {
  async function connect(link?: AppLink) {
    const server = createServer({ root: join(dir, 'proyecto'), ...sourceResources(), ...(link ? { appLink: link } : {}) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'prueba', version: '1' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await client.callTool({ name, arguments: args });
      const first = (res.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text');
      return { isError: res.isError === true, body: JSON.parse(first!.text!) as Record<string, unknown> };
    };
    return { call, close: async () => (await client.close(), await server.close()) };
  }

  it('check_design de un archivo lee sus imágenes por ruta, y las de una agenda escrita en el pedido salen de la carpeta de trabajo', async () => {
    await writeFile(join(dir, 'proyecto', 'mcp.agenda.json'), JSON.stringify(withPathImage('imagenes/logo.svg')));
    const { call, close } = await connect();
    const fromFile = await call('check_design', { path: 'mcp.agenda.json' });
    expect(JSON.stringify(fromFile.body)).not.toMatch(/missingAsset|archivo aparte/);
    const inline = await call('check_design', { design: withPathImage('imagenes/logo.svg') as unknown as Record<string, unknown> });
    expect(JSON.stringify(inline.body)).not.toMatch(/missingAsset|archivo aparte/);
    await close();
  });

  it('un cambio a la agenda abierta que agrega una imagen por ruta le manda a la aplicación sus datos', async () => {
    const state = { design: JSON.parse(JSON.stringify(parseDesign(createDesign('heritage', { year: 2027 })))) as Record<string, unknown>, revision: 3, patches: [] as JsonPatchOp[][] };
    const conn: AppConnection = {
      async request(method, params) {
        if (method === 'design.get') return { revision: state.revision, design: JSON.parse(JSON.stringify(state.design)) };
        if (method === 'design.patch') {
          const p = (params as { patch: JsonPatchOp[] }).patch;
          state.patches.push(p);
          state.design = applyJsonPatch(state.design, p) as Record<string, unknown>;
          return { applied: true, revision: ++state.revision };
        }
        throw new Error(method);
      },
      close: () => undefined,
    };
    const { call, close } = await connect(new AppLink(async () => conn));
    const asset = { id: 'logo', name: 'Logo', kind: 'vector', mime: 'image/svg+xml', width: 20, height: 20, builtin: null, path: 'imagenes/logo.svg' };
    const res = await call('update_design', { app: true, patch: [{ op: 'add', path: '/assets/-', value: asset }] });
    expect(res.isError).toBe(false);
    const sent = state.patches[0]!;
    expect(sent[0]).toEqual({ op: 'add', path: '/assets/-', value: asset });
    expect(sent[1]).toMatchObject({ op: 'add', path: expect.stringMatching(/^\/assets\/\d+\/data$/) as unknown as string });
    const assets = state.design.assets as Array<{ id: string; data?: string }>;
    expect(assets.find((a) => a.id === 'logo')!.data).toBe(Buffer.from(svg).toString('base64'));
    await close();
  });
});
