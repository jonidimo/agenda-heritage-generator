/**
 * Reutilización entre documentos: cambiar un color, mover un elemento o renombrar la agenda no
 * debe volver a calcular el calendario, el plan de páginas ni las páginas que no cambiaron, y lo que
 * se reutiliza tiene que dar EXACTAMENTE lo mismo que construir todo de nuevo (por eso la batería de
 * cambios compara cada página con y sin reutilización).
 */
import { produce, type Draft } from 'immer';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { resolveThemeFor } from '../src/core/design/themes';
import { AgendaDocument } from '../src/core/document';
import { pageToSvg } from '../src/core/render/svg';
import { openDocument } from './helpers/node-env';

/** Un documento chico (tres meses) para que la batería sea rápida. */
function baseDesign(): Design {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  d.calendar.monthCount = 3;
  return parseDesign(d);
}

/**
 * Un cambio como lo hace el editor: con immer, de modo que lo que no se toca sigue siendo el mismo
 * objeto (es lo que permite reutilizar). Un diseño armado de cero no comparte nada y no reutilizaría.
 */
function derive(from: Design, change: (d: Draft<Design>) => void): Design {
  return produce(from, change);
}

/** Lo que se ve de una página (el mismo dibujo que sale al PDF y a la pantalla), sus avisos y sus bloques. */
function fingerprint(doc: AgendaDocument, index: number): string {
  const page = doc.page(index);
  const svg = pageToSvg(page, { fonts: doc.ctx.fonts, assetHref: () => undefined });
  return JSON.stringify({ svg, warnings: doc.pageWarnings(index), blocks: page.blocks.map((b) => [b.id, b.bbox, b.m ?? null, b.opacity ?? null]) });
}

function fingerprints(doc: AgendaDocument): string[] {
  return Array.from({ length: doc.pageCount }, (_, i) => fingerprint(doc, i));
}

interface Setup {
  base: AgendaDocument;
  /** El documento de un diseño derivado del base, con y sin reutilización. */
  build(change: (d: Draft<Design>) => void): { reused: AgendaDocument; fresh: AgendaDocument; next: Design };
}

async function setup(): Promise<Setup> {
  const { doc: base } = await openDocument(baseDesign());
  // Se maquetan todas las páginas del documento anterior: lo que se hereda es lo ya maquetado.
  for (let i = 0; i < base.pageCount; i++) base.page(i);
  return {
    base,
    build: (change) => {
      const next = derive(base.design, change);
      return { next, reused: new AgendaDocument(next, base.resources, {}, { reuse: base }), fresh: new AgendaDocument(next, base.resources) };
    },
  };
}

/** Una página de cada tipo que importa, para atar elementos y ajustes. */
function pageOf(doc: AgendaDocument, type: string): { key: string; type: string; index: number } {
  const p = doc.plan.pages.find((x) => x.type === type);
  if (!p) throw new Error(`La agenda de prueba no tiene páginas de tipo ${type}`);
  return p;
}

