/**
 * Enlaces y marcadores del PDF de páginas: cada día lleva a la página que lo tiene, los meses a su
 * mes, los títulos un nivel arriba, el índice a sus páginas; los enlaces a mano reemplazan a los
 * automáticos; el PDF los lleva con destinos explícitos y el impuesto no.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString, PDFHexString } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createDesign, duplicateForYear } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import type { AgendaDocument } from '../src/core/document';
import { blockBounds } from '../src/core/document/layout';
import { safeUrl } from '../src/core/document/links';
import { openDocument } from './helpers/node-env';

const norma = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

const monthsSection = (d: Design) => d.sections.find((s) => s.type === 'months')!;
const weeksItem = (d: Design) => monthsSection(d).items!.find((i) => i.type === 'weeks')!;

/** Página que muestra un día según el plan (las semanas y los días declaran sus días). */
function pagesWithDay(doc: AgendaDocument, iso: string): number[] {
  return doc.plan.pages.filter((p) => (p.type === 'weekLeft' || p.type === 'weekRight' || p.type === 'daily') && ((p.params?.days as string[] | undefined) ?? []).includes(iso)).map((p) => p.index);
}

describe('enlaces automáticos', () => {
  it('cada día del calendario anual lleva a la página que tiene ese día', async () => {
    const { doc } = await openDocument(norma());
    const yearPages = doc.plan.pages.filter((p) => p.type === 'yearOverview' && p.params?.year === 2027);
    expect(yearPages).toHaveLength(2);
    const seen = new Set<string>();
    for (const yp of yearPages) {
      for (const l of doc.links(yp.index)) {
        if (l.target.kind !== 'date') continue;
        seen.add(l.target.iso);
        expect(pagesWithDay(doc, l.target.iso)).toContain(l.page);
        // La página de destino es una semana izquierda (variante Alastair: los 7 días a la izquierda).
        expect(doc.plan.pages[l.page!]!.type).toBe('weekLeft');
      }
    }
    expect(seen.size).toBe(365);
  });

  it('los nombres de los meses llevan a la primera página del mes', async () => {
    const { doc } = await openDocument(norma());
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const months = doc.links(yp.index).filter((l) => l.target.kind === 'month');
    expect(months).toHaveLength(6);
    for (const l of months) {
      const t = l.target as { y: number; m: number };
      // El primer contenido del mes (antes de la portada puede haber una página de relleno).
      const first = doc.plan.pages.find((p) => p.type !== 'filler' && p.group === `month:${t.y}-${String(t.m).padStart(2, '0')}`)!;
      expect(l.page).toBe(first.index);
      expect(first.type).toBe('monthCover');
    }
  });

  it('el registro del mes y la vista mensual llevan a la semana de cada día; ningún enlace apunta a su propia página', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        monthsSection(d).items!.find((i) => i.type === 'monthGrid')!.enabled = true;
      }),
    );
    let checked = 0;
    for (let i = 0; i < doc.pageCount; i++) {
      for (const l of doc.links(i)) {
        expect(l.page).not.toBe(i);
        expect(l.rect.x).toBeGreaterThanOrEqual(0);
        expect(l.rect.y).toBeGreaterThanOrEqual(0);
        expect(l.rect.x + l.rect.w).toBeLessThanOrEqual(doc.format.w + 1e-6);
        expect(l.rect.y + l.rect.h).toBeLessThanOrEqual(doc.format.h + 1e-6);
      }
      const p = doc.plan.pages[i]!;
      if (p.type !== 'monthLog' && p.type !== 'monthGrid') continue;
      const days = doc.links(i).filter((l) => l.target.kind === 'date');
      const month = p.params?.month as { y: number; m: number };
      const dim = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
      expect(days).toHaveLength(dim);
      for (const l of days) expect(pagesWithDay(doc, (l.target as { iso: string }).iso)).toContain(l.page);
      checked++;
    }
    expect(checked).toBe(24);
  });

  it('en semanas horizontales y verticales, el día lleva a la página (izquierda o derecha) donde está', async () => {
    for (const variant of ['horizontal', 'vertical'] as const) {
      const { doc } = await openDocument(norma((d) => void (weeksItem(d).options.variant = variant)));
      for (const p of doc.plan.pages) {
        if (p.type !== 'weekLeft' && p.type !== 'weekRight') continue;
        // Lo que el plan dice que muestra la página es lo que la página dibuja.
        const week = doc.ctx.cal.weeks.find((w) => w.key === p.params?.week)!;
        const drawn = doc
          .page(p.index)
          .blocks.filter((b) => /^day\.\d+$/.test(b.id))
          .map((b) => week.days[Number(b.id.slice(4))]!.iso);
        expect(drawn).toEqual(p.params?.days);
      }
      const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
      const fri = doc.links(yp.index).find((l) => l.target.kind === 'date' && l.target.iso === '2027-03-05')!;
      expect(doc.plan.pages[fri.page!]!.type).toBe('weekRight');
    }
  });

  it('con un día por página, los días llevan a su página diaria', async () => {
    const { doc } = await openDocument(norma((d) => void (weeksItem(d).options.variant = 'daily')));
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const links = doc.links(yp.index).filter((l) => l.target.kind === 'date');
    expect(links.length).toBeGreaterThan(150);
    for (const l of links) expect(doc.plan.pages[l.page!]!.type).toBe('daily');
  });

  it('los días pueden llevar siempre al mes, y los meses al registro o a la vista mensual', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        d.links.dayTarget = 'month';
        d.links.monthTarget = 'log';
      }),
    );
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    for (const l of doc.links(yp.index)) {
      if (l.target.kind === 'date' || l.target.kind === 'month') expect(doc.plan.pages[l.page!]!.type).toBe('monthLog');
    }
  });

  it('los títulos llevan un nivel arriba: semana → mes, páginas del mes → calendario anual', async () => {
    const { doc } = await openDocument(norma());
    const pages = doc.plan.pages;
    const week = pages.find((p) => p.type === 'weekLeft' && p.group === 'month:2027-08')!;
    const up = doc.links(week.index).find((l) => l.cat === 'up')!;
    expect(up.blockId).toBe('week.title');
    expect(up.page).toBe(pages.find((p) => p.type !== 'filler' && p.group === 'month:2027-08')!.index);
    const log = pages.find((p) => p.type === 'monthLog' && p.group === 'month:2027-08')!;
    const toYear = doc.links(log.index).find((l) => l.cat === 'up')!;
    // Agosto está en la segunda página del calendario anual (julio a diciembre).
    expect(pages[toYear.page!]!.type).toBe('yearOverview');
    expect(pages[toYear.page!]!.params?.part).toBe(1);
  });

  it('el índice lleva a las páginas que imprime, y el número de página vuelve al índice', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        d.sections.find((s) => s.type === 'toc')!.enabled = true;
        d.binding.pageNumbers.enabled = true;
      }),
    );
    const toc = doc.plan.pages.find((p) => p.type === 'toc')!;
    const entries = doc.links(toc.index).filter((l) => l.cat === 'toc');
    expect(entries.length).toBeGreaterThan(12);
    const printed = doc
      .page(toc.index)
      .blocks.find((b) => b.id === 'toc.entries')!
      .prims.flatMap((p) => (p.t === 'text' && /^\d+$/.test(p.run.text) ? [Number(p.run.text)] : []));
    expect(entries.map((l) => l.page! + 1)).toEqual(printed);
    const some = doc.plan.pages.find((p) => p.type === 'review')!;
    const back = doc.links(some.index).find((l) => l.cat === 'pageNumber')!;
    expect(back.page).toBe(toc.index);
    const off = await openDocument(
      norma((d) => {
        d.binding.pageNumbers.enabled = true;
        d.links.pageNumber = 'none';
      }),
    );
    expect(off.doc.links(some.index).some((l) => l.cat === 'pageNumber')).toBe(false);
  });

  it('cada familia se puede apagar, y todo junto también', async () => {
    const { doc } = await openDocument(norma((d) => void (d.links.days = false)));
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    expect(doc.links(yp.index).some((l) => l.cat === 'days')).toBe(false);
    expect(doc.links(yp.index).some((l) => l.cat === 'months')).toBe(true);
    const none = await openDocument(norma((d) => void (d.links.enabled = false)));
    for (let i = 0; i < none.doc.pageCount; i++) expect(none.doc.links(i)).toHaveLength(0);
  });

  it('los enlaces se mueven con su elemento', async () => {
    const base = await openDocument(norma());
    const yp = base.doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const before = base.doc.links(yp.index).find((l) => l.blockId === 'month.3' && l.target.kind === 'date')!;
    const moved = await openDocument(norma((d) => void d.overrides.push({ pageType: 'yearOverview', pageKey: null, blockId: 'month.3', dx: 4, dy: -3, dw: 0, dh: 0, scale: 1, rotation: 0, opacity: 1, hidden: false })));
    const after = moved.doc.links(yp.index).find((l) => l.blockId === 'month.3' && l.target.kind === 'date')!;
    // El calendario cae a ambos lados: en esta página izquierda el ajuste «por tipo» se espeja en X.
    const block = (doc: AgendaDocument) => blockBounds(doc.page(yp.index).blocks.find((b) => b.id === 'month.3')!);
    const dx = block(moved.doc).x - block(base.doc).x;
    expect(Math.abs(dx)).toBeCloseTo(4, 5);
    expect(after.rect.x - before.rect.x).toBeCloseTo(dx, 5);
    expect(after.rect.y - before.rect.y).toBeCloseTo(-3, 5);
    const hidden = await openDocument(norma((d) => void d.overrides.push({ pageType: 'yearOverview', pageKey: null, blockId: 'month.3', dx: 0, dy: 0, dw: 0, dh: 0, scale: 1, rotation: 0, opacity: 1, hidden: true })));
    expect(hidden.doc.links(yp.index).some((l) => l.blockId === 'month.3')).toBe(false);
  });

  it('pestañas de todos los meses en el borde: cada una lleva a su mes', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        d.binding.thumbIndex.enabled = true;
        d.binding.thumbIndex.months = 'all';
      }),
    );
    const vision = doc.plan.pages.find((p) => p.type === 'vision')!;
    const tabs = doc.links(vision.index).filter((l) => l.blockId === 'chrome.thumb');
    expect(tabs).toHaveLength(12);
    const cover = doc.plan.pages.find((p) => p.type === 'monthCover' && p.group === 'month:2027-05')!;
    // En su propia portada, la pestaña de mayo no se enlaza a sí misma.
    expect(doc.links(cover.index).filter((l) => l.blockId === 'chrome.thumb')).toHaveLength(11);
    expect(doc.links(doc.plan.pages.find((p) => p.type === 'titlePage')!.index).some((l) => l.blockId === 'chrome.thumb')).toBe(false);
  });
});

