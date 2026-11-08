import { mkdtemp, rm } from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StarBridge } from '../electron/lib/starBridge.mjs';
import { ToolSettingsStore } from '../electron/lib/toolSettings.mjs';

const safe = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')), decryptString: (b: Buffer) => b.toString().split('').reverse().join('') };

let dir: string;
let store: InstanceType<typeof ToolSettingsStore>;
let calls: Array<{ name: string; input: unknown; ctx: Record<string, unknown> }>;
let picks: Array<string | null>;
let opened: string[];
let bridge: InstanceType<typeof StarBridge>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bridge-'));
  store = new ToolSettingsStore({ file: path.join(dir, 'tools.json'), documentsDir: path.join(dir, 'Docs'), fs: fsp, safeStorage: safe });
  calls = [];
  picks = [];
  opened = [];
  const tools = {
    specs: () => [{ name: 'search_images' }],
    has: (n: string) => n === 'search_images',
    call: async (name: string, input: unknown, ctx: Record<string, unknown>) => (calls.push({ name, input, ctx }), { content: [{ type: 'text', text: 'ok' }] }),
    check: async (service: string, env: Record<string, string>) => ({ ok: Boolean(env.PEXELS_API_KEY), message: service }),
    listFolder: async () => ({ images: [] }),
    readFile: async () => ({ name: 'a.jpg', data: '' }),
  };
  bridge = new StarBridge({ store, loadTools: async () => tools, chooseDirectory: async () => picks.shift() ?? null, openPath: async (d: string) => (opened.push(d), ''), fs: fsp });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('puente de herramientas del escritorio', () => {
  it('las claves se guardan por la página pero nunca vuelven, y llegan a las herramientas como entorno', async () => {
    const out = await bridge.updateConfig({ keys: { PEXELS_API_KEY: 'k-123' }, trustedHosts: 'nas.lan, fotos.casa' });
    expect(JSON.stringify(out)).not.toContain('k-123');
    expect(out.status?.hasKey.PEXELS_API_KEY).toBe(true);
    await bridge.call({ name: 'search_images', input: { query: 'x' }, agenda: { id: 'a', name: 'Mi agenda' } });
    expect(calls[0]!.ctx.env).toEqual({ PEXELS_API_KEY: 'k-123', AGENDA_TRUSTED_HOSTS: 'nas.lan,fotos.casa' });
    expect(await bridge.check('pexels')).toEqual({ ok: true, message: 'pexels' });
  });

  it('rechaza claves, listas y acciones inválidas', async () => {
    expect(await bridge.updateConfig({ keys: { OTRA: 'x' } })).toEqual({ error: 'key' });
    expect(await bridge.updateConfig({ keys: { PEXELS_API_KEY: 'con espacio\u0000' } })).toEqual({ error: 'key' });
    expect(await bridge.updateConfig({ trustedHosts: 'a"b' })).toEqual({ error: 'trustedHosts' });
    expect(await bridge.updateConfig(null)).toEqual({ error: 'body' });
    expect(await bridge.action({ action: 'borrar-todo' })).toEqual({ error: 'action' });
    expect(await bridge.call({ name: 'x'.repeat(200) })).toEqual({ error: 'name' });
  });

  it('desactivadas, no ofrece herramientas ni ejecuta ninguna', async () => {
    await bridge.updateConfig({ enabled: false });
    expect(await bridge.list()).toEqual({ enabled: false, tools: [] });
    const r = (await bridge.call({ name: 'search_images', input: {} })) as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it('la carpeta de la agenda se crea recién cuando una herramienta la pide, y listar no la crea', async () => {
    await bridge.call({ name: 'search_images', input: {}, agenda: { id: 'a', name: 'Mi agenda' } });
    expect(await store.load().then((d: { projects: object }) => d.projects)).toEqual({});
    await (calls[0]!.ctx.projectDir as () => Promise<string | null>)();
    expect(Object.keys((await store.load()).projects)).toEqual(['a']);
    await bridge.browse({ folder: 'proyecto', agenda: { id: 'b', name: 'Otra' } });
    expect(Object.keys((await store.load()).projects)).toEqual(['a']);
  });

  it('elegir carpetas: la de las agendas y las de lectura, con alias para el modelo', async () => {
    picks.push(path.join(dir, 'Elegida'));
    await fsp.mkdir(path.join(dir, 'Elegida'));
    expect((await bridge.action({ action: 'choose-root' })).status?.root).toBe(path.join(dir, 'Elegida'));
    expect((await bridge.action({ action: 'choose-root' })).cancelled).toBe(true);
    picks.push(path.join(dir, 'Descargas'));
    await bridge.action({ action: 'add-folder' });
    expect(await bridge.folders()).toEqual([{ alias: 'carpeta-1', label: 'Descargas', root: path.join(dir, 'Descargas') }]);
    expect((await bridge.action({ action: 'reset-root' })).status?.rootIsDefault).toBe(true);
    await bridge.action({ action: 'remove-folder', folder: path.join(dir, 'Descargas') });
    expect(await bridge.folders()).toEqual([]);
    expect((await bridge.action({ action: 'open-root' })).ok).toBe(true);
    expect(opened.at(-1)).toBe(path.join(dir, 'Docs', 'Heritage Studio'));
  });

  it('choose_folder de una herramienta usa el diálogo y deja la carpeta autorizada', async () => {
    await bridge.call({ name: 'search_images', input: {} });
    picks.push(path.join(dir, 'Fotos'));
    const found = await (calls[0]!.ctx.chooseFolder as () => Promise<{ alias: string } | null>)();
    expect(found?.alias).toBe('carpeta-1');
    expect(await (calls[0]!.ctx.chooseFolder as () => Promise<unknown>)()).toBeNull();
  });
});
