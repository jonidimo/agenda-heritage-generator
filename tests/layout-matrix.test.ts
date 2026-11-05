/**
 * Ninguna página de ninguna plantilla, idioma, papel o comodidad debe salir de su
 * lugar: la verificación previa (texto que no entra, textos que se pisan, contenido
 * fuera de la página o en la zona que la impresora no imprime) tiene que quedar vacía.
 */
import { describe, expect, it } from 'vitest';
import { createDesign, type TemplateId } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { openDocument } from './helpers/node-env';

type Paper = Design['paper']['preset'];

const CASES: Array<{ template: TemplateId; locale: string; country: string }> = [
  { template: 'heritage-norma', locale: 'es-AR', country: 'AR' },
  { template: 'heritage', locale: 'en-US', country: 'US' },
  { template: 'heritage', locale: 'en-GB', country: 'GB' },
  { template: 'clara', locale: 'pt-BR', country: 'BR' },
  { template: 'minimal', locale: 'it-IT', country: 'IT' },
  { template: 'heritage', locale: 'es-MX', country: 'MX' },
  { template: 'heritage', locale: 'es-ES', country: 'ES' },
];
const PAPERS: Paper[] = ['A4', 'LEGAL', 'LETTER'];

function design(template: TemplateId, locale: string, country: string, patch: (d: Design) => void = () => {}): Design {
  const d = parseDesign(createDesign(template, { year: 2027, locale, country }));
  patch(d);
  return parseDesign(d);
}

async function warningsOf(d: Design): Promise<string[]> {
  const { doc } = await openDocument(d);
  const grouped = new Map<string, number[]>();
  // «abbreviated» es informativo (un feriado largo se abrevió con «…» y se puede renombrar): no es un error de diagramación.
  for (const w of doc.warnings()) if (w.code !== 'abbreviated') grouped.set(w.message, [...(grouped.get(w.message) ?? []), w.page + 1]);
  return [...grouped].map(([m, pages]) => `${m} (págs. ${pages.slice(0, 6).join(', ')}${pages.length > 6 ? '…' : ''})`);
}

describe('sin avisos en todas las combinaciones', () => {
  for (const c of CASES) {
    for (const paper of PAPERS) {
      it(`${c.template} · ${c.locale} · ${paper}`, async () => {
        const d = design(c.template, c.locale, c.country, (x) => void (x.paper.preset = paper));
        expect(await warningsOf(d)).toEqual([]);
      });
    }
  }

  // Para leer en pantalla (sin costura ni zona no imprimible) tampoco debe quedar nada fuera de lugar.
  for (const c of CASES) {
    it(`pantalla · ${c.template} · ${c.locale}`, async () => {
      const d = design(c.template, c.locale, c.country, (x) => void (x.binding.target = 'screen'));
      expect(await warningsOf(d)).toEqual([]);
    });
  }

  for (const comfort of ['compact', 'normal', 'wide'] as const) {
    for (const lang of ['es-AR', 'pt-BR'] as const) {
      it(`comodidad ${comfort} · ${lang}`, async () => {
        const d = design('heritage', lang, lang.slice(3), (x) => void (x.theme.comfort = comfort));
        expect(await warningsOf(d)).toEqual([]);
      });
    }
  }

  for (const variant of ['vertical', 'horizontal', 'daily'] as const) {
    it(`semana ${variant}`, async () => {
      const d = design('heritage', 'es-AR', 'AR', (x) => {
        for (const s of x.sections) for (const it of s.items ?? []) if (it.type === 'weeks') it.options.variant = variant;
      });
      expect(await warningsOf(d)).toEqual([]);
    });
  }

  for (const lang of ['es-AR', 'en-US', 'pt-BR', 'it-IT'] as const) {
    it(`todas las secciones activas · ${lang}`, async () => {
      const d = design('heritage', lang, lang.slice(3), (x) => {
        for (const s of x.sections) s.enabled = true;
        for (const s of x.sections) for (const it of s.items ?? []) it.enabled = true;
      });
      expect(await warningsOf(d)).toEqual([]);
    });
  }
});