describe('enlaces a mano', () => {
  it('reemplazan a los automáticos del elemento, o los quitan', async () => {
    const { doc: base } = await openDocument(norma());
    const yp = base.plan.pages.find((p) => p.type === 'yearOverview')!;
    const contacts = base.plan.pages.find((p) => p.type === 'contacts')!;
    const { doc } = await openDocument(
      norma((d) => {
        d.links.blocks.push({ pageType: 'yearOverview', pageKey: null, blockId: 'month.1', mode: 'none', page: '', url: '' });
        d.links.blocks.push({ pageType: 'yearOverview', pageKey: yp.key, blockId: 'month.2', mode: 'page', page: contacts.key, url: '' });
        d.links.blocks.push({ pageType: 'yearOverview', pageKey: null, blockId: 'month.4', mode: 'url', page: '', url: 'https://example.org/agenda' });
      }),
    );
    const links = doc.links(yp.index);
    expect(links.some((l) => l.blockId === 'month.1')).toBe(false);
    const m2 = links.filter((l) => l.blockId === 'month.2');
    expect(m2).toHaveLength(1);
    expect(m2[0]!.page).toBe(contacts.index);
    expect(m2[0]!.cat).toBe('manual');
    const m4 = links.filter((l) => l.blockId === 'month.4');
    expect(m4).toEqual([expect.objectContaining({ url: 'https://example.org/agenda' })]);
    // Los demás meses conservan sus enlaces automáticos (agosto, en la página de julio a diciembre).
    expect(doc.links(yp.index + 1).filter((l) => l.blockId === 'month.8').length).toBeGreaterThan(1);
  });

  it('un enlace a una página que no existe o a una dirección peligrosa se avisa y no se agrega', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        d.links.blocks.push({ pageType: 'yearOverview', pageKey: null, blockId: 'month.1', mode: 'page', page: 'no-existe', url: '' });
        d.links.blocks.push({ pageType: 'yearOverview', pageKey: null, blockId: 'month.2', mode: 'url', page: '', url: 'javascript:alert(1)' });
      }),
    );
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    expect(doc.links(yp.index).some((l) => l.blockId === 'month.1' || l.blockId === 'month.2')).toBe(false);
    const warn = doc.warnings().filter((w) => w.code === 'brokenLink');
    // Enero y febrero están en la primera página de cada año del calendario: un aviso por elemento y página.
    expect(warn.map((w) => `${w.page}:${String(w.params.block)}`)).toEqual(
      doc.plan.pages.filter((p) => p.type === 'yearOverview' && p.params?.part === 0).flatMap((p) => [`${p.index}:month.1`, `${p.index}:month.2`]),
    );
  });

  it('solo se aceptan direcciones web, de correo o de teléfono', () => {
    expect(safeUrl('https://example.org')).toBe('https://example.org');
    expect(safeUrl(' mailto:hola@example.org ')).toBe('mailto:hola@example.org');
    expect(safeUrl('tel:+54 11 5555-5555')).toBe('tel:+54 11 5555-5555');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hola', 'ftp://x', 'example.org', '']) expect(safeUrl(bad)).toBeNull();
  });

  it('al duplicar la agenda para otro año, los enlaces a mano pasan al año nuevo', () => {
    const d = norma((x) => {
      x.links.blocks.push({ pageType: 'weekLeft', pageKey: 'week:2027-W10:left', blockId: 'week.title', mode: 'page', page: 'month:2027-03:log', url: '' });
    });
    const next = duplicateForYear(d, 2028);
    expect(next.links.blocks[0]).toMatchObject({ pageKey: 'week:2028-W10:left', page: 'month:2028-03:log' });
  });
});