describe('lo reutilizado es idéntico a lo calculado de nuevo', () => {
  const CHANGES: Array<[string, (d: Draft<Design>, base: AgendaDocument) => void]> = [
    ['un color del tema', (d) => void (d.theme.tokens = { colors: { ink: '#223355' } })],
    ['la comodidad', (d) => void (d.theme.comfort = 'wide')],
    ['el estilo de escritura del tema', (d) => void (d.theme.tokens = { writing: { style: 'dots' } })],
    ['el idioma', (d) => void (d.locale = 'es-MX')],
    ['el año', (d) => void (d.calendar.year = 2028)],
    ['la cantidad de meses', (d) => void (d.calendar.monthCount = 4)],
    ['el comienzo de la semana', (d) => void (d.calendar.weekStart = 'sunday')],
    ['un feriado agregado', (d) => void d.holidays.added.push({ date: '2027-03-03', name: 'Fiesta propia', type: 'public' })],
    ['las fases de la luna', (d) => void (d.astronomy.moonPhases = !d.astronomy.moonPhases)],
    ['una fecha propia', (d) => void d.personalDates.push({ id: 'pd1', month: 2, day: 2, year: null, label: 'Cumple', kind: 'birthday' })],
    ['el papel', (d) => void (d.paper.preset = 'LETTER')],
    ['la costura', (d) => void (d.binding.gutter = 9)],
    ['el método de encuadernado', (d) => void (d.binding.method = 'saddle')],
    ['la zona no imprimible', (d) => void (d.binding.nonPrintable = 8)],
    ['los números de página', (d) => void (d.binding.pageNumbers.enabled = true)],
    ['el relleno de pliegos', (d) => void (d.binding.fillWith = 'lines')],
    ['el nombre de la persona', (d) => void (d.persona.name = 'Otra Persona')],
    ['la dedicatoria', (d) => void (d.persona.dedication = '')],
    ['un rótulo cambiado', (d) => void (d.persona.labels['titlePage.kicker'] = 'MI AGENDA')],
    ['los métodos', (d) => void (d.methods.enabled = d.methods.enabled.slice(1))],
    ['una sección apagada', (d) => void (d.sections[d.sections.length - 1]!.enabled = false)],
    ['las opciones de una sección', (d) => void (d.sections.find((s) => s.type === 'vision')!.options.perPage = 4)],
    ['el destino de los números de página', (d) => void (d.links.pageNumber = 'month')],
    ['los enlaces de los días', (d) => void (d.links.days = false)],
    ['la tapa', (d) => void (d.cover.style = 'plain')],
    ['solo el nombre y la fecha de guardado', (d) => void ((d.name = 'Renombrada'), (d.updatedAt = '2030-01-01T00:00:00.000Z'))],
    [
      'un elemento propio nuevo',
      (d, base) => {
        const p = pageOf(base, 'weekRight');
        d.customBlocks.push({ id: 'nuevo', pageType: p.type, pageKey: p.key, kind: 'text', x: 20, y: 20, w: 50, h: 10, mirror: true, props: { text: 'Hola {name}' } });
      },
    ],
    [
      'un elemento propio en toda una clase de página',
      (d, base) => {
        const p = pageOf(base, 'weekLeft');
        d.customBlocks.push({ id: 'clase', pageType: p.type, pageKey: null, kind: 'rect', x: 10, y: 10, w: 30, h: 8, mirror: true, props: {} });
      },
    ],
    [
      'una marca de agua',
      (d, base) => {
        const p = pageOf(base, 'weekRight');
        for (const wm of d.watermarks) wm.excludePages.push(p.key);
      },
    ],
    [
      'un ajuste de elemento por clase',
      (d, base) => {
        const p = pageOf(base, 'weekRight');
        d.overrides.push({ pageType: p.type, pageKey: null, blockId: 'header.title', dx: 4, dy: 2, dw: 0, dh: 0, scale: 1, rotation: 0, opacity: 1, hidden: false });
      },
    ],
    [
      'un ajuste de elemento en una página',
      (d, base) => {
        const p = pageOf(base, 'weekRight');
        d.overrides.push({ pageType: p.type, pageKey: p.key, blockId: 'header.title', dx: 0, dy: 0, dw: 0, dh: 0, scale: 1, rotation: 0, opacity: 1, hidden: true });
      },
    ],
    [
      'el estilo de escritura de una clase de página',
      (d, base) => {
        const p = pageOf(base, 'weekRight');
        d.pageStyles.push({ pageType: p.type, pageKey: null, tokens: { writing: { style: 'grid' } } });
      },
    ],
  ];

  for (const [name, change] of CHANGES) {
    it(`cambia ${name}`, async () => {
      const { base, build } = await setup();
      const { reused, fresh } = build((d) => change(d, base));
      expect(reused.plan.pages.map((p) => [p.key, p.type, p.side, p.index, p.title, p.group])).toEqual(fresh.plan.pages.map((p) => [p.key, p.type, p.side, p.index, p.title, p.group]));
      expect(reused.plan.signatures).toEqual(fresh.plan.signatures);
      expect(fingerprints(reused)).toEqual(fingerprints(fresh));
    });
  }
});

