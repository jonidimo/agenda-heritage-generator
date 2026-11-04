/**
 * Contexto de maquetación de una página: da a cada sección acceso tipado al
 * tema, las fuentes, los textos del idioma, el calendario y la geometría de la
 * página (con márgenes espejados según sea página izquierda o derecha).
 */
import type { CalendarModel } from '../calendar';
import type { Design } from '../design/schema';
import type { ThemeTokens, WritingStyle } from '../design/themes';
import type { AgendaStrings } from '../i18n';
import { langOf } from '../i18n';
import type { FontFace, FontRegistry } from '../text/fonts';
import { fitSize, shapeText, wrapText, type ShapedRun } from '../text/shape';
import { ptToMm, type Rect } from '../util/geometry';
import { primsBounds, type Block, type BlockRole, type Fill, type PageWarning, type Prim, type Side, type Stroke, type TextPrim, type WarningCode } from './prims';

export type TextRole = keyof ThemeTokens['fonts'];
export type SizeKey = keyof ThemeTokens['sizes'];

export interface TextOpts {
  role?: TextRole;
  /** Cuerpo en pt o clave del tema. */
  size?: number | SizeKey;
  upper?: boolean;
  /** Espaciado en em; `true` usa el del tema para rótulos. */
  tracking?: number | boolean;
  color?: string;
  features?: readonly string[];
  opacity?: number;
}

export interface TextAtOpts extends TextOpts {
  align?: 'left' | 'center' | 'right';
}

export interface TextInOpts extends TextAtOpts {
  valign?: 'top' | 'middle' | 'bottom';
  /** Reduce el cuerpo hasta entrar en el ancho (no por debajo del mínimo legible del tema). */
  fit?: boolean;
  wrap?: boolean;
  maxLines?: number;
  /** Interlineado como múltiplo del cuerpo. */
  leading?: number;
  ellipsis?: boolean;
  /** Solo medir: no avisa si no entra (para probar alternativas de diagramación). */
  silent?: boolean;
}

export interface AssetInfo {
  id: string;
  kind: 'raster' | 'vector' | 'pdf' | 'font';
  /** Proporción ancho/alto. */
  aspect: number;
  /** Tamaño natural en mm (vector/pdf) o en píxeles (raster). */
  width: number;
  height: number;
  vector?: import('../assets/svg').VectorAsset;
  pages?: number;
  /** Resolución nativa (raster) para calcular los ppp efectivos. */
  pxWidth?: number;
  pxHeight?: number;
}

export interface PageGeometry {
  w: number;
  h: number;
  side: Side;
  /** Caja de contenido con márgenes y lomo aplicados. */
  content: Rect;
  /** Lado del lomo en esta página. */
  spine: 'left' | 'right';
}

export interface DocContext {
  design: Design;
  theme: ThemeTokens;
  fonts: FontRegistry;
  strings: AgendaStrings;
  locale: string;
  cal: CalendarModel;
  methods: ReadonlySet<string>;
  assets: ReadonlyMap<string, AssetInfo>;
  /** Moneda local para rótulos de importes. */
  currency: string;
  /** Huso horario efectivo (fases lunares, estaciones). */
  timeZone: string;
  /** Equinoccios y solsticios del año de la agenda (fechas ISO locales). */
  seasons: import('../calendar/moon').SeasonDates;
  pageW: number;
  pageH: number;
  /** Tipos de página que caen tanto a la izquierda como a la derecha: sus ajustes «por tipo» se espejan en las izquierdas. */
  mirrorTypes?: ReadonlySet<string>;
  /** Plan final de páginas (lo completa el documento después de paginar; lo usa el índice). */
  pages?: ReadonlyArray<{ key: string; type: string; group: string; index: number; title: string; section: string }>;
}

export class LayoutContext {
  readonly blocks: Block[] = [];
  readonly warnings: PageWarning[] = [];

  constructor(
    readonly doc: DocContext,
    readonly page: PageGeometry,
  ) {}

  get theme(): ThemeTokens {
    return this.doc.theme;
  }
  get s(): AgendaStrings {
    return this.doc.strings;
  }
  get lang(): string {
    return langOf(this.doc.locale);
  }
  get content(): Rect {
    return this.page.content;
  }
  has(method: string): boolean {
    return this.doc.methods.has(method);
  }