/* ---------- PDF ---------- */

async function pdfLinks(bytes: Uint8Array): Promise<{ pdf: PDFDocument; links: Array<{ from: number; to: number | string; rect: number[]; contents: string }> }> {
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  const index = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  const links: Array<{ from: number; to: number | string; rect: number[]; contents: string }> = [];
  pages.forEach((p, i) => {
    const annots = p.node.Annots();
    if (!annots) return;
    for (let k = 0; k < annots.size(); k++) {
      const a = pdf.context.lookup(annots.get(k), PDFDict);
      if (a.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
      const rect = pdf.context.lookup(a.get(PDFName.of('Rect')), PDFArray).asArray().map((n) => Number(n.toString()));
      const c = a.get(PDFName.of('Contents'));
      const contents = c instanceof PDFString || c instanceof PDFHexString ? c.decodeText() : '';
      const dest = a.get(PDFName.of('Dest'));
      if (dest) {
        const arr = pdf.context.lookup(dest, PDFArray);
        expect(arr.get(1)?.toString()).toBe('/XYZ');
        links.push({ from: i, to: index.get((arr.get(0) as PDFRef).toString()) ?? -1, rect, contents });
      } else {
        const act = pdf.context.lookup(a.get(PDFName.of('A')), PDFDict);
        const uri = act.get(PDFName.of('URI'));
        links.push({ from: i, to: uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : '?', rect, contents });
      }
    }
  });
  return { pdf, links };
}

describe('PDF de páginas', () => {
  it('lleva los enlaces con destino explícito, marcadores e idioma; el impuesto no lleva enlaces', async () => {
    const { doc, bytes } = await openDocument(
      norma((d) => {
        d.links.blocks.push({ pageType: 'contacts', pageKey: null, blockId: 'header.title', mode: 'url', page: '', url: 'https://example.org/contactos' });
      }),
    );
    const pdfBytes = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id) });
    const { pdf, links } = await pdfLinks(pdfBytes);
    let expected = 0;
    for (let i = 0; i < doc.pageCount; i++) expected += doc.links(i).length;
    expect(links).toHaveLength(expected);
    // Cada enlace interno lleva a la página que calculó el documento, con su descripción.
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const fromYear = links.filter((l) => l.from === yp.index && typeof l.to === 'number');
    expect(fromYear.map((l) => l.to)).toEqual(doc.links(yp.index).map((l) => l.page));
    expect(fromYear[0]!.contents).toMatch(/Enero 2027 · Página \d+/);
    // Zona en puntos: x = mm × 72 / 25,4 y la Y invertida desde abajo.
    const first = doc.links(yp.index)[0]!;
    const k = 72 / 25.4;
    expect(fromYear[0]!.rect[0]).toBeCloseTo(first.rect.x * k, 1);
    expect(fromYear[0]!.rect[3]).toBeCloseTo((doc.format.h - first.rect.y) * k, 1);
    expect(links.some((l) => l.to === 'https://example.org/contactos')).toBe(true);
    // Marcadores: secciones y meses con sus páginas; abre sin el panel desplegado y declara el idioma.
    const raw = Buffer.from(pdfBytes).toString('latin1');
    expect(raw).toContain('/Outlines');
    expect(raw).toContain('/PageMode /UseNone');
    expect(pdf.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(es-AR)');
    const imposed = await doc.exportPdf('imposed', { assetBytes: (id) => bytes.get(id) });
    expect((await pdfLinks(imposed)).links).toHaveLength(0);
    expect(Buffer.from(imposed).toString('latin1')).not.toContain('/Outlines');
  });

  it('sin marcadores ni enlaces si se apagan', async () => {
    const { doc, bytes } = await openDocument(
      norma((d) => {
        d.links.enabled = false;
        d.links.bookmarks = false;
      }),
    );
    const pdfBytes = await doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id) });
    expect((await pdfLinks(pdfBytes)).links).toHaveLength(0);
    expect(Buffer.from(pdfBytes).toString('latin1')).not.toContain('/Outlines');
  });
});

