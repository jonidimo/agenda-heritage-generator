import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceResources } from '../src/mcp/dev';
import { createServer } from '../src/mcp/server';
import { createCache } from '../src/node/web/cache';
import { makeJpeg } from './helpers/jpeg';
import { fakeWeb } from './helpers/web';

type Part = { type: string; text?: string };
let dir = '';
let reads = '';
let client: Client;
let close: () => Promise<void>;

async function start(env: Record<string, string>): Promise<void> {
  const web = fakeWeb([]);
  const server = createServer({ root: dir, ...sourceResources(), web: { http: web.http, env, cache: createCache({ dir: null }) } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  close = async () => {
    await client.close();
    await server.close();
  };
}

const run = async (name: string, args: Record<string, unknown>) => {
  const res = (await client.callTool({ name, arguments: args })) as { content: Part[]; isError?: boolean };
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  return { isError: res.isError === true, text, parts: res.content };
};

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'mcp-reads-'));
  dir = join(base, 'trabajo');
  reads = join(base, 'Descargas');
  await mkdir(dir);
  await mkdir(reads);
  await writeFile(join(dir, 'a.jpg'), makeJpeg(400, 300));
  await writeFile(join(reads, 'jjk.jpg'), makeJpeg(900, 600));
  await writeFile(join(base, 'privada.jpg'), makeJpeg(100, 100));
});
afterEach(async () => {
  await close();
  await rm(join(dir, '..'), { recursive: true, force: true });
});

describe('carpetas de lectura del servidor MCP (AGENDA_MCP_READ_DIRS)', () => {
  it('list_images ve la carpeta de trabajo y las de lectura, con miniaturas', async () => {
    await start({ AGENDA_MCP_READ_DIRS: reads });
    const r = await run('list_images', {});
    expect(r.isError).toBe(false);
    const body = JSON.parse(r.text) as { folders: Array<{ images: Array<{ path: string }> }> };
    expect(body.folders.flatMap((f) => f.images.map((i) => i.path))).toEqual(['a.jpg', join(reads, 'jjk.jpg')]);
    expect(r.parts.filter((p) => p.type === 'image')).toHaveLength(2);
  });

  it('import_image acepta una ruta absoluta solo de una carpeta de lectura', async () => {
    await start({ AGENDA_MCP_READ_DIRS: reads });
    const ok = await run('import_image', { image: join(reads, 'jjk.jpg') });
    expect(ok.isError).toBe(false);
    expect(ok.text).toContain('proposal');
    const no = await run('import_image', { image: join(reads, '..', 'privada.jpg') });
    expect(no.isError).toBe(true);
    expect(no.text).toContain('AGENDA_MCP_READ_DIRS');
  });

  it('sin la variable, lo de afuera no se lee; ni por un enlace, ni pidiendo una carpeta que no está declarada', async () => {
    await start({});
    expect((await run('import_image', { image: join(reads, 'jjk.jpg') })).isError).toBe(true);
    const asked = await run('list_images', { folder: reads });
    expect(asked.isError).toBe(true);
    await symlink(reads, join(dir, 'enlace'));
    const viaLink = await run('list_images', { folder: 'enlace' });
    expect(JSON.parse(viaLink.text).folders).toEqual([]);
  });
});
