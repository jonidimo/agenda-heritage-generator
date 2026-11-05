/**
 * El servidor MCP trabajando sobre la agenda abierta en la aplicación (`app: true`), con una aplicación
 * de mentira que guarda una agenda y su revisión. El transporte real (el socket) se prueba en
 * `live-broker.test.ts`; acá, lo que hacen las herramientas con las respuestas de la aplicación.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { LIVE_CODES } from '../src/core/live/protocol';
import { applyJsonPatch, type JsonPatchOp } from '../src/core/util/jsonPatch';
import { sourceResources } from '../src/mcp/dev';
import { AppLink, type AppConnection } from '../src/mcp/live';
import { createServer } from '../src/mcp/server';
import { LIVE_ERRORS, LiveError } from '../electron/lib/live.mjs';

/** La aplicación de mentira: una agenda, su revisión y lo que se le pidió. */
function fakeApp(options: { enabled?: boolean } = {}) {
  const state = {
    design: JSON.parse(JSON.stringify(parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' })))) as Record<string, unknown>,
    revision: 7,
    calls: [] as Array<{ method: string; params: unknown }>,
    /** Una revisión más antes de contestar (la persona tocó algo mientras tanto). */
    bumpBeforePatch: false,
    opened: 0,
  };
  const conn: AppConnection = {
    async request(method, params) {
      state.calls.push({ method, params });
      const disabled = (): never => {
        throw new LiveError('La persona no permitió que un modelo de IA use la agenda abierta.', LIVE_CODES.disabled);
      };
      switch (method) {
        case 'design.info':
          return { enabled: options.enabled !== false, open: true, id: state.design.id, name: state.design.name, year: 2027, revision: state.revision, pageCount: 130, mode: 'design', appVersion: '2.3.0' };
        case 'design.get':
          return options.enabled === false ? disabled() : { revision: state.revision, design: JSON.parse(JSON.stringify(state.design)) };
        case 'design.patch': {
          if (options.enabled === false) disabled();
          const p = params as { patch: JsonPatchOp[]; baseRevision?: number };
          if (state.bumpBeforePatch) state.revision++;
          if (p.baseRevision !== undefined && p.baseRevision !== state.revision) throw new LiveError(`La agenda cambió en la aplicación (revisión ${state.revision}).`, LIVE_CODES.conflict);
          state.design = applyJsonPatch(state.design, p.patch) as Record<string, unknown>;
          return { applied: true, revision: ++state.revision };
        }
        case 'view.reveal':
          return { page: 3, key: 'k', selected: true };
        case 'library.list':
          return [{ id: 'a1', name: 'Otra', year: 2026, updatedAt: '2026-01-01' }];
        case 'design.open':
          state.opened++;
          return { id: 'a1', name: 'Otra', revision: 1 };
        case 'design.load':
          return { id: 'nueva', name: (params as { design: { name: string } }).design.name, revision: 1 };
      }
    },
    close: () => undefined,
  };
  return { state, link: new AppLink(async () => conn) };
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function connect(link: AppLink) {
  const server = createServer({ root: process.cwd(), ...sourceResources(), appLink: link });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const first = (res.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text');
    return { isError: res.isError === true, body: first?.text ? safeParse(first.text) : null, raw: res };
  };
  return { call, client };
}

const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

describe('servidor MCP con la aplicación abierta', () => {
  it('ofrece las herramientas del enlace además de las de siempre', async () => {
    const { client } = await connect(fakeApp().link);
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const name of ['app_status', 'app_reveal', 'app_library', 'app_open', 'update_design', 'create_design', 'render_page']) expect(names).toContain(name);
  });

  it('app_status cuenta lo que la aplicación tiene abierto, y sin aplicación lo dice sin error', async () => {
    const { call } = await connect(fakeApp().link);
    const status = await call('app_status');
    expect(status.isError).toBe(false);
    expect(status.body).toMatchObject({ running: true, enabled: true, open: true, revision: 7, pageCount: 130, appVersion: '2.3.0' });
    const none = await connect(new AppLink(async () => null));
    const off = await none.call('app_status');
    expect(off.isError).toBe(false);
    expect(off.body).toMatchObject({ running: false });
  });

  it('update_design con app: lee, revisa acá y manda solo el parche con la revisión que leyó', async () => {
    const app = fakeApp();
    const { call } = await connect(app.link);
    const res = await call('update_design', { app: true, patch: [{ op: 'replace', path: '/persona/name', value: 'Ana' }] });
    expect(res.isError).toBe(false);
    expect(res.body).toMatchObject({ applied: true, revision: 8 });
    expect((app.state.design.persona as { name: string }).name).toBe('Ana');
    const sent = app.state.calls.find((c) => c.method === 'design.patch')!;
    expect(sent.params).toEqual({ patch: [{ op: 'replace', path: '/persona/name', value: 'Ana' }], baseRevision: 7 });
  });

  it('si la persona cambió la agenda mientras tanto, el cambio se rechaza con el motivo y no se pisa nada', async () => {
    const app = fakeApp();
    app.state.bumpBeforePatch = true;
    const { call } = await connect(app.link);
    const res = await call('update_design', { app: true, patch: [{ op: 'replace', path: '/persona/name', value: 'Ana' }] });
    expect(res.isError).toBe(true);
    expect(String(res.body)).toContain('cambió en la aplicación');
    expect((app.state.design.persona as { name: string }).name).not.toBe('Ana');
  });

  it('un cambio que deja la agenda inválida no llega a la aplicación', async () => {
    const app = fakeApp();
    const { call } = await connect(app.link);
    const res = await call('update_design', { app: true, patch: [{ op: 'replace', path: '/calendar/year', value: 'dos mil' }] });
    expect(res.isError).toBe(true);
    expect(res.body).toMatchObject({ applied: false });
    expect(app.state.calls.some((c) => c.method === 'design.patch')).toBe(false);
  });

  it('un parche que no se puede aplicar (ruta inexistente) da un error claro', async () => {
    const { call } = await connect(fakeApp().link);
    const res = await call('update_design', { app: true, patch: [{ op: 'remove', path: '/no/existe' }] });
    expect(res.isError).toBe(true);
  });

  it('devuelve los avisos de maquetación que el cambio produjo, como con un archivo', async () => {
    const app = fakeApp();
    const { call } = await connect(app.link);
    // Un texto propio enorme en un recuadro chico no entra.
    const block = { id: 'big', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 20, w: 30, h: 8, mirror: true, props: { text: 'Un texto muy largo que no puede entrar en un recuadro tan chico', size: 60, fit: false } };
    const res = await call('update_design', { app: true, patch: [{ op: 'add', path: '/customBlocks/-', value: block }] });
    expect(res.isError).toBe(false);
    const body = res.body as { warnings: Array<{ code: string }> };
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it('check_design, list_pages y render_page con app usan la agenda abierta', async () => {
    const app = fakeApp();
    const { call, client } = await connect(app.link);
    expect((await call('check_design', { app: true })).isError).toBe(false);
    const pages = await call('list_pages', { app: true, limit: 3 });
    expect((pages.body as { pages: unknown[] }).pages).toHaveLength(3);
    const render = await client.callTool({ name: 'render_page', arguments: { app: true, page: 1, width: 300 } });
    expect((render.content as Array<{ type: string }>).some((c) => c.type === 'image' || c.type === 'text')).toBe(true);
    expect(app.state.calls.filter((c) => c.method === 'design.get').length).toBeGreaterThanOrEqual(3);
    // Para dibujar, las imágenes propias van adentro.
    expect(app.state.calls.find((c) => c.method === 'design.get')!.params).toEqual({ assets: true });
  });

  it('indicar más de una fuente, o ninguna, es un error', async () => {
    const { call } = await connect(fakeApp().link);
    expect((await call('check_design', { app: true, path: 'a.agenda.json' })).isError).toBe(true);
    expect((await call('check_design', {})).isError).toBe(true);
    expect((await call('update_design', { patch: [{ op: 'replace', path: '/name', value: 'x' }] })).isError).toBe(true);
    expect((await call('update_design', { app: true, path: 'a.agenda.json', patch: [{ op: 'replace', path: '/name', value: 'x' }] })).isError).toBe(true);
  });

  it('sin la aplicación abierta, el error lo dice y sugiere qué hacer', async () => {
    const { call } = await connect(new AppLink(async () => null));
    const res = await call('update_design', { app: true, patch: [{ op: 'replace', path: '/name', value: 'x' }] });
    expect(res.isError).toBe(true);
    expect(String(res.body)).toContain('No encuentro la aplicación');
  });

  it('si la persona no permitió el enlace, el motivo llega tal cual', async () => {
    const { call } = await connect(fakeApp({ enabled: false }).link);
    const res = await call('check_design', { app: true });
    expect(res.isError).toBe(true);
    expect(String(res.body)).toContain('no permitió');
  });

  it('create_design con app abre la agenda nueva en la aplicación y no escribe archivos', async () => {
    const app = fakeApp();
    const { call } = await connect(app.link);
    const res = await call('create_design', { template: 'heritage', year: 2028, name: 'Para mí', app: true });
    expect(res.isError).toBe(false);
    expect(res.body).toMatchObject({ opened: { id: 'nueva' } });
    expect(app.state.calls.some((c) => c.method === 'design.load')).toBe(true);
    expect((await call('create_design', { template: 'heritage', out: 'x.agenda.json', app: true })).isError).toBe(true);
  });

  it('app_reveal, app_library y app_open reenvían a la aplicación', async () => {
    const app = fakeApp();
    const { call } = await connect(app.link);
    expect((await call('app_reveal', { page: 3, blockId: 'header.title' })).body).toMatchObject({ page: 3, selected: true });
    expect((await call('app_reveal', {})).isError).toBe(true);
    expect((await call('app_library')).body).toEqual([{ id: 'a1', name: 'Otra', year: 2026, updatedAt: '2026-01-01' }]);
    expect((await call('app_open', { id: 'a1' })).body).toMatchObject({ id: 'a1' });
  });

  it('una conexión cortada se vuelve a abrir una vez, y si sigue cortada falla con un mensaje claro', async () => {
    let opens = 0;
    let broken = true;
    const link = new AppLink(async () => {
      opens++;
      return {
        async request() {
          if (broken) {
            broken = false;
            throw new LiveError('socket hang up', LIVE_ERRORS.unavailable);
          }
          return { enabled: true, open: true, mode: 'design', appVersion: '2.3.0' };
        },
        close: () => undefined,
      };
    });
    expect(await link.status()).toMatchObject({ open: true });
    expect(opens).toBe(2);
    const dead = new AppLink(async () => ({
      async request() {
        throw new LiveError('socket hang up', LIVE_ERRORS.unavailable);
      },
      close: () => undefined,
    }));
    await expect(dead.status()).rejects.toThrow(/No pude hablar con la aplicación/);
  });
});
