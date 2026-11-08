/** Las herramientas de internet de la estrella del lado de la página: pedido al proceso principal, imagen y fuente que entran a la agenda. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesign } from '../../src/core/design/defaults';
import { parseDesign } from '../../src/core/design/schema';
import { toBase64 } from '../../src/core/resources';
import { loadWebTools } from '../../src/app/state/ai/webTools';
import { resources } from '../../src/app/state/resources';
import { useStore } from '../../src/app/state/store';
import { makeJpeg } from '../helpers/jpeg';

vi.mock('../../src/app/state/selectionContext', () => ({ currentDocument: () => ({ pageSize: () => ({ w: 148, h: 210 }), coverSize: () => ({ w: 330, h: 230 }) }) }));

const DORSAL = new Uint8Array(readFileSync('e2e/fixtures/dorsal-prueba.ttf'));
const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
let enabled = true;
let respond: (name: string) => Record<string, unknown> = () => ({ content: [{ type: 'text', text: '{}' }] });

beforeEach(() => {
  calls.length = 0;
  enabled = true;
  vi.stubGlobal('location', { protocol: 'app:' });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, ...(body ? { body } : {}) });
    if (url === '/_sys/tools/list') return new Response(JSON.stringify({ enabled, tools: enabled ? [{ name: 'import_image', description: 'd', inputSchema: { type: 'object', properties: { id: { type: 'string' } } }, readOnly: false }, { name: 'search_images', description: 'd', inputSchema: { type: 'object' }, readOnly: true }] : [] }));
    return new Response(JSON.stringify(respond(String(body?.name))));
  });
  useStore.setState({ design: null, past: [], future: [], revision: 0 });
  useStore.getState().setDesign(parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' })));
});
afterEach(() => vi.unstubAllGlobals());

describe('herramientas web de la estrella', () => {
  it('no hay herramientas fuera del escritorio ni si la persona las apagó', async () => {
    vi.stubGlobal('location', { protocol: 'https:' });
    expect(await loadWebTools()).toBeUndefined();
    vi.stubGlobal('location', { protocol: 'app:' });
    enabled = false;
    expect(await loadWebTools()).toBeUndefined();
  });

  it('las herramientas llegan con "for" agregado a import_image, y el pedido lleva la agenda abierta y el tamaño en mm', async () => {
    const web = (await loadWebTools())!;
    expect(web.specs.map((s) => s.name)).toEqual(['import_image', 'search_images']);
    expect(JSON.stringify(web.specs[0]!.inputSchema)).toContain('"for"');
    const design = useStore.getState().design!;
    await web.call('import_image', { id: 'openverse:x', for: 'page' });
    const sent = calls.find((c) => c.url === '/_sys/tools/call')!.body!;
    expect(sent.agenda).toEqual({ id: design.id, name: design.name });
    const input = sent.input as { sizeMm: { w: number; h: number }; for?: unknown };
    expect(input.for).toBeUndefined();
    expect(input.sizeMm).toEqual({ w: 148, h: 210 });
    const both = await web.call('import_image', { for: 'page', sizeMm: { w: 10, h: 10 } });
    expect(both.isError).toBe(true);
  });

  it('la imagen preparada entra a Recursos con su crédito y el modelo recibe el id; la misma imagen no se agrega dos veces', async () => {
    const web = (await loadWebTools())!;
    const asset = { name: 'Estadio', kind: 'raster', mime: 'image/jpeg', data: toBase64(makeJpeg(300, 200)), credit: { source: 'openverse', id: 'x', title: 'Estadio', author: 'Jane', authorUrl: null, license: 'CC BY 2.0', licenseUrl: null, url: null, sourceSha256: 'a'.repeat(64), verified: true, modified: false } };
    respond = () => ({ content: [{ type: 'text', text: '{"ok":true}' }, { type: 'image', mime: 'image/jpeg', data: 'AAAA' }], assets: [asset] });
    const first = await web.call('import_image', { id: 'openverse:x' });
    const text = JSON.stringify(first.content);
    expect(text).toContain('assetId');
    const added = useStore.getState().design!.assets.find((a) => a.name === 'Estadio')!;
    expect(added).toMatchObject({ kind: 'raster', width: 300, height: 200, credit: { author: 'Jane', license: 'CC BY 2.0' } });
    expect(resources.assetBytes.get(added.id)).toBeDefined();
    expect(first.content.some((p) => p.type === 'image')).toBe(true);
    const again = await web.call('import_image', { id: 'openverse:x' });
    expect(JSON.stringify(again.content)).toContain('Ya estaba');
    expect(useStore.getState().design!.assets.filter((a) => a.name === 'Estadio')).toHaveLength(1);
  });

  it('una fuente instalada queda disponible en el registro', async () => {
    const web = (await loadWebTools())!;
    respond = () => ({ content: [{ type: 'text', text: '{"ok":true}' }], fonts: [{ family: 'Dorsal Prueba', weight: 400, style: 'normal', data: toBase64(DORSAL), label: 'Dorsal Prueba 400' }] });
    const out = await web.call('import_image', {});
    expect(JSON.stringify(out.content)).toContain('Fuente instalada');
    expect(resources.fonts.families()).toContain('Dorsal Prueba');
  });

  it('un error del proceso principal vuelve como error legible', async () => {
    const web = (await loadWebTools())!;
    respond = () => ({ error: 'name' });
    const out = await web.call('search_images', {});
    expect(out.isError).toBe(true);
  });
});
