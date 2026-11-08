/**
 * Los parámetros del servidor MCP dicen lo mismo con las mismas palabras: `path` es siempre el archivo
 * que se lee y `out` el que se escribe; ningún otro nombre para un archivo de entrada o de salida.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sourceResources } from '../src/mcp/dev';
import { createServer } from '../src/mcp/server';

let dir = '';
let client: Client;
const FILE_WORDS = ['file', 'filename', 'input', 'output', 'dest', 'destination', 'target', 'source', 'src', 'from', 'to', 'save', 'saveAs', 'outFile', 'outPath'];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-params-'));
  const server = createServer({ root: dir, ...sourceResources() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
});
afterAll(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});

const call = async (name: string, args: Record<string, unknown>) => {
  const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  return { isError: res.isError === true, text };
};

describe('nombres de los parámetros', () => {
  it('son 20 herramientas; «path» siempre se lee, «out» siempre se escribe, y no hay otros nombres de archivo (salvo «font», la fuente que lee add_font)', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(20);
    // El único otro archivo de entrada es la fuente de add_font, y se llama así.
    const withFont = tools.filter((t) => Object.hasOwn((t.inputSchema.properties ?? {}) as object, 'font'));
    expect(withFont.map((t) => t.name)).toEqual(['add_font']);
    expect(((withFont[0]!.inputSchema.properties as Record<string, { description?: string }>).font!.description ?? '')).toMatch(/fuente/);
    for (const tool of tools) {
      const props = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const name of Object.keys(props)) expect(FILE_WORDS, `${tool.name}.${name}`).not.toContain(name);
      if (props.path) expect(props.path.description, `${tool.name}.path`).toMatch(/se lee/);
      if (props.out) expect(props.out.description, `${tool.name}.out`).toMatch(/se escribe/);
    }
  });

  it('export_pdf toma el tipo en «kind», acepta «mode» como antes, y pide uno', async () => {
    await call('create_design', { template: 'minimal', year: 2027, out: 'a.agenda.json' });
    const byKind = await call('export_pdf', { path: 'a.agenda.json', kind: 'calibration', out: 'k.pdf' });
    expect(byKind.isError, byKind.text).toBe(false);
    expect((await call('export_pdf', { path: 'a.agenda.json', mode: 'calibration', out: 'm.pdf' })).isError).toBe(false);
    expect((await call('export_pdf', { path: 'a.agenda.json', kind: 'cover', mode: 'pages', out: 'x.pdf' })).text).toMatch(/kind/);
    expect((await call('export_pdf', { path: 'a.agenda.json', out: 'x.pdf' })).isError).toBe(true);
  });

  it('export_pdf acepta la resolución de las imágenes (original, 300 o 150), la informa, y rechaza otra', async () => {
    await call('create_design', { template: 'minimal', year: 2027, out: 'dpi.agenda.json' });
    const dflt = JSON.parse((await call('export_pdf', { path: 'dpi.agenda.json', kind: 'calibration', out: 'dpi-a.pdf' })).text) as { imageDpi: number | string };
    expect(dflt.imageDpi).toBe(300);
    for (const imageDpi of ['original', 300, 150]) {
      const res = await call('export_pdf', { path: 'dpi.agenda.json', kind: 'calibration', imageDpi, out: 'dpi-b.pdf' });
      expect(res.isError, res.text).toBe(false);
      expect((JSON.parse(res.text) as { imageDpi: unknown }).imageDpi).toBe(imageDpi);
    }
    // Los números como texto también valen.
    const asText = await call('export_pdf', { path: 'dpi.agenda.json', kind: 'calibration', imageDpi: '150', out: 'dpi-d.pdf' });
    expect((JSON.parse(asText.text) as { imageDpi: unknown }).imageDpi).toBe(150);
    expect((await call('export_pdf', { path: 'dpi.agenda.json', kind: 'calibration', imageDpi: 200, out: 'dpi-c.pdf' })).isError).toBe(true);
  });

  it('update_design con «out» escribe el resultado en otro archivo y deja el original', async () => {
    await call('create_design', { template: 'minimal', year: 2027, out: 'b.agenda.json' });
    const patch = [{ op: 'replace', path: '/persona/name', value: 'Otra' }];
    const res = await call('update_design', { path: 'b.agenda.json', out: 'copia/b2.agenda.json', patch });
    expect(res.isError, res.text).toBe(false);
    expect(JSON.parse(res.text).path).toBe(join('copia', 'b2.agenda.json'));
    expect(JSON.parse(await readFile(join(dir, 'copia', 'b2.agenda.json'), 'utf8')).persona.name).toBe('Otra');
    expect(JSON.parse(await readFile(join(dir, 'b.agenda.json'), 'utf8')).persona.name).not.toBe('Otra');
    // Un «out» que ya existe no se pisa sin «overwrite».
    expect((await call('update_design', { path: 'b.agenda.json', out: 'copia/b2.agenda.json', patch })).isError).toBe(true);
    expect((await call('update_design', { path: 'b.agenda.json', out: 'copia/b2.agenda.json', overwrite: true, patch })).isError).toBe(false);
    expect((await call('update_design', { app: true, out: 'c.agenda.json', patch })).text).toMatch(/«out» va con «path»/);
  });
});
