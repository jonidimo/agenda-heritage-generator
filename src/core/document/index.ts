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
import type { PageModel, PageWarning } from '../layout/prims';
import { addMonths } from '../util/dates';
import { renderPdf, type PdfPageInput } from '../render/pdf';
import { SECTION_REGISTRY } from '../sections/registry';
import { shapeText } from '../text/shape';
import { createDocContext, pageFormat, type PageFormat, type Resources } from './context';
import { dedupeWarnings, layoutPage, pageInputs, pagePrims, samePageInputs, verifyPage, type PageInputs } from './layout';
import { buildOutline, LinkResolver, pageFullTitle, pageLinks, type ResolvedLink } from './links';
import { planDocument, type DocumentPlan, type PlanOptions } from './plan';
import { samePageDesign, samePlanInputs } from './reuse';

/** Los PDF que se pueden generar (páginas sueltas, impuesto para imprimir, hojas auxiliares…). */
export const EXPORT_KINDS = ['pages', 'imposed', 'fronts', 'backs', 'signature', 'calibration', 'sewing', 'cover', 'separate'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportOptions {
  assetBytes: (assetId: string) => Uint8Array | undefined;
  onProgress?: (done: number, total: number) => void;
  /** Para `signature`: índice del cuadernillo. */
  signature?: number;
}

export interface DocumentOptions {
  /**
   * Documento anterior de la misma agenda y con los mismos recursos: lo que no cambió (calendario,
   * textos, plan de páginas y las páginas ya maquetadas) se reutiliza en lugar de calcularse otra vez.
   */
  reuse?: AgendaDocument;
}

/** Una página maquetada con las entradas con las que se maquetó (para saber si vale en otro documento). */
interface CachedPage {
  readonly model: PageModel;
  readonly inputs: PageInputs;
}

export class AgendaDocument {
  readonly ctx: DocContext;
  readonly plan: DocumentPlan;
  readonly format: PageFormat;
  /** Cuántas páginas se maquetaron y cuántas se tomaron del documento anterior (pruebas y diagnóstico). */
  readonly stats = { layouts: 0, reusedPages: 0 };
  private readonly cache = new Map<number, CachedPage>();
  /** Páginas del documento anterior que valen aquí mientras sus entradas sigan siendo las mismas. */
  private readonly inherited: ReadonlyMap<number, CachedPage> | null;
  private readonly verifications = new Map<number, PageWarning[]>();
  private sidesCache: SheetSide[] | null = null;
  private resolverCache: LinkResolver | null = null;

  constructor(
    readonly design: Design,
    readonly resources: Resources,
    readonly planOptions: PlanOptions = {},
    options: DocumentOptions = {},
  ) {
    // Con otro filtro de secciones (p. ej. «libreta aparte») el plan es otro: no hay qué reutilizar.
    const prev = options.reuse?.planOptions.only === planOptions.only ? options.reuse : undefined;
    this.ctx = createDocContext(design, resources, prev);
    this.format = pageFormat(design);
    const reusePlan = prev !== undefined && samePlanInputs(prev.design, design) && prev.ctx.cal === this.ctx.cal && prev.ctx.strings === this.ctx.strings;
    if (prev && reusePlan) {
      this.plan = prev.plan;
      this.ctx.pages = prev.ctx.pages;
      this.ctx.mirrorTypes = prev.ctx.mirrorTypes;
    } else {
      this.plan = planDocument(this.ctx, SECTION_REGISTRY, planOptions);
      this.ctx.pages = this.plan.pages.map((p) => ({ key: p.key, type: p.type, group: p.group, index: p.index, title: p.title, section: p.section }));
      const sides = new Map<string, Set<string>>();
      for (const p of this.plan.pages) sides.set(p.type, (sides.get(p.type) ?? new Set()).add(p.side));
      this.ctx.mirrorTypes = new Set([...sides.entries()].filter(([, s]) => s.size === 2).map(([t]) => t));
    }
    // Páginas heredadas: mismo plan, mismos recursos y contexto (tema, textos, calendario…), y el
    // resto del diseño igual salvo lo propio de cada página (se compara al pedirla).
    this.inherited = prev && reusePlan && sameLayoutContext(prev.ctx, this.ctx) && samePageDesign(prev.design, design) ? prev.cache : null;
  }

  get pageCount(): number {
    return this.plan.pages.length;
  }

  page(index: number): PageModel {
    const hit = this.cache.get(index);
    if (hit) return hit.model;
    const plan = this.plan.pages[index];
    if (!plan) throw new Error(`Página fuera de rango: ${index}`);
    const inputs = pageInputs(this.design, plan);
    const old = this.inherited?.get(index);
    if (old && samePageInputs(old.inputs, inputs)) {
      this.cache.set(index, old);
      this.stats.reusedPages++;
      return old.model;
    }
    const model = layoutPage(this.ctx, plan, SECTION_REGISTRY, this.plan.pages.length, inputs);
    this.stats.layouts++;
    this.cache.set(index, { model, inputs });
    return model;
  }

  /**
   * Avisos de verificación de una página (fuera de la página, zona no imprimible, textos
   * superpuestos, poca resolución): se miden la primera vez que se piden. Si la página se reutiliza
   * de otro documento, su verificación se reutiliza con ella.
   */
  verify(index: number): PageWarning[] {
    const model = this.page(index);
    const hit = this.verifications.get(index) ?? verified.get(model);
    if (hit) {
      this.verifications.set(index, hit);
      return hit;
    }
    const warnings = verifyPage(this.ctx, model);
    verified.set(model, warnings);
    this.verifications.set(index, warnings);
    return warnings;
  }

  indexOfKey(key: string): number {
    return this.plan.pages.findIndex((p) => p.key === key);
  }

  get linkResolver(): LinkResolver {
    this.resolverCache ??= new LinkResolver(this.plan.pages, this.design.links);
    return this.resolverCache;
  }

  /** Enlaces de una página (los del PDF de páginas): zona tocable y destino. */
  links(index: number): ResolvedLink[] {
    return pageLinks(this.page(index), this.linkResolver, this.design.links).links;
  }

  /** Título de una página en el idioma de la agenda, con su mes (describe adónde lleva un enlace). */
  pageLabel(index: number): string {
    const p = this.plan.pages[index];
    return p ? pageFullTitle(this.ctx, p) : '';
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

  /** Todos los avisos de una página: los de la maquetación y los de la verificación. */
  pageWarnings(index: number): PageWarning[] {
    return dedupeWarnings([...this.page(index).warnings, ...this.verify(index)]);
  }

  /** Avisos de verificación previa de todas las páginas (maqueta todo). */
  warnings(): Array<PageWarning & { page: number; key: string }> {
    const out: Array<PageWarning & { page: number; key: string }> = [];
    for (let i = 0; i < this.pageCount; i++) {
      let p: PageModel;
      try {
        p = this.page(i);
      } catch (err) {
        // Una página que no se puede maquetar se informa como aviso; la revisión del resto sigue.
        const message = (err as Error).message;
        out.push({ code: 'layoutError', params: { error: message }, message: `Error al maquetar: ${message}`, page: i, key: this.plan.pages[i]?.key ?? '' });
        continue;
      }
      for (const w of this.pageWarnings(i)) out.push({ ...w, page: i, key: p.key });
      for (const b of pageLinks(p, this.linkResolver, this.design.links).broken) {
        const label = p.blocks.find((x) => x.id === b.blockId)?.label ?? b.blockId;
        const message = b.mode === 'url' ? `El enlace de «${label}» no es una dirección web válida (${b.target}).` : `El enlace de «${label}» lleva a una página que ya no existe.`;
        out.push({ code: 'brokenLink', params: { block: b.blockId, label, mode: b.mode, target: b.target }, message, page: i, key: p.key });
      }
    }
    return out;
  }

  /** Avisos que no dependen de una página (por ahora: datos de feriados). */
  documentWarnings(): PageWarning[] {
    const out: PageWarning[] = [];
    const d = this.design;
    const country = d.holidays.country;
    if (country) {
      const data = this.resources.holidays;
      const first = d.calendar.year;
      const last = addMonths(d.calendar.year, d.calendar.startMonth, d.calendar.monthCount - 1).y;
      if (!data) out.push({ code: 'holidaysMissing', params: { country }, message: `No se pudieron cargar los feriados de ${country}: la agenda sale sin feriados.` });
      else if (first < data.range[0] || last > data.range[1])
        out.push({
          code: 'holidaysRange',
          params: { from: data.range[0], to: data.range[1], year: last },
          message: `Los feriados calculados cubren ${data.range[0]}–${data.range[1]}: para ${last} regenerá los datos con «npm run holidays -- --to ${last + 5}».`,
        });
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
        // Para leer en pantalla (tableta, lector de tinta electrónica): con enlaces y marcadores.
        const pages: PdfPageInput[] = [];
        const label = (n: number): string => `${this.pageLabel(n)} · ${this.ctx.strings.common.page} ${n + 1}`;
        for (let i = 0; i < this.pageCount; i++) {
          const p = this.page(i);
          const links = this.links(i).map((l) => ({ rect: l.rect, ...(l.page !== undefined ? { page: l.page, label: label(l.page) } : { url: l.url!, label: l.url! }) }));
          pages.push({ w: p.w, h: p.h, prims: pagePrims(p), ...(links.length > 0 ? { links } : {}) });
        }
        return renderPdf(pages, {
          ...base,
          duplex: 'DuplexFlipLongEdge',
          lang: d.locale,
          ...(d.links.bookmarks ? { outline: buildOutline(this.ctx, this.plan.pages) } : {}),
        });
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
        if (kind === 'signature') {
          sides = sides.filter((s) => s.signature === (opts.signature ?? 0));
          if (sides.length === 0) throw new Error(`No existe el cuadernillo ${(opts.signature ?? 0) + 1} (hay ${this.plan.signatures.signatures.length}).`);
        }
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
        if (!this.hasSeparate()) throw new Error('No hay secciones marcadas como «libreta aparte».');
        return this.separate().exportPdf('imposed', opts);
    }
  }
}

/** Verificaciones ya hechas, por modelo de página: una página reutilizada por otro documento no se verifica de nuevo. */
const verified = new WeakMap<PageModel, PageWarning[]>();

/** ¿El contexto de maquetación es el mismo salvo el diseño? (tema, textos, calendario, recursos y formato.) */
function sameLayoutContext(a: DocContext, b: DocContext): boolean {
  return (
    a.theme === b.theme &&
    a.strings === b.strings &&
    a.cal === b.cal &&
    a.methods === b.methods &&
    a.currency === b.currency &&
    a.timeZone === b.timeZone &&
    a.seasons === b.seasons &&
    a.locale === b.locale &&
    a.fonts === b.fonts &&
    a.assets === b.assets &&
    a.pageW === b.pageW &&
    a.pageH === b.pageH
  );
}

export function buildDocument(design: Design, resources: Resources, planOptions: PlanOptions = {}): AgendaDocument {
  return new AgendaDocument(design, resources, planOptions);
}
