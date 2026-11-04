/**
 * Documento de agenda: une diseño + recursos → plan de páginas → páginas
 * maquetadas (con caché) → hojas impuestas → PDF. Es la API que usan la
 * interfaz, el Worker de PDF y la CLI.
 */
import type { Design } from '../design/schema';
import { calibrationSheet, coverSheet, sewingTemplate } from '../imposition/extras';
import { composeSide, type SheetRender } from '../imposition/compose';
import { impose, type SheetSide } from '../imposition/impose';
import type { DocContext } from '../layout/context';
import type { PageModel } from '../layout/prims';
import { renderPdf, type PdfPageInput } from '../render/pdf';
import { SECTION_REGISTRY } from '../sections/registry';
import { shapeText } from '../text/shape';
import { createDocContext, pageFormat, type PageFormat, type Resources } from './context';
import { layoutPage, pagePrims } from './layout';
import { planDocument, type DocumentPlan, type PlanOptions } from './plan';

export type ExportKind = 'pages' | 'imposed' | 'fronts' | 'backs' | 'signature' | 'calibration' | 'sewing' | 'cover' | 'separate';

export interface ExportOptions {
  assetBytes: (assetId: string) => Uint8Array | undefined;
  onProgress?: (done: number, total: number) => void;
  /** Para `signature`: índice del cuadernillo. */
  signature?: number;
}

export class AgendaDocument {
  readonly ctx: DocContext;
  readonly plan: DocumentPlan;
  readonly format: PageFormat;
  private readonly cache = new Map<number, PageModel>();
  private sidesCache: SheetSide[] | null = null;

  constructor(
    readonly design: Design,
    readonly resources: Resources,
    readonly planOptions: PlanOptions = {},
  ) {
    this.ctx = createDocContext(design, resources);
    this.format = pageFormat(design);
    this.plan = planDocument(this.ctx, SECTION_REGISTRY, planOptions);
    (this.ctx as { pages?: DocContext['pages'] }).pages = this.plan.pages.map((p) => ({ key: p.key, type: p.type, group: p.group, index: p.index, title: p.title, section: p.section }));
  }

  get pageCount(): number {
    return this.plan.pages.length;
  }

  page(index: number): PageModel {
    const hit = this.cache.get(index);
    if (hit) return hit;
    const plan = this.plan.pages[index];
    if (!plan) throw new Error(`Página fuera de rango: ${index}`);
    const model = layoutPage(this.ctx, plan, SECTION_REGISTRY, this.plan.pages.length);
    this.cache.set(index, model);
    return model;
  }

  indexOfKey(key: string): number {
    return this.plan.pages.findIndex((p) => p.key === key);
  }

  sides(): SheetSide[] {
    if (!this.sidesCache) this.sidesCache = impose(this.plan.signatures, this.format, this.design.binding);
    return this.sidesCache;
  }

  /** Cara de hoja compuesta (para la vista «hoja impresa» y para el PDF impuesto). */
  sheet(side: SheetSide, opts: { guides?: boolean } = {}): SheetRender {
    const labelFace = this.ctx.fonts.resolveWithFallback({ family: 'Manrope', weight: 700, style: 'normal' }, this.ctx.theme.fallbacks);
    return composeSide(side, (i) => (i < this.pageCount ? this.page(i) : null), {
      fmt: this.format,
      binding: this.design.binding,
      label: (t) => shapeText(labelFace, t, 5),
      ...(opts.guides ? { guides: true } : {}),
    });
  }

  /** Cara de hoja que contiene una página (para saltar desde la vista de página). */
  sideOfPage(index: number): SheetSide | undefined {
    return this.sides().find((s) => s.slots.some((sl) => sl.page === index));
  }

  /** Avisos de verificación previa de todas las páginas (maqueta todo). */
  warnings(): Array<{ page: number; key: string; message: string }> {
    const out: Array<{ page: number; key: string; message: string }> = [];
    for (let i = 0; i < this.pageCount; i++) {
      const p = this.page(i);
      for (const w of p.warnings) out.push({ page: i, key: p.key, message: w });
    }
    return out;
  }

  /** Documento con solo las secciones marcadas como «aparte» (p. ej. libreta de contraseñas). */
  separate(): AgendaDocument {
    return new AgendaDocument({ ...this.design, binding: { ...this.design.binding, method: 'saddle' } }, this.resources, {
      only: (_type, options) => options.separate === true,
    });
  }

  hasSeparate(): boolean {
    return this.design.sections.some((s) => s.enabled && s.options.separate === true);
  }

  async exportPdf(kind: ExportKind, opts: ExportOptions): Promise<Uint8Array> {
    const d = this.design;
    const title = `${d.name}`;
    const base = { fonts: this.ctx.fonts, assetBytes: opts.assetBytes, info: { title, author: d.persona.name, subject: 'Agenda', keywords: 'agenda, planner' }, ...(opts.onProgress ? { onProgress: opts.onProgress } : {}) };
    const toInput = (r: SheetRender): PdfPageInput => ({ w: r.w, h: r.h, prims: r.prims });
    switch (kind) {
      case 'pages': {
        const pages: PdfPageInput[] = [];
        for (let i = 0; i < this.pageCount; i++) {
          const p = this.page(i);
          pages.push({ w: p.w, h: p.h, prims: pagePrims(p) });
        }
        return renderPdf(pages, { ...base, duplex: 'DuplexFlipLongEdge' });
      }
      case 'imposed':
      case 'fronts':
      case 'backs':
      case 'signature': {
        let sides = this.sides();
        if (kind === 'fronts') sides = sides.filter((s) => s.side === 'front');
        if (kind === 'backs') {
          sides = sides.filter((s) => s.side === 'back');
          if (d.binding.manualReverseBacks) sides = [...sides].reverse();
        }
        if (kind === 'signature') sides = sides.filter((s) => s.signature === (opts.signature ?? 0));
        const duplex = this.format.nUp === 1 || d.binding.duplex === 'long-edge' ? 'DuplexFlipLongEdge' : 'DuplexFlipShortEdge';
        return renderPdf(
          sides.map((s) => toInput(this.sheet(s))),
          { ...base, duplex: kind === 'fronts' || kind === 'backs' ? 'Simplex' : duplex, pickTrayByPdfSize: true },
        );
      }
      case 'calibration':
        return renderPdf(calibrationSheet(this.ctx, this.format, this.ctx.strings).map(toInput), {
          ...base,
          info: { ...base.info, title: `${title} · calibración` },
          duplex: this.format.nUp === 1 || d.binding.duplex === 'long-edge' ? 'DuplexFlipLongEdge' : 'DuplexFlipShortEdge',
          pickTrayByPdfSize: true,
        });
      case 'sewing':
        return renderPdf([toInput(sewingTemplate(this.ctx, this.format, this.ctx.strings))], { ...base, info: { ...base.info, title: `${title} · perforado` } });
      case 'cover':
        return renderPdf([toInput(coverSheet(this.ctx, this.plan.signatures))], { ...base, info: { ...base.info, title: `${title} · tapa` } });
      case 'separate':
        return this.separate().exportPdf('imposed', opts);
    }
  }
}

export function buildDocument(design: Design, resources: Resources, planOptions: PlanOptions = {}): AgendaDocument {
  return new AgendaDocument(design, resources, planOptions);
}
