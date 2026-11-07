/**
 * Las guías para modelos de lenguaje (castellano e inglés) no se quedan atrás del servidor: nombran
 * cada herramienta, cada receta y cada código de aviso, explican lo que más cuesta adivinar
 * (userFonts, pageKey, assets.kind, /locale) y tienen las mismas secciones.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WARNING_FIXES } from '../src/core/document/fixes';
import { sourceResources } from '../src/mcp/dev';
import { createServer, guideSections } from '../src/mcp/server';
import { ROOT } from './helpers/node-env';

const GUIDES = { es: readFileSync(join(ROOT, 'docs/plantillas-llm.md'), 'utf8'), en: readFileSync(join(ROOT, 'docs/llm-templates.md'), 'utf8') };

let client: Client;
let tools: string[] = [];
let prompts: string[] = [];

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer({ root: ROOT, ...sourceResources() }).connect(a);
  client = new Client({ name: 'prueba', version: '1' });
  await client.connect(b);
  tools = (await client.listTools()).tools.map((t) => t.name);
  prompts = (await client.listPrompts()).prompts.map((p) => p.name);
});

afterAll(() => client.close());

describe.each(Object.entries(GUIDES))('la guía (%s)', (_lang, guide) => {
  it('nombra cada herramienta y cada receta del servidor', () => {
    expect(tools.length).toBeGreaterThan(10);
    for (const name of tools) expect(guide, name).toContain(`\`${name}\``);
    for (const name of prompts) expect(guide, name).toContain(`\`${name}\``);
  });

  it('tiene una fila por cada código de aviso', () => {
    for (const code of Object.keys(WARNING_FIXES)) expect(guide, code).toContain(`\`${code}\``);
  });

  it('explica las fuentes propias, el alcance de un elemento, los tipos de recurso y la traducción', () => {
    for (const words of ['`userFonts`', '"pageKey": null', '"paper": true', '`kind: "vector"`', '`kind: "pdf"`', '/locale', '/holidays/renamed/', '/theme/tokens/fallbacks']) expect(guide, words).toContain(words);
  });
});

it('las dos guías tienen las mismas secciones, en el mismo orden', () => {
  const numbers = (md: string) => guideSections(md).map((s) => s.title.split('.')[0]);
  expect(numbers(GUIDES.es)).toEqual(numbers(GUIDES.en));
  expect(numbers(GUIDES.es)).toHaveLength(13);
});