  face(role: TextRole): FontFace {
    const spec = this.theme.fonts[role];
    return this.doc.fonts.resolveWithFallback(spec, this.theme.fallbacks);
  }

  sizeOf(size: number | SizeKey | undefined, fallback: SizeKey = 'body'): number {
    if (typeof size === 'number') return size;
    return this.theme.sizes[size ?? fallback];
  }

  run(text: string, opts: TextOpts = {}): ShapedRun {
    const role = opts.role ?? 'body';
    const face = this.face(role);
    const str = opts.upper ? text.toLocaleUpperCase(this.doc.locale) : text;
    const tracking = opts.tracking === true ? this.theme.tracking.label : opts.tracking === false ? 0 : (opts.tracking ?? 0);
    return shapeText(face, str, this.sizeOf(opts.size), { tracking, ...(opts.features ? { features: opts.features } : {}) });
  }

  private prim(run: ShapedRun, x: number, y: number, opts: TextOpts): TextPrim {
    if (run.missing.length > 0) {
      const chars = [...new Set(run.missing)].map((c) => String.fromCodePoint(c)).join(' ');
      this.warn('missingGlyphs', `La fuente no tiene los caracteres: ${chars}`, { chars });
    }
    return { t: 'text', run, x, y, color: opts.color ?? this.theme.colors.ink, ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}) };
  }

  /** Una línea con su origen en (x, línea de base). */
  textAt(text: string, x: number, baseline: number, opts: TextAtOpts = {}): { prim: TextPrim; width: number; bbox: Rect } {
    const run = this.run(text, opts);
    const align = opts.align ?? 'left';
    const x0 = align === 'left' ? x : align === 'center' ? x - run.width / 2 : x - run.width;
    const prim = this.prim(run, x0, baseline, opts);
    return { prim, width: run.width, bbox: { x: x0, y: baseline - run.capHeight, w: run.width, h: run.capHeight - run.descent * 0.6 } };
  }

  /** Texto dentro de una caja con alineación, ajuste de cuerpo y partición en líneas. */
  textIn(text: string, box: Rect, opts: TextInOpts = {}): { prims: TextPrim[]; bbox: Rect; lines: number; sizePt: number; truncated: boolean } {
    const role = opts.role ?? 'body';
    const face = this.face(role);
    const str = opts.upper ? text.toLocaleUpperCase(this.doc.locale) : text;
    const tracking = opts.tracking === true ? this.theme.tracking.label : opts.tracking === false ? 0 : (opts.tracking ?? 0);
    let sizePt = this.sizeOf(opts.size);
    const shapeOpts = { tracking, ...(opts.features ? { features: opts.features } : {}) };
    if (opts.fit && !opts.wrap) sizePt = fitSize(face, str, sizePt, box.w, this.theme.minTextPt, shapeOpts);
    let lines = opts.wrap ? wrapText(face, str, sizePt, box.w, shapeOpts) : [str];
    const leading = ptToMm(sizePt) * (opts.leading ?? 1.3);
    if (opts.wrap && opts.fit) {
      // Achica hasta que las líneas entren en la altura disponible.
      while (sizePt > this.theme.minTextPt && lines.length * ptToMm(sizePt) * (opts.leading ?? 1.3) > box.h + 0.01) {
        sizePt = Math.max(this.theme.minTextPt, sizePt - 0.25);
        lines = wrapText(face, str, sizePt, box.w, shapeOpts);
      }
    }
    const runW = (t: string): number => shapeText(face, t, sizePt, shapeOpts).width;
    /** Acorta una línea (primero por palabras, después por letras) hasta que entre con «…». */
    const withEllipsis = (l: string): string => {
      let out = l.trimEnd();
      while (out.length > 1 && runW(`${out}…`) > box.w + 0.01) out = /\s/.test(out) && runW(`${out.replace(/\s+\S*$/, '')}…`) <= box.w + 0.01 ? out.replace(/\s+\S*$/, '') : out.slice(0, -1).trimEnd();
      return `${out}…`;
    };
    let truncated = false;
    if (opts.maxLines !== undefined && lines.length > opts.maxLines) {
      lines = lines.slice(0, opts.maxLines);
      truncated = true;
      if (opts.ellipsis) lines[lines.length - 1] = withEllipsis(lines[lines.length - 1]!);
    }
    if (opts.ellipsis && !opts.wrap) {
      const l = lines[0] ?? '';
      if (runW(l) > box.w) {
        lines = [withEllipsis(l)];
        truncated = true;
      }
    }
    const runs = lines.map((l) => shapeText(face, l, sizePt, shapeOpts));
    const tooWide = runs.some((r) => r.width > box.w + 0.3);
    const tooTall = opts.wrap && box.h > 0 && runs.length * ptToMm(sizePt) * (opts.leading ?? 1.3) > box.h + ptToMm(sizePt) * 0.5;
    if (!opts.silent && str.trim() && (tooWide || tooTall)) {
      const short = str.length > 40 ? `${str.slice(0, 38)}…` : str;
      this.warn('textOverflow', `El texto «${short}» no entra en su espacio.`, { text: short });
    }
    const lh = opts.wrap ? ptToMm(sizePt) * (opts.leading ?? 1.3) : leading;
    const first = runs[0];
    const cap = first ? first.capHeight : 0;
    const blockH = cap + (runs.length - 1) * lh;
    const valign = opts.valign ?? 'top';
    let baseline = valign === 'top' ? box.y + cap : valign === 'middle' ? box.y + (box.h - blockH) / 2 + cap : box.y + box.h - blockH + cap;
    const prims: TextPrim[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    for (const run of runs) {
      const align = opts.align ?? 'left';
      const x0 = align === 'left' ? box.x : align === 'center' ? box.x + (box.w - run.width) / 2 : box.x + box.w - run.width;
      prims.push(this.prim(run, x0, baseline, opts));
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x0 + run.width);
      baseline += lh;
    }
    const top = prims[0] ? prims[0].y - cap : box.y;
    const bbox = prims.length > 0 ? { x: minX, y: top, w: maxX - minX, h: blockH } : { x: box.x, y: box.y, w: 0, h: 0 };
    return { prims, bbox, lines: runs.length, sizePt, truncated };
  }

  /* ---------- Trazos y rellenos del tema ---------- */

  stroke(kind: 'hair' | 'grid' | 'rule' | 'strong' | 'heavy', color?: 'ink' | 'rule' | 'ruleSoft' | string, extra: Partial<Stroke> = {}): Stroke {
    const c = this.theme.colors;
    const defaultColor = kind === 'hair' ? c.rule : kind === 'grid' ? c.ruleSoft : c.ink;
    const resolved = color === undefined ? defaultColor : color in c ? c[color as keyof typeof c] : color;
    return { color: resolved, width: ptToMm(this.theme.strokes[kind]), ...extra };
  }

  fill(kind: 'weekend' | 'ink' | 'paper' | string, opacity?: number): Fill {
    const c = this.theme.colors;
    const color = kind === 'weekend' ? c.weekend : kind === 'ink' ? c.ink : kind === 'paper' ? '#ffffff' : kind;
    return opacity === undefined ? { color } : { color, opacity };
  }

  writingStyle(override?: WritingStyle | 'auto'): WritingStyle {
    return override && override !== 'auto' ? override : this.theme.writing.style;
  }

  /* ---------- Bloques ---------- */

  add(id: string, label: string, prims: Prim[], opts: { role?: BlockRole; editable?: boolean; layer?: number; bbox?: Rect } = {}): Block {
    const bbox = opts.bbox ?? primsBounds(prims) ?? { x: 0, y: 0, w: 0, h: 0 };
    const block: Block = {
      id,
      label,
      bbox,
      prims,
      role: opts.role ?? 'content',
      editable: opts.editable ?? true,
      layer: opts.layer ?? 10,
    };
    this.blocks.push(block);
    return block;
  }

  warn(code: WarningCode, message: string, params: Record<string, string | number> = {}): void {
    this.warnings.push({ code, params, message });
  }
}
