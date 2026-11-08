/**
 * Navegar una galería propia de punta a punta, sin simulaciones de red: un servidor HTTP local con una página de
 * imágenes (en la red local, declarado en AGENDA_TRUSTED_HOSTS), el servidor MCP con su cliente web de verdad, ver
 * las miniaturas, seguir un enlace a la página siguiente e importar una imagen elegida.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer as httpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rasterInfo } from '../src/core/assets/image';
import { sourceResources } from '../src/mcp/dev';
import { createServer } from '../src/mcp/server';
import { createCache } from '../src/node/web/cache';
import { makeJpeg } from './helpers/jpeg';

let site: Server;
let origin = '';
let dir = '';
let client: Client;
let hits: string[] = [];
type Part = { type: string; text?: string; data?: string; mimeType?: string };

beforeAll(async () => {
  site = httpServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/galeria') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<title>Mis ilustraciones</title><img src="/img/uno.jpg" alt="Un paisaje"><img src="/img/dos.jpg" alt="Un retrato"><a href="/galeria/2">Página 2</a>');
    else if (req.url === '/galeria/2') res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Página 2</title><img src="/img/tres.jpg" alt="Una ciudad">');
    else if (req.url?.startsWith('/img/')) res.writeHead(200, { 'content-type': 'image/jpeg' }).end(Buffer.from(makeJpeg(req.url.includes('tres') ? 1800 : 900, 1200)));
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  dir = await mkdtemp(join(tmpdir(), 'agenda-gallery-'));
  // El servidor real: su cliente web de verdad y solo ese sitio declarado de confianza.
  const server = createServer({ root: dir, ...sourceResources(), web: { env: { AGENDA_TRUSTED_HOSTS: origin.replace('http://', '') }, cache: createCache({ dir: null }) } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  await client.callTool({ name: 'create_design', arguments: { template: 'minimal', year: 2027, out: 'a.agenda.json' } });
}, 120_000);

afterAll(async () => {
  await client.close();
  site.closeAllConnections();
  await new Promise<void>((resolve) => site.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as { content: Part[]; isError?: boolean };
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  return { isError: res.isError === true, parts: res.content, text, body: (() => { try { return JSON.parse(text) as Record<string, any>; } catch { return {} as Record<string, any>; } })() }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('navegar una galería propia', () => {
  it('ve las imágenes con miniatura, sigue el enlace a la página siguiente y elige una', async () => {
    const first = await call('browse_page', { url: `${origin}/galeria` });
    expect(first.isError, first.text).toBe(false);
    expect(first.body.page.title).toBe('Mis ilustraciones');
    expect(first.body.images.map((i: { url: string }) => i.url)).toEqual([`${origin}/img/uno.jpg`, `${origin}/img/dos.jpg`]);
    // Las miniaturas llegan como imagen, con su número y su descripción.
    const thumbs = first.parts.filter((p) => p.type === 'image');
    expect(thumbs).toHaveLength(2);
    expect(rasterInfo(Uint8Array.from(Buffer.from(thumbs[0]!.data!, 'base64')))).toMatchObject({ width: 320 });
    expect(first.parts.some((p) => p.text?.includes('Un retrato'))).toBe(true);
    // Sigue el enlace de la página siguiente.
    const next = first.body.links[0].url as string;
    expect(next).toBe(`${origin}/galeria/2`);
    const second = await call('browse_page', { url: next });
    expect(second.body.images[0]).toMatchObject({ url: `${origin}/img/tres.jpg`, alt: 'Una ciudad' });
    // Elige la de la página 2 para una portada vertical: propuesta, luego confirmación.
    const args = { url: second.body.images[0].url, path: 'a.agenda.json', sizeMm: { w: 100, h: 150 }, name: 'Ciudad', author: 'Yo', license: 'Propia' };
    const dry = await call('import_image', args);
    expect(dry.isError, dry.text).toBe(false);
    expect(dry.body.proposal.kept).toMatchObject({ w: 800, h: 1200 });
    expect(dry.body.warnings.join(' ')).toMatch(/Aviso de responsabilidad/);
    const done = await call('import_image', { ...args, confirm: true });
    expect(done.isError, done.text).toBe(false);
    const agenda = JSON.parse(await readFile(join(dir, 'a.agenda.json'), 'utf8')) as { assets: Array<{ name: string; path: string; credit: { source: string } }> };
    const mine = agenda.assets.find((x) => x.name === 'Ciudad')!;
    expect(mine).toMatchObject({ credit: { source: 'web' } });
    const saved = new Uint8Array(await readFile(join(dir, mine.path)));
    expect(rasterInfo(saved)!.width / rasterInfo(saved)!.height).toBeCloseTo(100 / 150, 1);
  });

  it('un puerto o un sitio que no declaró no se toca, aunque esté en la misma máquina', async () => {
    hits = [];
    const other = Number(origin.split(':')[2]) + 1;
    expect((await call('browse_page', { url: `http://127.0.0.1:${other}/galeria` })).isError).toBe(true);
    expect((await call('browse_page', { url: 'http://localhost:1/x' })).isError).toBe(true);
    expect(hits).toEqual([]);
  });
});