describe('marcadores', () => {
  it('secciones, cada mes y adentro sus páginas en orden', async () => {
    const { doc } = await openDocument(norma());
    const { buildOutline } = await import('../src/core/document/links');
    const outline = buildOutline(doc.ctx, doc.plan.pages);
    const titles = outline.map((o) => o.title);
    expect(titles[0]).toBe('Portada');
    expect(titles).toContain('Calendario anual 2027');
    expect(titles).toContain('Enero 2027');
    expect(titles).toContain('Diciembre 2027');
    const march = outline.find((o) => o.title === 'Marzo 2027')!;
    expect(march.page).toBe(doc.plan.pages.find((p) => p.type !== 'filler' && p.group === 'month:2027-03')!.index);
    const kids = march.children.map((c) => c.title);
    expect(kids).toContain('Registro del mes');
    expect(kids.filter((k) => /^Semana \d+$/.test(k)).length).toBeGreaterThanOrEqual(4);
    for (const c of march.children) expect(c.page).toBeGreaterThanOrEqual(march.page);
    // Las páginas de relleno no aparecen.
    const all = outline.flatMap((o) => [o, ...o.children]);
    for (const it of all) expect(doc.plan.pages[it.page]!.type).not.toBe('filler');
  });
});

describe('arreglos de la revisión', () => {
  it('vista mensual en dos páginas: cada día lleva a la mitad que lo muestra; sin título vacío tocable', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        const items = monthsSection(d).items!;
        items.find((i) => i.type === 'monthGrid')!.enabled = true;
        items.find((i) => i.type === 'monthGrid')!.options.spread = true;
        items.find((i) => i.type === 'weeks')!.enabled = false;
        items.find((i) => i.type === 'monthLog')!.enabled = false;
      }),
    );
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    for (const l of doc.links(yp.index)) {
      if (l.target.kind !== 'date') continue;
      expect((doc.plan.pages[l.page!]!.params?.days as string[]) ?? []).toContain(l.target.iso);
    }
    const second = doc.plan.pages.find((p) => p.type === 'monthGrid' && p.params?.part === 1)!;
    expect(doc.links(second.index).some((l) => l.cat === 'up')).toBe(false);
  });

  it('«los días llevan al mes» sin registro ni vista mensual: la página del día, no la primera del mes', async () => {
    const { doc } = await openDocument(
      norma((d) => {
        d.links.dayTarget = 'month';
        monthsSection(d).items!.find((i) => i.type === 'monthLog')!.enabled = false;
      }),
    );
    const yp = doc.plan.pages.find((p) => p.type === 'yearOverview')!;
    const l = doc.links(yp.index).find((x) => x.target.kind === 'date' && x.target.iso === '2027-03-15')!;
    expect(pagesWithDay(doc, '2027-03-15')).toContain(l.page);
  });

  it('las páginas del día dicen su fecha y su encabezado sube al mes de ese día', async () => {
    const { doc } = await openDocument(norma((d) => void (weeksItem(d).options.variant = 'daily')));
    const p = doc.plan.pages.find((x) => x.type === 'daily' && ((x.params?.days as string[]) ?? []).includes('2027-03-31'))!;
    expect(doc.pageLabel(p.index)).toMatch(/31 de marzo/);
    expect(doc.pageLabel(p.index)).not.toMatch(/abril/i);
    const up = doc.links(p.index).find((l) => l.cat === 'up' && l.blockId.startsWith('daily.'))!;
    expect(up.target).toEqual({ kind: 'month', y: 2027, m: 3 });
  });

  it('el título del registro de hábitos sube al calendario anual', async () => {
    const { doc } = await openDocument(norma());
    const h = doc.plan.pages.find((p) => p.type === 'habits')!;
    expect(doc.links(h.index).some((l) => l.cat === 'up' && doc.plan.pages[l.page!]!.type === 'yearOverview')).toBe(true);
  });

  it('una dirección larguísima se recorta en lugar de dejar la agenda sin abrir', () => {
    const d = norma((x) => void x.links.blocks.push({ pageType: 'contacts', pageKey: null, blockId: 'header.title', mode: 'url', page: '', url: `https://example.org/${'a'.repeat(3000)}` }));
    expect(parseDesign(JSON.parse(JSON.stringify(d))).links.blocks[0]!.url.length).toBe(2000);
  });

  it('las direcciones con acentos se escriben en ASCII en el PDF', async () => {
    const { asciiUri } = await import('../src/core/render/pdf');
    expect(asciiUri('https://ejemplo.com/año?q=ñ')).toBe('https://ejemplo.com/a%C3%B1o?q=%C3%B1');
    // Dominio con acentos: su forma «xn--» (la que calcula URL), solo ASCII.
    expect(asciiUri('https://cañón.com/')).toMatch(/^https:\/\/xn--[a-z0-9-]+\.com\/$/);
    expect(asciiUri('mailto:josé@example.org')).toBe('mailto:jos%C3%A9@example.org');
  });

  it('duplicar para otro año corre también las claves del calendario anual y del año en píxeles', async () => {
    const { shiftKeyYears } = await import('../src/core/design/defaults');
    expect(shiftKeyYears('year:2027:0', 1)).toBe('year:2028:0');
    expect(shiftKeyYears('front:mood:2027', 1)).toBe('front:mood:2028');
    expect(shiftKeyYears('front:toc:0', 1)).toBe('front:toc:0');
  });
});

