/**
 * Documento completo: paginación (lados, pliegos, relleno de cuadernillos), páginas
 * propias, espejado de ajustes, determinismo y PDF (fuentes incrustadas, dúplex).
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { pageToSvg } from '../src/core/render/svg';
import { openDocument } from './helpers/node-env';

const norma = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

describe('paginación', () => {
  it('pliegos semanales: izquierda en página par, derecha enfrentada', async () => {
    const { doc } = await openDocument(norma());
    const pages = doc.plan.pages;
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]!;
      expect(p.side).toBe((i + 1) % 2 === 1 ? 'recto' : 'verso');
      if (p.type === 'weekLeft') {
        expect(p.side).toBe('verso');
        expect(pages[i + 1]!.type).toBe('weekRight');
      }
      if (p.type === 'titlePage' || p.type === 'monthCover') expect(p.side).toBe('recto');
    }
    expect(pages.length).toBe(doc.plan.signatures.totalPages);
    expect(pages.length % 16).toBe(0);
    // Las 53 semanas de 2027 (más la de borde del 1–3 de enero) tienen su pliego.
    expect(pages.filter((p) => p.type === 'weekLeft').length).toBe(53);
  });

  it('elegir hojas por cuadernillo cambia el relleno pero no el contenido', async () => {
    for (const sheets of [3, 4, 5, 6]) {
      const { doc } = await openDocument(norma((d) => void (d.binding.signature.sheets = sheets)));
      expect(doc.plan.pages.length % 4).toBe(0);
      expect(doc.plan.signatures.signatures.every((g) => g.sheets <= sheets)).toBe(true);
      expect(doc.plan.contentPages).toBe(210);
    }
  });
});

describe('páginas propias', () => {
  it('se insertan donde se pide, en orden de creación, sin partir un pliego', async () => {
    const { doc: base } = await openDocument(norma());
    const weekLeft = base.plan.pages.find((p) => p.type === 'weekLeft')!;
    const design = norma((d) => {
      d.customPages.push(
        { id: 'a', after: weekLeft.key, fallback: null, startOn: 'any', title: 'Primera', content: { kind: 'text', text: 'A' } } as Design['customPages'][number],
        { id: 'b', after: weekLeft.key, fallback: null, startOn: 'any', title: 'Segunda', content: { kind: 'text', text: 'B' } } as Design['customPages'][number],
        { id: 'c', after: 'no-existe', fallback: 'month:2027-03', startOn: 'recto', title: 'Respaldo', content: { kind: 'text', text: 'C' } } as Design['customPages'][number],
      );
    });
    const { doc } = await openDocument(design);
    const keys = doc.plan.pages.map((p) => p.key);
    const iLeft = keys.indexOf(weekLeft.key);
    // El pliego no se parte: después de la izquierda viene su derecha y luego las propias, en orden.
    expect(doc.plan.pages[iLeft + 1]!.type).toBe('weekRight');
    expect(keys.indexOf('custom:a')).toBe(iLeft + 2);
    expect(keys.indexOf('custom:b')).toBe(iLeft + 3);
    // El respaldo cae al final de marzo y respeta el lado pedido.
    const c = doc.plan.pages[keys.indexOf('custom:c')]!;
    expect(c.side).toBe('recto');
    expect(doc.plan.pages[keys.indexOf('custom:c') - 1]!.group === 'month:2027-03' || doc.plan.pages[keys.indexOf('custom:c') - 1]!.type === 'filler').toBe(true);
    // Las páginas que siguen se corren y siguen cumpliendo sus lados.
    for (const p of doc.plan.pages) if (p.type === 'weekLeft') expect(p.side).toBe('verso');
  });
});

describe('ajustes del editor', () => {
  it('un ajuste «por tipo» se espeja en las izquierdas de tipos que caen a ambos lados', async () => {
    const plain = await openDocument(norma());
    const pages = plain.doc.plan.pages;
    // Un tipo que cae a ambos lados y tiene un bloque editable presente en sus dos páginas.
    let found: { type: string; recto: number; verso: number; blockId: string } | null = null;
    for (const type of plain.doc.ctx.mirrorTypes ?? []) {
      const r = pages.find((p) => p.type === type && p.side === 'recto');
      const v = pages.find((p) => p.type === type && p.side === 'verso');
      if (!r || !v) continue;
      const ids = new Set(plain.doc.page(v.index).blocks.map((b) => b.id));
      const b = plain.doc.page(r.index).blocks.find((x) => x.editable && x.role !== 'watermark' && x.role !== 'chrome' && ids.has(x.id));
      if (b) {
        found = { type, recto: r.index, verso: v.index, blockId: b.id };
        break;
      }
    }
    expect(found).not.toBeNull();
    const { type, recto, verso, blockId } = found!;
    const moved = await openDocument(norma((d) => void d.overrides.push({ pageType: type, pageKey: null, blockId, dx: 3, dy: 0, scale: 1, rotation: 0, opacity: 1, hidden: false })));
    const x = (doc: typeof plain.doc, i: number): number => doc.page(i).blocks.find((b) => b.id === blockId)!.m?.[4] ?? 0;
    expect(x(moved.doc, recto) - x(plain.doc, recto)).toBeCloseTo(3, 6);
    expect(x(moved.doc, verso) - x(plain.doc, verso)).toBeCloseTo(-3, 6);
  });
});

describe('salida', () => {
  it('la maquetación es determinista', async () => {
    const a = await openDocument(norma());
    const b = await openDocument(norma());
    for (const i of [0, 12, 40, 100, 200]) expect(pageToSvg(a.doc.page(i), { fonts: a.doc.ctx.fonts })).toBe(pageToSvg(b.doc.page(i), { fonts: b.doc.ctx.fonts }));
  });

  it('PDF impuesto: hojas apaisadas, fuentes incrustadas y preferencias de dúplex', async () => {
    const { doc, bytes } = await openDocument(norma());
    const pdf = await doc.exportPdf('imposed', { assetBytes: (id) => bytes.get(id) });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(doc.plan.signatures.totalSheets * 2);
    expect(text).toContain('/MediaBox [0 0 841.889764 595.275591]');
    expect(text).toContain('/DuplexFlipShortEdge');
    expect(text).toContain('/PickTrayByPDFSize true');
    expect(text).toContain('/FontFile2');
    expect(text).not.toMatch(/\/BaseFont \/Helvetica/);
  });

  it('hoja de calibración y plantilla de costura', async () => {
    const { doc, bytes } = await openDocument(norma());
    for (const kind of ['calibration', 'sewing', 'cover'] as const) {
      const pdf = await doc.exportPdf(kind, { assetBytes: (id) => bytes.get(id) });
      expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
    }
  });

  it('exportar un cuadernillo inexistente da un error claro', async () => {
    const { doc, bytes } = await openDocument(norma());
    await expect(doc.exportPdf('signature', { assetBytes: (id) => bytes.get(id), signature: 99 })).rejects.toThrow(/cuadernillo/);
    await expect(doc.exportPdf('separate', { assetBytes: (id) => bytes.get(id) })).rejects.toThrow(/aparte/);
  });
});

describe('duplicar para otro año', () => {
  it('las páginas propias y los ajustes por página siguen en su lugar', async () => {
    const { duplicateForYear, shiftKeyYears } = await import('../src/core/design/defaults');
    expect(shiftKeyYears('week:2027-W12:left', 1)).toBe('week:2028-W12:left');
    expect(shiftKeyYears('month:2027-03', 1)).toBe('month:2028-03');
    expect(shiftKeyYears('day:2027-05-01+', 1)).toBe('day:2028-05-01+');
    expect(shiftKeyYears('front:title', 1)).toBe('front:title');
    const base = norma((d) => {
      d.customPages.push({ id: 'p', after: null, fallback: 'month:2027-03', startOn: 'any', title: 'Marzo', content: { kind: 'text', text: 'x' } } as Design['customPages'][number]);
    });
    const { doc: d27 } = await openDocument(base);
    const anchor = d27.plan.pages.find((p) => p.group === 'month:2027-03' && p.type === 'weekRight')!.key;
    const withAnchor = norma((d) => {
      d.customPages.push({ id: 'p', after: anchor, fallback: 'month:2027-03', startOn: 'any', title: 'Marzo', content: { kind: 'text', text: 'x' } } as Design['customPages'][number]);
    });
    const next = duplicateForYear(withAnchor, 2028);
    expect(next.customPages[0]!.after).toBe(shiftKeyYears(anchor, 1));
    const { doc: d28 } = await openDocument(next);
    const i = d28.plan.pages.findIndex((p) => p.key === 'custom:p');
    expect(d28.plan.pages[i - 1]!.group).toBe('month:2028-03');
  });

  it('un número fuera de rango o con decimales no deja la agenda sin abrir', () => {
    const d = norma();
    const raw = JSON.parse(JSON.stringify(d)) as { binding: { signature: { sheets: number }; gutter: number }; personalDates: unknown[] };
    raw.binding.signature.sheets = 4.5;
    raw.binding.gutter = 99;
    raw.personalDates = [{ id: 'x', month: 2, day: 30.2, label: 'x', kind: 'other' }];
    const parsed = parseDesign(raw);
    expect(parsed.binding.signature.sheets).toBe(5);
    expect(parsed.binding.gutter).toBe(40);
    expect(parsed.personalDates[0]!.day).toBe(30);
  });
});

describe('estilo de escritura por página', () => {
  it('cambia renglones por puntos y los pasos en un tipo de página, sin tocar las demás', async () => {
    const base = await openDocument(norma());
    const notes = base.doc.plan.pages.find((p) => p.type === 'notes')!;
    const other = base.doc.plan.pages.find((p) => p.type === 'monthLog')!;
    const styled = await openDocument(
      norma((d) => void d.pageStyles.push({ pageType: 'notes', pageKey: null, tokens: { writing: { style: 'lines', pitch: 9 }, dots: { pitch: 4, pitchY: 8, radius: 0.9 } } })),
    );
    const area = (doc: typeof base.doc, i: number) => doc.page(i).blocks.find((b) => b.id === 'notes.area')!;
    // Antes: puntos. Después: renglones cada 9 mm.
    expect(area(base.doc, notes.index).prims[0]!.t).toBe('dots');
    const lines = area(styled.doc, notes.index).prims.filter((p) => p.t === 'line') as Array<{ y1: number }>;
    expect(lines.length).toBeGreaterThan(5);
    expect(lines[1]!.y1 - lines[0]!.y1).toBeCloseTo(9, 6);
    // Otra página no cambia.
    expect(pageToSvg(styled.doc.page(other.index), { fonts: styled.doc.ctx.fonts })).toBe(pageToSvg(base.doc.page(other.index), { fonts: base.doc.ctx.fonts }));
    // Puntos con pasos distintos en horizontal y vertical.
    const dotted = await openDocument(norma((d) => void d.pageStyles.push({ pageType: 'notes', pageKey: notes.key, tokens: { dots: { pitch: 4, pitchY: 8 } } })));
    const dots = area(dotted.doc, notes.index).prims[0] as { t: string; pts: number[] };
    expect(dots.t).toBe('dots');
    expect(dots.pts[2]! - dots.pts[0]!).toBeCloseTo(4, 6);
    const secondRowY = dots.pts.find((_, k) => k % 2 === 1 && dots.pts[k]! > dots.pts[1]! + 1e-6)!;
    expect(secondRowY - dots.pts[1]!).toBeCloseTo(8, 6);
  });
});