describe('qué se reutiliza', () => {
  it('un color nuevo reutiliza el calendario, los textos y el plan, y vuelve a maquetar las páginas', async () => {
    const { base, build } = await setup();
    const { reused } = build((d) => void (d.theme.tokens = { colors: { ink: '#223355' } }));
    expect(reused.ctx.cal).toBe(base.ctx.cal);
    expect(reused.ctx.strings).toBe(base.ctx.strings);
    expect(reused.ctx.seasons).toBe(base.ctx.seasons);
    expect(reused.plan).toBe(base.plan);
    expect(reused.ctx.theme).not.toBe(base.ctx.theme);
    for (let i = 0; i < reused.pageCount; i++) reused.page(i);
    expect(reused.stats).toEqual({ layouts: reused.pageCount, reusedPages: 0 });
  });

  it('mover un elemento de una página maqueta solo esa página', async () => {
    const { base, build } = await setup();
    const p = pageOf(base, 'weekRight');
    const { reused } = build((d) => void d.customBlocks.push({ id: 'uno', pageType: p.type, pageKey: p.key, kind: 'rect', x: 10, y: 10, w: 20, h: 5, mirror: true, props: {} }));
    for (let i = 0; i < reused.pageCount; i++) reused.page(i);
    expect(reused.stats).toEqual({ layouts: 1, reusedPages: reused.pageCount - 1 });
    for (let i = 0; i < reused.pageCount; i++) if (i !== p.index) expect(reused.page(i)).toBe(base.page(i));
  });

  it('un ajuste «por clase» maqueta solo las páginas de esa clase', async () => {
    const { base, build } = await setup();
    const type = pageOf(base, 'weekRight').type;
    const count = base.plan.pages.filter((x) => x.type === type).length;
    const { reused } = build((d) => void d.overrides.push({ pageType: type, pageKey: null, blockId: 'header.title', dx: 3, dy: 0, dw: 0, dh: 0, scale: 1, rotation: 0, opacity: 1, hidden: false }));
    for (let i = 0; i < reused.pageCount; i++) reused.page(i);
    expect(reused.stats.layouts).toBe(count);
    expect(reused.stats.reusedPages).toBe(reused.pageCount - count);
  });

  it('renombrar la agenda no maqueta nada', async () => {
    const { base, build } = await setup();
    const { reused } = build((d) => void ((d.name = 'Otro nombre'), (d.updatedAt = '2031-02-03T00:00:00.000Z')));
    for (let i = 0; i < reused.pageCount; i++) expect(reused.page(i)).toBe(base.page(i));
    expect(reused.stats).toEqual({ layouts: 0, reusedPages: reused.pageCount });
  });

  it('cambiar la persona reutiliza el plan (la dedicatoria sigue) pero maqueta todo', async () => {
    const { base, build } = await setup();
    const { reused } = build((d) => void (d.persona.name = 'Otra'));
    expect(reused.plan).toBe(base.plan);
    for (let i = 0; i < reused.pageCount; i++) reused.page(i);
    expect(reused.stats.reusedPages).toBe(0);
  });

  it('con otro filtro de secciones no hay nada que reutilizar', async () => {
    const { base } = await setup();
    const other = new AgendaDocument(base.design, base.resources, { only: () => true }, { reuse: base });
    expect(other.plan).not.toBe(base.plan);
  });
});

describe('verificación perezosa', () => {
  /** Un elemento propio que se sale de la página: se ve en la verificación, no en lo maquetado. */
  const offPage = (key: string, type: string): Design =>
    derive(baseDesign(), (d) => void d.customBlocks.push({ id: 'fuera', pageType: type, pageKey: key, kind: 'rect', x: 400, y: 10, w: 20, h: 5, mirror: false, props: {} }));

  it('maquetar no verifica; verificar sí avisa', async () => {
    const { base } = await setup();
    const p = pageOf(base, 'weekRight');
    const { doc } = await openDocument(offPage(p.key, p.type));
    expect(doc.page(p.index).warnings.map((w) => w.code)).not.toContain('offPage');
    expect(doc.verify(p.index).map((w) => w.code)).toContain('offPage');
    expect(doc.pageWarnings(p.index).map((w) => w.code)).toContain('offPage');
    expect(doc.warnings().some((w) => w.code === 'offPage' && w.key === p.key)).toBe(true);
  });

  it('la verificación se mide una vez y viaja con la página reutilizada', async () => {
    const { base, build } = await setup();
    const p = pageOf(base, 'weekRight');
    const verified = base.verify(p.index);
    expect(base.verify(p.index)).toBe(verified);
    const { reused } = build((d) => void (d.name = 'Otro'));
    expect(reused.verify(p.index)).toBe(verified);
  });
});

describe('tema resuelto', () => {
  it('es el mismo objeto mientras los ajustes sean los mismos', () => {
    const d = baseDesign();
    expect(resolveThemeFor(d.theme)).toBe(resolveThemeFor(d.theme));
    const other = derive(d, (x) => void (x.theme.tokens = { colors: { ink: '#112233' } }));
    expect(resolveThemeFor(other.theme)).not.toBe(resolveThemeFor(d.theme));
    expect(resolveThemeFor(other.theme).colors.ink).toBe('#112233');
  });

  it('la comodidad cambia el tema aunque los ajustes sean los mismos', () => {
    const d = baseDesign();
    const wide = { ...d.theme, comfort: 'wide' as const };
    expect(resolveThemeFor(wide)).not.toBe(resolveThemeFor(d.theme));
    expect(resolveThemeFor(wide).sizes.body).toBeGreaterThan(resolveThemeFor(d.theme).sizes.body);
  });
});
