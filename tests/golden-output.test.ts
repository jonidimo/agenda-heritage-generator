/**
 * Salida dorada: el dibujo de las páginas de agendas de referencia no cambia mientras no se use
 * nada nuevo. Todo campo agregado al diseño tiene un valor por defecto que reproduce lo anterior;
 * esta prueba lo comprueba con huellas del SVG de cada página (todas las de la primera agenda, una de
 * cada cuatro en las demás). Si un cambio de aspecto es intencional, se regenera con
 * `UPDATE_GOLDEN=1 npx vitest run tests/golden-output.test.ts` y se revisa el diff a ojo.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign, type TemplateId } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { pageToSvg } from '../src/core/render/svg';
import { openDocument, ROOT } from './helpers/node-env';

interface Case {
  name: string;
  template: TemplateId;
  opts: Parameters<typeof createDesign>[1];
  patch?: (d: Design) => void;
  /** Una de cada `every` páginas. */
  every: number;
}

const CASES: Case[] = [
  { name: 'norma-es', template: 'heritage-norma', opts: { year: 2027, locale: 'es-AR', country: 'AR' }, every: 1 },
  { name: 'heritage-en-letter', template: 'heritage', opts: { year: 2027, locale: 'en-US', country: 'US' }, patch: (d) => void (d.paper.preset = 'LETTER'), every: 4 },
  { name: 'clara-pt-wide', template: 'clara', opts: { year: 2027, locale: 'pt-BR', country: 'BR' }, patch: (d) => void (d.theme.comfort = 'wide'), every: 4 },
  { name: 'minimal-it-legal', template: 'minimal', opts: { year: 2027, locale: 'it-IT', country: 'IT' }, patch: (d) => void (d.paper.preset = 'LEGAL'), every: 4 },
  {
    name: 'norma-compact-dots',
    template: 'heritage-norma',
    opts: { year: 2027, locale: 'es-MX', country: 'MX' },
    patch: (d) => {
      d.theme.comfort = 'compact';
      d.theme.tokens = { writing: { style: 'dots' } };
    },
    every: 4,
  },
  {
    name: 'norma-single-thumb',
    template: 'heritage-norma',
    opts: { year: 2027, locale: 'es-ES', country: 'ES' },
    patch: (d) => {
      d.binding.method = 'single';
      d.binding.thumbIndex.enabled = true;
      d.binding.pageNumbers.enabled = true;
    },
    every: 4,
  },
];

const FIXTURE = join(ROOT, 'tests/fixtures/golden-pages.json');
const update = process.env.UPDATE_GOLDEN === '1';
const stored: Record<string, Record<string, string>> = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Record<string, string>>) : {};
const fresh: Record<string, Record<string, string>> = {};

describe('salida dorada', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const d = parseDesign(createDesign(c.template, c.opts));
      c.patch?.(d);
      const { doc } = await openDocument(parseDesign(d));
      const hashes: Record<string, string> = {};
      for (let i = 0; i < doc.pageCount; i += c.every) {
        const svg = pageToSvg(doc.page(i), { fonts: doc.ctx.fonts }, { background: '#fff' });
        hashes[String(i)] = createHash('sha1').update(svg).digest('hex').slice(0, 12);
      }
      fresh[c.name] = hashes;
      if (update) return;
      const want = stored[c.name];
      expect(want, `falta la huella de ${c.name}: corré UPDATE_GOLDEN=1`).toBeDefined();
      const changed = Object.keys(hashes).filter((k) => want![k] !== hashes[k]);
      expect(changed, `páginas distintas (índices desde 0) en ${c.name}`).toEqual([]);
      expect(Object.keys(hashes).length).toBe(Object.keys(want!).length);
    }, 180_000);
  }

  it('actualiza las huellas cuando se pide', () => {
    if (update) writeFileSync(FIXTURE, `${JSON.stringify(fresh)}\n`);
    expect(true).toBe(true);
  });
});