describe('idioma y región', () => {
  it('el idioma y el país forman la región de la agenda', async () => {
    const { localeFor, countryLang, homeCountry } = await import('../src/core/i18n');
    expect(homeCountry('es', 'AR')).toBe('AR');
    expect(homeCountry('pt', 'AR')).toBe('BR');
    expect(homeCountry('en', null)).toBe('US');
    expect(localeFor('en', 'AR')).toBe('en-AR');
    expect(localeFor('es', null)).toBe('es');
    expect(countryLang('UY')).toBe('es');
    expect(countryLang('BR')).toBe('pt');
    expect(countryLang('DE')).toBeUndefined();
  });
});

describe('formato de las fechas', () => {
  it('auto sigue al país (no al idioma) y se puede fijar a mano', async () => {
    const { dateOrder, formatDayMonth, formatNumeric } = await import('../src/core/calendar/locale');
    expect(dateOrder('es-AR')).toBe('dmy');
    expect(dateOrder('en-US')).toBe('mdy');
    expect(dateOrder('en-AR')).toBe('dmy');
    expect(dateOrder('es-AR', 'mdy')).toBe('mdy');
    expect(formatNumeric('2027-03-31', 'dmy', true)).toBe('31/03/2027');
    expect(formatNumeric('2027-03-31', 'ymd', true)).toBe('2027-03-31');
    expect(formatDayMonth('es-AR', '2027-03-31', 'dmy')).toBe('31 de marzo');
    expect(formatDayMonth('en-AR', '2027-03-31', 'dmy')).toBe('31 March');
    expect(formatDayMonth('en-US', '2027-03-31', 'mdy')).toBe('March 31');
  });

  it('una agenda vieja sin formato de fecha queda en automático', () => {
    expect(parseDesign({}).calendar.dateFormat).toBe('auto');
  });
});
