/**
 * Agendas escritas por un modelo de lenguaje: el esquema JSON coincide con lo que acepta el
 * programa, la revisión dice qué se ignora o corrige, JSON Patch es seguro, y el servidor MCP
 * funciona de punta a punta sin poder salir de su carpeta de trabajo.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDesign, TEMPLATES } from '../src/core/design/defaults';
import { designCatalogue, designJsonSchema, schemaPart } from '../src/core/design/jsonSchema';
import { parseDesign } from '../src/core/design/schema';
import { parseThemeFile } from '../src/core/design/themeFile';
import { SECTION_MODULES } from '../src/core/sections/registry';
import { applyJsonPatch } from '../src/core/util/jsonPatch';
import { createServer } from '../src/mcp/server';
import { checkDesignData, checkDesignJson } from '../src/node/check';
import { nodeIO } from '../src/node/env';
import { openDocument } from './helpers/node-env';

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('esquema JSON', () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(designJsonSchema());

  it('acepta las agendas que crea el programa y una vacía', () => {
    expect(validate({})).toBe(true);
    for (const t of TEMPLATES) {
      const ok = validate(plain(createDesign(t.id, { year: 2027 })));
      expect(ok, `${t.id}: ${JSON.stringify(validate.errors?.slice(0, 3))}`).toBe(true);
    }
  });

  it('describe todas las secciones de la lista con sus opciones', () => {
    const cat = designCatalogue() as { sections: Array<{ type: string; options: Record<string, unknown> }> };
    const types = cat.sections.map((s) => s.type);
    for (const m of SECTION_MODULES.filter((x) => x.type !== 'filler' && x.type !== 'custom')) expect(types).toContain(m.type);
    const weeks = cat.sections.find((s) => s.type === 'weeks')!;
    expect(weeks.options.variant).toMatchObject({ enum: ['alastair', 'horizontal', 'vertical', 'daily'] });
    expect(cat.sections.find((s) => s.type === 'pageTemplate')!.options.template).toMatchObject({ type: 'string' });
  });

  it('se puede leer por partes, con las referencias resueltas', () => {
    const schema = designJsonSchema();
    const lines = schemaPart(schema, 'theme.tokens.lines') as { properties: Record<string, unknown> };
    expect(Object.keys(lines.properties)).toEqual(['writing', 'separator', 'table', 'frame']);
    expect(schemaPart(schema, '$defs.sectionItem')).toBeTruthy();
    expect(schemaPart(schema, 'type')).toBeUndefined();
    expect(schemaPart(schema, 'nada.de.nada')).toBeUndefined();
  });
});

describe('revisión de un archivo', () => {
  it('una agenda del programa no tiene problemas', () => {
    const r = checkDesignData(plain(createDesign('heritage', { year: 2027 })));
    expect(r.design).not.toBeNull();
    expect(r.issues).toEqual([]);
  });

  it('informa lo que se ignora o corrige, con su ruta', () => {
    const raw = JSON.parse(JSON.stringify(createDesign('heritage', { year: 2027 })));
    raw.calendar.weekstart = 'sunday';
    raw.theme.tokens = { colors: { ink: 'red' } };
    const months = raw.sections.findIndex((s: { type: string }) => s.type === 'months');
    const weeks = raw.sections[months].items.findIndex((s: { type: string }) => s.type === 'weeks');
    raw.sections[months].items[weeks].options.variant = 'alastar';
    const r = checkDesignData(raw);
    expect(r.design).not.toBeNull();
    const at = (p: string) => r.issues.find((i) => i.path === p);
    expect(at('/calendar')?.message).toContain('weekstart');
    expect(at('/theme/tokens/colors/ink')?.severity).toBe('adjusted');
    expect(at(`/sections/${months}/items/${weeks}/options/variant`)?.message).toContain('alastair');
  });

  it('separa lo que impide abrir el archivo', () => {
    const r = checkDesignData({ paper: { preset: 'A7' }, calendar: { weekstart: 1 } });
    expect(r.design).toBeNull();
    expect(r.issues[0]).toMatchObject({ path: '/paper/preset', severity: 'error' });
    expect(r.issues.find((i) => i.path === '/calendar')?.severity).toBe('adjusted');
    expect(checkDesignJson('{"sections": 5').issues[0]?.severity).toBe('error');
  });
});

describe('recursos integrados', () => {
  it('una ruta que sale de la carpeta pública no se acepta ni se lee', async () => {
    for (const builtin of ['../../package.json', '/etc/passwd', '//evil.example/x.svg', 'watermarks/../../x.svg', 'https://x.example/a.png']) {
      const d = parseDesign({ assets: [{ id: 'a', name: 'a', kind: 'vector', mime: 'image/svg+xml', builtin }] });
      expect(d.assets[0]!.builtin, builtin).toBeNull();
    }
    expect(parseDesign({ assets: [{ id: 'a', name: 'a', kind: 'vector', mime: 'image/svg+xml', builtin: 'watermarks/colibri.svg' }] }).assets[0]!.builtin).toBe('watermarks/colibri.svg');
    await expect(nodeIO.read('../package.json')).rejects.toThrow(/fuera/);
    await expect(nodeIO.read('watermarks/colibri.svg')).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('valores de un archivo ajeno', () => {
  it('las cajas de los elementos y las cantidades de las secciones quedan dentro de su rango', async () => {
    const raw = JSON.parse(JSON.stringify(createDesign('minimal', { year: 2027 })));
    raw.customBlocks = [{ id: 'enorme', pageType: 'notes', kind: 'lines', x: -1e9, y: 0, w: 1e12, h: 1e12, props: { pitch: 0.0001 } }];
    raw.sections.push({ id: 'muchas', type: 'notes', options: { count: 1e9, style: 'lines' } });
    const d = parseDesign(raw);
    expect(d.customBlocks[0]).toMatchObject({ x: -1000, w: 1000, h: 1000 });
    const { doc } = await openDocument(d);
    expect(doc.plan.pages.filter((p) => p.section === 'muchas').length).toBeLessThanOrEqual(200);
    const notes = doc.plan.pages.find((p) => p.type === 'notes')!;
    const lines = doc.page(notes.index).blocks.find((b) => b.id === 'custom.enorme')!;
    // Con el paso mínimo (3 mm), 1000 mm dan unos 333 renglones, no miles de millones.
    expect(JSON.stringify(lines.prims).length).toBeLessThan(400_000);
  });
});

describe('plantilla para regalar', () => {
  it('no trae fechas personales y habla el idioma de la agenda', () => {
    for (const locale of ['es-AR', 'es-ES', 'en-US', 'pt-BR', 'it-IT']) {
      const d = createDesign('heritage-norma', { year: 2027, locale, name: 'Ana' });
      expect(JSON.stringify(d.persona)).not.toMatch(/octubre|cumplea/i);
      expect(d.personalDates).toEqual([]);
      expect(d.persona.labels).toEqual({});
    }
    expect(createDesign('heritage-norma', { locale: 'en-US' }).persona.dedicationTitle).toContain('bloom');
    // Las frases de estaciones son del hemisferio sur y en castellano; en el resto, las del idioma.
    expect(createDesign('heritage-norma', { locale: 'es-AR' }).persona.phrases).toHaveLength(12);
    expect(createDesign('heritage-norma', { locale: 'es-ES' }).persona.phrases).toEqual([]);
  });

  it('el nombre de la agenda sale en su idioma y el de la persona llega en toda plantilla', () => {
    expect(createDesign('clara', { year: 2027, locale: 'pt-BR' }).name).toBe('Agenda 2027 · Leitura clara');
    expect(createDesign('heritage-norma', { year: 2027, locale: 'en-US', name: 'Ana' }).name).toBe('Ana’s planner 2027');
    for (const t of TEMPLATES) expect(createDesign(t.id, { name: ' Ana ' }).persona.name).toBe('Ana');
  });
});

describe('JSON Patch', () => {
  const doc = { a: { b: [1, 2, 3] }, c: 'x' };

  it('aplica las operaciones sobre una copia', () => {
    const out = applyJsonPatch(doc, [
      { op: 'add', path: '/a/b/-', value: 4 },
      { op: 'add', path: '/a/b/0', value: 0 },
      { op: 'replace', path: '/c', value: 'y' },
      { op: 'remove', path: '/a/b/2' },
      { op: 'copy', from: '/c', path: '/d' },
      { op: 'move', from: '/d', path: '/a/e' },
      { op: 'test', path: '/a/e', value: 'y' },
      { op: 'add', path: '/f~1g', value: true },
    ]);
    expect(out).toEqual({ a: { b: [0, 1, 3, 4], e: 'y' }, c: 'y', 'f/g': true });
    expect(doc).toEqual({ a: { b: [1, 2, 3] }, c: 'x' });
  });

  it('es todo o nada, y dice qué operación falló', () => {
    expect(() => applyJsonPatch(doc, [{ op: 'replace', path: '/c', value: 1 }, { op: 'remove', path: '/nada' }])).toThrow(/Operación 2/);
    expect(() => applyJsonPatch(doc, [{ op: 'test', path: '/c', value: 'z' }])).toThrow(/esperado/);
    expect(() => applyJsonPatch(doc, [{ op: 'add', path: '/a/b/9', value: 1 }])).toThrow();
    expect(() => applyJsonPatch(doc, [{ op: 'move', from: '/a', path: '/a/x' }])).toThrow();
  });

  it('no deja tocar el prototipo de los objetos', () => {
    for (const path of ['/__proto__/polluted', '/a/constructor/prototype/polluted', '/prototype']) expect(() => applyJsonPatch(doc, [{ op: 'add', path, value: 1 }])).toThrow(/no permitida/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('servidor MCP', () => {
  let dir: string;
  let outside: string;
  let client: Client;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'agenda-mcp-'));
    outside = await mkdtemp(join(tmpdir(), 'agenda-fuera-'));
    await writeFile(join(outside, 'secreto.agenda.json'), '{"name":"secreto"}');
    await symlink(join(outside, 'secreto.agenda.json'), join(dir, 'enlace.agenda.json'));
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ root: dir }).connect(a);
    client = new Client({ name: 'prueba', version: '1.0.0' });
    await client.connect(b);
  });

  afterAll(async () => {
    await client.close();
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  type Result = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean };
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as Result;
  // JSON.parse da un valor sin tipo: las pruebas leen campos de respuestas variadas.
  const json = (r: Result) => JSON.parse(r.content.find((c) => c.type === 'text')!.text!);

  it('lista sus herramientas y recursos', async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['list_catalogue', 'get_schema', 'create_design', 'update_design', 'check_design', 'list_pages', 'render_page', 'export_pdf', 'export_theme']));
    const resources = (await client.listResources()).resources.map((r) => r.uri);
    expect(resources).toEqual(expect.arrayContaining(['agenda://guide', 'agenda://guide/es', 'agenda://schema', 'agenda://catalogue']));
    const guide = await client.readResource({ uri: 'agenda://guide' });
    expect(String((guide.contents[0] as { text: string }).text)).toContain('update_design');
  });

  it('crea, cambia, revisa, muestra y exporta una agenda', async () => {
    const created = await call('create_design', { template: 'heritage', year: 2027, locale: 'en-US', out: 'ada.agenda.json' });
    expect(created.isError).toBeFalsy();
    expect(json(created).summary.pages.total).toBeGreaterThan(100);

    const again = await call('create_design', { template: 'heritage', out: 'ada.agenda.json' });
    expect(again.isError).toBe(true);

    const updated = await call('update_design', {
      path: 'ada.agenda.json',
      patch: [
        { op: 'replace', path: '/calendar/weekStart', value: 'sunday' },
        { op: 'add', path: '/theme/tokens', value: { colors: { ink: 'rojo' } } },
      ],
    });
    expect(json(updated)).toMatchObject({ written: true, issues: [{ path: '/theme/tokens/colors/ink', severity: 'adjusted' }] });
    const saved = JSON.parse(await readFile(join(dir, 'ada.agenda.json'), 'utf8'));
    expect(saved.calendar.weekStart).toBe('sunday');

    const broken = await call('update_design', { path: 'ada.agenda.json', patch: [{ op: 'replace', path: '/paper/preset', value: 'A7' }] });
    expect(broken.isError).toBe(true);
    expect(JSON.parse(await readFile(join(dir, 'ada.agenda.json'), 'utf8')).paper.preset).toBe(saved.paper.preset);

    const pages = json(await call('list_pages', { path: 'ada.agenda.json', type: 'weekLeft', limit: 2 }));
    expect(pages.pages).toHaveLength(2);
    const page = pages.pages[0].page as number;

    const shown = await call('render_page', { path: 'ada.agenda.json', page, width: 300 });
    const image = shown.content.find((c) => c.type === 'image');
    expect(image?.mimeType).toBe('image/png');
    expect(Buffer.from(image!.data!, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(json(shown).blocks.length).toBeGreaterThan(3);

    const pdf = await call('export_pdf', { path: 'ada.agenda.json', mode: 'calibration', out: 'salida/calibracion.pdf' });
    expect(pdf.isError).toBeFalsy();
    expect((await readFile(join(dir, 'salida/calibracion.pdf'))).subarray(0, 5).toString()).toBe('%PDF-');

    const theme = await call('export_theme', { path: 'ada.agenda.json', name: 'Tinta azul', out: 'azul.tema.json' });
    expect(theme.isError).toBeFalsy();
    expect(parseThemeFile(JSON.parse(await readFile(join(dir, 'azul.tema.json'), 'utf8'))).name).toBe('Tinta azul');
  });

  it('acepta la agenda escrita en el pedido', async () => {
    const r = json(await call('check_design', { design: { calendar: { year: 2028, startMonth: 3, monthCount: 6 } } }));
    expect(r.summary).toMatchObject({ year: 2028, startMonth: 3, monthCount: 6 });
  });

  it('no sale de su carpeta ni escribe otros tipos de archivo', async () => {
    for (const path of ['../fuera.agenda.json', join(outside, 'secreto.agenda.json'), 'enlace.agenda.json']) {
      const r = await call('check_design', { path });
      expect(r.isError, path).toBe(true);
    }
    expect((await call('check_design', { path: 'package.json' })).isError).toBe(true);
    expect((await call('create_design', { template: 'heritage', out: 'package.json' })).isError).toBe(true);
    expect((await call('export_pdf', { design: {}, mode: 'cover', out: 'tapa.txt' })).isError).toBe(true);
    expect((await call('export_pdf', { design: {}, mode: 'cover', out: '../tapa.pdf' })).isError).toBe(true);
  });

  it('no muestra el contenido de un archivo que no es JSON', async () => {
    await writeFile(join(dir, 'notas.json'), 'CLAVE=secreta123');
    const r = await call('check_design', { path: 'notas.json' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).not.toContain('secreta');
  });
});
