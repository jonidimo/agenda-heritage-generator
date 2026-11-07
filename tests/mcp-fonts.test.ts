/**
 * Lo que el servidor MCP le da a un modelo para no tantear: la guía como herramienta (entera o por
 * sección), recetas para los pedidos comunes, cómo se corrige cada aviso, y add_font para incrustar
 * una fuente propia en un archivo o dejarla en la aplicación abierta.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { fromBase64 } from '../src/core/resources';
import { applyJsonPatch, type JsonPatchOp } from '../src/core/util/jsonPatch';
import { sourceResources } from '../src/mcp/dev';
import { AppLink, type AppConnection } from '../src/mcp/live';
import { createServer, guideSections } from '../src/mcp/server';
import { ROOT } from './helpers/node-env';

let dir = '';
const clients: Client[] = [];

/** Una aplicación de mentira que guarda una agenda, su revisión y las fuentes que le llegan. */
function fakeApp() {
  const state = {
    design: JSON.parse(JSON.stringify(parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' })))) as Record<string, unknown>,
    revision: 3,
    fonts: [] as Array<{ id: string; spec: { family: string; weight: number; style: string }; bytes: number }>,
    calls: [] as string[],
  };
  const conn: AppConnection = {
    async request(method, params) {
      state.calls.push(method);
      switch (method) {
        case 'design.get':
          return { revision: state.revision, design: JSON.parse(JSON.stringify(state.design)) };
        case 'design.patch': {
          const p = params as { patch: JsonPatchOp[] };
          state.design = applyJsonPatch(state.design, p.patch) as Record<string, unknown>;
          return { applied: true, revision: ++state.revision };
        }
        case 'fonts.add': {
          const p = params as { spec: { family: string; weight: number; style: string }; data: string };
          const id = `font-${state.fonts.length + 1}`;
          state.fonts.push({ id, spec: p.spec, bytes: fromBase64(p.data).length });
          return { id, ...p.spec, glyphs: 78 };
        }
        default:
          throw new Error(`inesperado: ${method}`);
      }
    },
    close: () => undefined,
  };
  return { state, link: new AppLink(async () => conn) };
}

async function connect(link?: AppLink) {
  const server = createServer({ root: dir, ...sourceResources(), ...(link ? { appLink: link } : {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  clients.push(client);
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
    const texts = res.content.filter((c) => c.type === 'text').map((c) => c.text ?? '');
    const parse = (s: string): unknown => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        return s;
      }
    };
    return { isError: res.isError === true, text: texts[0] ?? '', bodies: texts.map(parse) };
  };
  return { client, call };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-mcp-fuentes-'));
  await copyFile(join(ROOT, 'e2e/fixtures/dorsal-prueba.ttf'), join(dir, 'dorsal.ttf'));
});

afterAll(async () => {
  for (const c of clients) await c.close();
  await rm(dir, { recursive: true, force: true });
});

describe('la guía y las recetas', () => {
  it('get_guide da la guía entera o una sección, en los dos idiomas, sin importar tildes ni mayúsculas', async () => {
    const { call } = await connect();
    const all = await call('get_guide', {});
    expect(all.text).toContain('## 7. Fuentes propias');
    const fonts = await call('get_guide', { section: 'FUENTES' });
    expect(fonts.text.startsWith('## 7. Fuentes propias')).toBe(true);
    expect(fonts.text).not.toContain('## 8.');
    expect((await call('get_guide', { section: 'traducir' })).text).toContain('/locale');
    expect((await call('get_guide', { lang: 'en', section: 'scope' })).text).toContain('pageKey');
    // Una palabra del otro idioma encuentra la misma sección en el idioma pedido.
    const crossed = await call('get_guide', { section: 'fonts of your own' });
    expect(crossed.isError, crossed.text).toBe(false);
    expect(crossed.text.startsWith('## 7. Fuentes propias')).toBe(true);
    expect((await call('get_guide', { lang: 'en', section: 'alcance' })).text.startsWith('## 8. Scope')).toBe(true);
    const none = await call('get_guide', { section: 'no existe' });
    expect(none.isError).toBe(true);
    expect(none.text).toContain('Secciones:');
  });

  it('las secciones salen de los títulos «## »', () => {
    expect(guideSections('# Título\n\nIntro\n\n## Uno\n\na\n\n### Sub\n\nb\n\n## Dos\n\nc\n').map((s) => [s.title, s.text])).toEqual([
      ['Uno', '## Uno\n\na\n\n### Sub\n\nb'],
      ['Dos', '## Dos\n\nc'],
    ]);
  });

  it('ofrece recetas para armar una agenda, revisar los avisos y traducir', async () => {
    const { client } = await connect();
    const names = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['nueva-agenda', 'revisar-avisos', 'traducir']));
    const tr = await client.getPrompt({ name: 'traducir', arguments: { idioma: 'en-US', archivo: 'a.agenda.json' } });
    const body = (tr.messages[0]!.content as { text: string }).text;
    expect(body).toContain('"path": "/locale"');
    expect(body).toContain('a.agenda.json');
    expect(body).toContain('/holidays/renamed/');
  });

  it('las instrucciones del servidor nombran get_guide y lo que más cuesta adivinar', async () => {
    const { client } = await connect();
    const instructions = client.getInstructions() ?? '';
    for (const word of ['get_guide', 'agenda://guide/es', 'pageKey null', 'paper: true', '/locale', 'add_font', 'fallbacks', 'fix']) expect(instructions, word).toContain(word);
  });
});

