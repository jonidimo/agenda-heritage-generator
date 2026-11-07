/**
 * Los seis idiomas de la agenda impresa: las mismas claves y variables que el castellano, todos los
 * métodos traducidos, y cada plantilla sale sin avisos de maquetación (el alemán es largo: los
 * rótulos tienen que entrar en sus cajas).
 */
import { describe, expect, it } from 'vitest';
import { createDesign, TEMPLATES, type TemplateId } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { LANGUAGES, localeFor, resolveStrings } from '../src/core/i18n';
import { METHODS, methodText } from '../src/core/methods/catalog';
import { openDocument } from './helpers/node-env';
import { isProblem } from '../src/core/layout/prims';

/** La forma de una tabla de textos: claves, largo de las listas y las variables `{x}` de cada texto. */
function shape(v: unknown): unknown {
  if (typeof v === 'string') return [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

describe('idiomas de la agenda', () => {
  const base = shape(resolveStrings('es'));
  for (const lang of LANGUAGES) {
    it(`${lang}: las mismas claves, listas y variables que el castellano`, () => {
      expect(shape(resolveStrings(lang))).toEqual(base);
    });

    it(`${lang}: cada método tiene nombre y texto`, () => {
      for (const m of METHODS) {
        const t = methodText(m, lang);
        expect(t.name.trim(), `${m.id}`).not.toBe('');
        expect(t.text.trim(), `${m.id}`).not.toBe('');
        if (lang !== 'es') expect(t.text, `${m.id} cae en castellano`).not.toBe(m.t.es.text);
      }
    });
  }

  // Las plantillas con calendario, en los idiomas nuevos y con sus países: ningún texto se sale de su lugar.
  const dated = TEMPLATES.filter((t) => !t.undated).map((t) => t.id as TemplateId);
  for (const [lang, country] of [
    ['de', 'DE'],
    ['de', 'CH'],
    ['fr', 'FR'],
    ['fr', 'CA'],
  ] as const) {
    it(`${lang}-${country}: todas las plantillas se arman sin avisos`, async () => {
      for (const template of dated) {
        const d = parseDesign(createDesign(template, { year: 2027, locale: localeFor(lang, country), country }));
        const { doc } = await openDocument(d);
        const problems: string[] = [];
        for (let i = 0; i < doc.pageCount; i++) for (const w of doc.pageWarnings(i)) if (isProblem(w)) problems.push(`${template} p${i + 1} ${w.code}: ${w.message}`);
        expect(problems.slice(0, 10), template).toEqual([]);
      }
    }, 300_000);
  }
});