describe('add_font', () => {
  it('incrusta la fuente en el archivo, la pone en los tipos de texto pedidos, y dice qué puntuación le falta', async () => {
    const { call } = await connect();
    expect((await call('create_design', { template: 'heritage', year: 2027, out: 'a.agenda.json' })).isError).toBe(false);
    const res = await call('add_font', { font: 'dorsal.ttf', path: 'a.agenda.json', roles: ['display', 'number', 'title'] });
    expect(res.isError, res.text).toBe(false);
    const body = res.bodies[0] as { written: boolean; font: { family: string; glyphs: number; punctuation: { missing: string[]; from: string } }; roles: string[] };
    expect(body).toMatchObject({ written: true, roles: ['display', 'number', 'title'] });
    expect(body.font).toMatchObject({ family: 'Dorsal Prueba', weight: 400, style: 'normal' });
    expect(body.font.glyphs).toBeGreaterThan(50);
    expect(body.font.punctuation).toMatchObject({ from: 'Manrope' });
    expect(body.font.punctuation.missing).toEqual(expect.arrayContaining([',', '(', ')']));
    const saved = JSON.parse(await readFile(join(dir, 'a.agenda.json'), 'utf8')) as { userFonts: Array<{ id: string; spec: unknown; data: string }>; theme: { tokens: { fonts: Record<string, unknown> } } };
    expect(saved.userFonts).toHaveLength(1);
    expect(fromBase64(saved.userFonts[0]!.data).length).toBe((await readFile(join(dir, 'dorsal.ttf'))).length);
    expect(saved.theme.tokens.fonts.title).toEqual({ family: 'Dorsal Prueba', weight: 400, style: 'normal' });
    // Agregarla otra vez la reemplaza (la misma id), no la duplica.
    const again = await call('add_font', { font: 'dorsal.ttf', path: 'a.agenda.json' });
    expect(again.isError).toBe(false);
    const after = JSON.parse(await readFile(join(dir, 'a.agenda.json'), 'utf8')) as { userFonts: Array<{ id: string }> };
    expect(after.userFonts.map((f) => f.id)).toEqual([saved.userFonts[0]!.id]);
    // check_design la usa: sale como propia, sin avisos de caracteres, y dice de dónde salen los signos.
    const check = await call('check_design', { path: 'a.agenda.json' });
    const summary = (check.bodies[0] as { summary: { fonts: { embedded: number; roles: Array<{ role: string; source: string; punctuation?: { from: string } }> }; warnings: Array<{ code: string; fix?: string }> } }).summary;
    expect(summary.fonts.embedded).toBe(1);
    expect(summary.fonts.roles.find((r) => r.role === 'title')).toMatchObject({ source: 'user', punctuation: { from: 'Manrope' } });
    expect(summary.warnings.filter((w) => w.code === 'missingGlyphs')).toEqual([]);
    // render_page dibuja con ella.
    const page = await call('render_page', { path: 'a.agenda.json', page: 1, width: 200 });
    expect(page.isError).toBe(false);
  });

  it('la puntuación que le falta se toma de la reserva de ESA agenda (su tema), no de una fija', async () => {
    const { call } = await connect();
    await call('create_design', { template: 'heritage', year: 2027, out: 'c.agenda.json' });
    // Primero Cormorant Garamond en la reserva del tema: de ahí salen la coma y los paréntesis.
    expect((await call('update_design', { path: 'c.agenda.json', patch: [{ op: 'add', path: '/theme/tokens/fallbacks', value: ['Cormorant Garamond', 'Manrope'] }] })).isError).toBe(false);
    const res = await call('add_font', { font: 'dorsal.ttf', path: 'c.agenda.json' });
    expect(res.isError, res.text).toBe(false);
    expect((res.bodies[0] as { font: { punctuation: { from: string } } }).font.punctuation.from).toBe('Cormorant Garamond');
  });

  it('no escribe una agenda que después no podría volver a abrir', async () => {
    const { Workspace, MAX_READ_BYTES } = await import('../src/mcp/workspace');
    const ws = new Workspace(dir);
    await expect(ws.write('enorme.agenda.json', 'x'.repeat(MAX_READ_BYTES + 1), { extensions: ['.agenda.json'], overwrite: true })).rejects.toThrow(/más de lo que se puede volver a abrir/);
  });

  it('pide una sola agenda, y solo lee fuentes de la carpeta de trabajo', async () => {
    const { call } = await connect();
    expect((await call('add_font', { font: 'dorsal.ttf' })).isError).toBe(true);
    expect((await call('add_font', { font: 'dorsal.ttf', path: 'a.agenda.json', app: true })).isError).toBe(true);
    expect((await call('add_font', { font: '../afuera.ttf', path: 'a.agenda.json' })).isError).toBe(true);
    expect((await call('add_font', { font: 'a.agenda.json', path: 'a.agenda.json' })).text).toMatch(/\.ttf/);
  });

  it('con app: true la deja en la aplicación y, con roles, cambia la agenda abierta en un paso', async () => {
    const app = fakeApp();
    const { call } = await connect(app.link);
    const res = await call('add_font', { font: 'dorsal.ttf', app: true, roles: ['display'] });
    expect(res.isError, res.text).toBe(false);
    expect(app.state.fonts).toEqual([{ id: 'font-1', spec: { family: 'Dorsal Prueba', weight: 400, style: 'normal' }, bytes: (await readFile(join(dir, 'dorsal.ttf'))).length }]);
    expect(res.bodies[0]).toMatchObject({ font: { id: 'font-1', family: 'Dorsal Prueba' }, roles: ['display'] });
    expect(res.bodies[1]).toMatchObject({ applied: true, revision: 4 });
    expect(((app.state.design.theme as { tokens: { fonts: Record<string, unknown> } }).tokens.fonts.display as { family: string }).family).toBe('Dorsal Prueba');
    expect(app.state.calls).toEqual(expect.arrayContaining(['fonts.add', 'design.get', 'design.patch']));
  });
});

describe('cómo se corrige cada aviso', () => {
  it('update_design manda los avisos del cambio y, una vez por código, cómo se corrigen', async () => {
    const { call } = await connect();
    await call('create_design', { template: 'heritage', year: 2027, out: 'b.agenda.json' });
    // Alineado a la derecha: la tinta llega al borde de la caja, fuera de la página.
    const element = { id: 'sale', pageType: 'weekLeft', pageKey: null, kind: 'text', mirror: false, x: 120, y: 10, w: 60, h: 10, props: { text: 'Hola', align: 'right' } };
    const res = (await call('update_design', { path: 'b.agenda.json', patch: [{ op: 'add', path: '/customBlocks/-', value: element }] })).bodies[0] as { warnings: Array<{ code: string }>; fixes: Record<string, string> };
    expect(res.warnings.some((w) => w.code === 'offPage')).toBe(true);
    expect(Object.keys(res.fixes)).toEqual([...new Set(res.warnings.map((w) => w.code))]);
    expect(res.fixes.offPage).toMatch(/achicalo|correlo/);
  });
});
