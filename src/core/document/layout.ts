/**
 * Maquetación final de una página: contenido de la sección + bloques propios
 * del usuario + marcas de agua + numeración/pestañas + ajustes del editor
 * (mover, escalar, rotar, opacidad, ocultar) con verificación de límites.
 */
import { enumProp, IMAGE_FITS, numProp, PROP_DEFAULTS, PROP_RANGES, TEXT_ALIGNS, TEXT_ROLES, TEXT_VALIGNS } from '../design/customBlocks';
import type { BlockOverride, BlockStyle, CustomBlock, Design, PageStyle, WatermarkPlacement } from '../design/schema';
import { fmt as fmtStr } from '../i18n';
import { inset } from '../layout/box';
import { adjustedSize, type BoxAdjust } from '../layout/box';
import { LayoutContext, type BoxAdjuster, type DocContext } from '../layout/context';
import { stretchPrims, stretchRect } from '../layout/stretch';
import { parseDrawing, type DrawingProps } from '../design/drawing';
import { primsBounds, strokeUses, type Block, type LinkArea, type LinkTarget, type PageModel, type PageWarning, type Prim } from '../layout/prims';
import { dotField, ruledLines, squareGrid } from '../layout/widgets';
import type { PagePlan, SectionModule } from '../sections/types';
import { compose, composeAll, IDENTITY, ptToMm, rectContains, rotateAround, scale, transformRect, translate, type Matrix, type Rect } from '../util/geometry';
import { inkBounds } from '../text/shape';
import { mergeTokens, type ThemeTokens, type WritingStyle } from '../design/themes';
import { normalizeColor } from '../util/color';
import { parseFontSpec, type FontRegistry } from '../text/fonts';
import { assetPrims } from './assets';
import { drawElement } from './elements';
import { safeArea } from './binding';
import { pageGeometry } from './context';
import { pageTextVars } from '../sections/common';
import { applyBlockStyle, blockStyleMap, mergeLineTable } from './blockstyle';
import { applyLineStyles, hasLineStyles } from './linestyle';

export function findOverride(overrides: readonly BlockOverride[], page: { key: string; type: string }, blockId: string): BlockOverride | undefined {
  return (
    overrides.find((o) => o.blockId === blockId && o.pageKey === page.key) ??
    overrides.find((o) => o.blockId === blockId && o.pageKey === null && o.pageType === page.type)
  );
}

export function overrideMatrix(bbox: Rect, o: Pick<BlockOverride, 'dx' | 'dy' | 'scale' | 'rotation'> & { scaleY?: number | null }, mirrorX = false): Matrix {
  const s = o.scale;
  // Sin escala vertical propia, la misma que la horizontal (así un archivo anterior da lo mismo que antes).
  const sy = o.scaleY ?? s;
  const dx = mirrorX ? -o.dx : o.dx;
  return composeAll(
    translate(bbox.x + dx, bbox.y + o.dy),
    rotateAround(o.rotation, (bbox.w * s) / 2, (bbox.h * sy) / 2),
    scale(s, sy),
    translate(-bbox.x, -bbox.y),
  );
}

/** Caja final de un bloque (con su transformación): la que se ve al seleccionarlo. */
export function blockBounds(b: Block): Rect {
  const box = b.box ?? b.bbox;
  return b.m ? transformRect(b.m, box) : box;
}

/**
 * Estira un bloque a la caja que le dio el editor (ver `stretch.ts`). Solo cambia el tamaño: el
 * lugar lo pone después la matriz del bloque. Un lado sin tamaño (una línea horizontal) no se estira.
 */
function stretchBlock(b: Block, a: BoxAdjust): void {
  const from = b.bbox;
  const to = { x: from.x, y: from.y, w: from.w > 1e-6 ? adjustedSize(from.w, a.dw) : from.w, h: from.h > 1e-6 ? adjustedSize(from.h, a.dh) : from.h };
  b.prims = stretchPrims(b.prims, from, to);
  if (b.links) b.links = b.links.map((l) => ({ ...l, ...stretchRect(l, from, to) }));
  b.bbox = to;
}

/** Estilo de escritura elegido explícitamente para la página (o su tipo), si lo hay. */
function pageWritingStyle(styles: readonly PageStyle[], plan: PagePlan): WritingStyle | undefined {
  const pick = (s: { tokens: Record<string, unknown> } | undefined): WritingStyle | undefined => (s?.tokens.writing as { style?: WritingStyle } | undefined)?.style;
  return pick(styles.find((s) => s.pageKey === plan.key)) ?? pick(styles.find((s) => s.pageKey === null));
}

/** Tema de una página: el del documento más el estilo de escritura de su tipo y, encima, el de la página. */
function pageTheme(doc: DocContext, styles: readonly PageStyle[], plan: PagePlan): ThemeTokens | undefined {
  if (styles.length === 0) return undefined;
  const byType = styles.find((s) => s.pageKey === null);
  const byPage = styles.find((s) => s.pageKey === plan.key);
  let theme = doc.theme;
  if (byType) theme = mergeTokens(theme, byType.tokens);
  if (byPage) theme = mergeTokens(theme, byPage.tokens);
  return theme;
}

/**
 * Todo lo que la maquetación de UNA página lee del diseño y que es propio de esa página: los
 * elementos propios, las marcas de agua, los ajustes del editor y los estilos de página que le
 * tocan. `layoutPage` solo lee estos datos (nunca `design.overrides`, `design.customBlocks`…
 * directamente), así que dos documentos con las mismas entradas y el mismo contexto dan la misma
 * página: se reutiliza el modelo ya maquetado en lugar de volver a calcularlo.
 */
export interface PageInputs {
  readonly blocks: readonly CustomBlock[];
  readonly watermarks: readonly WatermarkPlacement[];
  readonly overrides: readonly BlockOverride[];
  /** Estilo propio de los elementos (líneas, relleno, color del texto). */
  readonly blockStyles: readonly BlockStyle[];
  readonly styles: readonly PageStyle[];
  /** Adónde lleva el número de página (el único dato de «Enlaces» que cambia lo maquetado). */
  readonly pageNumberLink: Design['links']['pageNumber'];
}

export function pageInputs(design: Design, plan: PagePlan): PageInputs {
  const onPage = (o: { pageType: string; pageKey: string | null }): boolean => o.pageType === plan.type && (o.pageKey === null || o.pageKey === plan.key);
  return {
    blocks: design.customBlocks.filter(onPage),
    watermarks: design.watermarks.filter((wm) => watermarkApplies(wm, plan.type, plan.key)),
    // Un ajuste atado a la clave de la página vale aunque su tipo haya cambiado (ver `findOverride`).
    overrides: design.overrides.filter((o) => o.pageKey === plan.key || (o.pageKey === null && o.pageType === plan.type)),
    blockStyles: design.blockStyles.filter(onPage),
    styles: design.pageStyles.filter(onPage),
    pageNumberLink: design.links.pageNumber,
  };
}

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** ¿Las mismas entradas? Por identidad, elemento por elemento (el editor no muta: lo que no se tocó es el mismo objeto). */
export function samePageInputs(a: PageInputs, b: PageInputs): boolean {
  return a.pageNumberLink === b.pageNumberLink && sameList(a.blocks, b.blocks) && sameList(a.watermarks, b.watermarks) && sameList(a.overrides, b.overrides) && sameList(a.blockStyles, b.blockStyles) && sameList(a.styles, b.styles);
}

function watermarkApplies(wm: WatermarkPlacement, type: string, key: string): boolean {
  if (!wm.enabled) return false;
  if (wm.exclude.includes(type) || wm.excludePages.includes(key)) return false;
  return wm.scope.includes('all') || wm.scope.includes(type);
}

function placeWatermark(ctx: LayoutContext, wm: WatermarkPlacement): void {
  const info = ctx.doc.assets.get(wm.assetId);
  const aspect = info?.aspect ?? 1;
  const w = wm.width;
  const h = w / aspect;
  const { w: pw, h: ph, side } = ctx.page;
  const outerRight = side === 'recto';
  let anchorRight: boolean | null;
  switch (wm.hAnchor) {
    case 'outer':
      anchorRight = outerRight;
      break;
    case 'inner':
      anchorRight = !outerRight;
      break;
    case 'right':
      anchorRight = true;
      break;
    case 'left':
      anchorRight = false;
      break;
    default:
      anchorRight = null;
  }
  const x = anchorRight === null ? (pw - w) / 2 + wm.dx : anchorRight ? pw - wm.dx - w : wm.dx;
  const y = wm.vAnchor === 'top' ? wm.dy : wm.vAnchor === 'bottom' ? ph - wm.dy - h : (ph - h) / 2 + wm.dy;
  const mirror = wm.mirrorOnVerso && side === 'verso' && (wm.hAnchor === 'outer' || wm.hAnchor === 'inner');
  const prims = assetPrims(info, { x, y, w, h }, { fit: 'fill', opacity: wm.opacity, rotation: wm.rotation, mirror, minStrokePt: wm.minStrokePt });
  ctx.add(`wm.${wm.id}`, 'Marca de agua', prims, { role: 'watermark', layer: wm.layer === 'above' ? 20 : 1, bbox: { x, y, w, h } });
}

/** Cajas aproximadas de la «tinta» de cada línea de texto (con todas las transformaciones). */
function collectTextBoxes(prims: Prim[], m: Matrix, label: string, block: string, out: Array<{ r: Rect; label: string; block: string }>, fonts: FontRegistry): void {
  for (const p of prims) {
    if (p.t === 'group') collectTextBoxes(p.children, p.m ? compose(m, p.m) : m, label, block, out, fonts);
    else if (p.t === 'text' && p.run.glyphs.length > 0 && p.run.text.trim()) {
      const face = fonts.get(p.run.face);
      const ink = face ? inkBounds(face, p.run) : null;
      const r = ink
        ? { x: p.x + ink.x, y: p.y + ink.y, w: ink.w, h: ink.h }
        : { x: p.x, y: p.y - p.run.capHeight * 1.05, w: p.run.width, h: p.run.capHeight * 1.05 + Math.abs(p.run.descent) * 0.6 };
      const text = p.run.text.length > 28 ? `${p.run.text.slice(0, 26)}…` : p.run.text;
      out.push({ r: transformRect(m, r), label: `${text}`, block });
    }
  }
}

function findImages(prims: Prim[]): Array<{ asset: string; w: number }> {
  const out: Array<{ asset: string; w: number }> = [];
  const walk = (ps: Prim[], k: number): void => {
    for (const p of ps) {
      if (p.t === 'image') out.push({ asset: p.asset, w: p.w * k });
      else if (p.t === 'group') walk(p.children, p.m ? k * Math.sqrt(Math.abs(p.m[0] * p.m[3] - p.m[1] * p.m[2])) : k);
    }
  };
  walk(prims, 1);
  return out;
}

function substitute(text: string, ctx: LayoutContext, page: PagePlan): string {
  return fmtStr(text, pageTextVars(ctx, page));
}

function placeCustomBlock(ctx: LayoutContext, cb: CustomBlock, page: PagePlan): void {
  const x = cb.mirror && ctx.page.side === 'verso' ? ctx.page.w - cb.x - cb.w : cb.x;
  let box = { x, y: cb.y, w: cb.w, h: cb.h };
  const p = cb.props as Record<string, unknown>;
  let prims: Prim[] = [];
  let links: LinkArea[] = [];
  switch (cb.kind) {
    case 'text': {
      // Con alto automático el texto se maqueta sin límite de alto y la caja se ajusta a sus renglones.
      const auto = p.autoHeight === true && p.wrap !== false;
      const t = ctx.textIn(substitute(String(p.text ?? ''), ctx, page), auto ? { ...box, h: AUTO_HEIGHT_PROBE } : box, {
        role: enumProp(p.role, TEXT_ROLES, 'body'),
        size: numProp(p.size, PROP_RANGES.textSize, ctx.theme.sizes.body),
        align: enumProp(p.align, TEXT_ALIGNS, 'left'),
        // Con alto automático la caja se ajusta a los renglones: arriba, o el texto caería en la caja de prueba.
        valign: auto ? 'top' : enumProp(p.valign, TEXT_VALIGNS, 'top'),
        upper: Boolean(p.upper),
        tracking: numProp(p.tracking, PROP_RANGES.tracking, PROP_DEFAULTS.tracking),
        wrap: p.wrap !== false,
        // Sin la propiedad, ajusta (como los archivos de antes); con `fit: false` el cuerpo es el pedido y, si no entra, avisa.
        fit: p.fit !== false,
        ...(normalizeColor(p.color) ? { color: normalizeColor(p.color)! } : {}),
        // Fuente propia del elemento (si no, la de su tipo de texto).
        ...(parseFontSpec(p.font) ? { font: parseFontSpec(p.font)! } : {}),
      });
      prims = t.prims;
      if (auto) box = { ...box, h: autoTextHeight(t.lines, t.sizePt) };
      break;
    }
    case 'image':
      prims = assetPrims(ctx.doc.assets.get(String(p.assetId ?? '')), box, {
        fit: enumProp(p.fit, IMAGE_FITS, 'contain'),
        opacity: numProp(p.opacity, PROP_RANGES.opacity, PROP_DEFAULTS.opacity),
        minStrokePt: 0.25,
      });
      break;
    case 'lines':
      // Un elemento propio de renglones es siempre de renglones (no sigue el estilo de la página).
      prims = ruledLines(box, numProp(p.pitch, PROP_RANGES.pitch, ctx.theme.writing.pitch), ctx.stroke('hair'));
      break;
    case 'dots':
      prims = [dotField(box, numProp(p.pitch, PROP_RANGES.pitch, ctx.theme.dots.pitch), (ctx.theme.dots.radius * 25.4) / 72, ctx.theme.dots.color)];
      break;
    case 'grid':
      prims = squareGrid(box, numProp(p.pitch, PROP_RANGES.pitch, PROP_DEFAULTS.gridPitch), ctx.stroke('grid'));
      break;
    case 'rect':
      prims = [{ t: 'rect', ...box, r: numProp(p.radius, PROP_RANGES.radius, PROP_DEFAULTS.radius), stroke: ctx.stroke('rule', 'ink', { use: 'frame' }), ...(normalizeColor(p.fill) ? { fill: { color: normalizeColor(p.fill)! } } : {}) }];
      break;
    case 'drawing': {
      const drawing = parseDrawing(p);
      if (!drawing) {
        ctx.warn('layoutError', `El dibujo «${String(p.label ?? cb.id)}» no es válido y no se dibuja.`, { id: cb.id });
        break;
      }
      prims = drawingPrims(drawing, box);
      for (const asset of new Set(imageAssets(drawing.prims))) {
        if (!ctx.doc.assets.has(asset)) ctx.warn('missingAsset', `El dibujo «${String(p.label ?? cb.id)}» usa una imagen que no está en esta agenda: se deja un recuadro vacío.`, { name: asset });
      }
      break;
    }
    case 'line':
      prims = [{ t: 'line', x1: box.x, y1: box.y + box.h / 2, x2: box.x + box.w, y2: box.y + box.h / 2, stroke: ctx.stroke('rule', 'ink', { use: 'separator' }) }];
      break;
    default: {
      // Los elementos compuestos (tabla, lista, hábitos…) se dibujan completos en su caja.
      const el = drawElement(ctx, cb.kind, p, box, page);
      prims = el.prims;
      links = el.links;
    }
  }
  ctx.add(`custom.${cb.id}`, String(p.label ?? 'Elemento propio'), prims, {
    role: 'custom',
    layer: 15,
    bbox: box,
    ...(cb.kind === 'text' ? { text: { kind: 'custom' as const, id: cb.id } } : {}),
    ...(links.length > 0 ? { links } : {}),
  });
}

/**
 * Las primitivas de un dibujo en la caja del elemento. Está guardado con su esquina en el origen y su
 * tamaño de cuando se copió (`w0` × `h0`): `stretch` lo estira a la caja como a un bloque del programa
 * (las líneas y los recuadros se estiran sin cambiar de grosor; lo que tiene tamaño propio se mueve) y
 * `scale` lo escala entero. Una imagen que ya no está en la agenda se avisa.
 */
function drawingPrims(drawing: DrawingProps, box: Rect): Prim[] {
  const from = { x: 0, y: 0, w: drawing.w0, h: drawing.h0 };
  const prims = drawing.prims as Prim[];
  const out: Prim[] =
    drawing.mode === 'scale'
      ? [{ t: 'group', m: composeAll(translate(box.x, box.y), scale(box.w / drawing.w0, box.h / drawing.h0)), children: prims }]
      : stretchPrims(prims, from, box);
  if (drawing.opacity === undefined || drawing.opacity >= 1) return out;
  return [{ t: 'group', opacity: drawing.opacity, children: out }];
}

/** Los recursos (imágenes) que usan unas primitivas, entrando en los grupos. */
function imageAssets(prims: readonly Prim[]): string[] {
  return prims.flatMap((p) => (p.t === 'image' ? [p.asset] : p.t === 'group' ? imageAssets(p.children) : []));
}

/** Alto con el que se maqueta un texto de alto automático (en la práctica, sin límite). */
const AUTO_HEIGHT_PROBE = 10_000;

/** Alto de `lines` renglones: el interlineado por defecto de `textIn` (1,3 veces el cuerpo). */
export function autoTextHeight(lines: number, sizePt: number): number {
  return Math.max(1, lines) * ptToMm(sizePt) * 1.3;
}

/** Caja agrandada para que sea fácil de tocar (se recorta a la página al resolver el enlace). */
function pad(r: Rect, mm: number): Rect {
  return { x: r.x - mm, y: r.y - mm, w: r.w + 2 * mm, h: r.h + 2 * mm };
}

/** Un nivel arriba: día y semana → su mes; páginas del mes → calendario anual; el resto → índice. */
function upTarget(plan: PagePlan): LinkTarget | null {
  const month = plan.params?.month as { y: number; m: number } | undefined;
  if (plan.type === 'weekLeft' || plan.type === 'weekRight' || plan.type === 'daily') return month ? { kind: 'month', y: month.y, m: month.m } : null;
  if (plan.type === 'filler' || plan.type === 'custom' || plan.type === 'toc' || plan.type === 'titlePage') return null;
  if (month) return { kind: 'year', y: month.y, m: month.m };
  return { kind: 'toc' };
}

/** Bloques de título que llevan un nivel arriba al tocarlos. */
const TITLE_BLOCKS = new Set(['header.title', 'week.title', 'cover.month', 'habits.title', 'habits.month']);

/** ¿El bloque tiene texto visible? (un título vacío no debe dejar una zona tocable invisible). */
function hasText(prims: Prim[]): boolean {
  return prims.some((p) => (p.t === 'text' ? p.run.text.trim() !== '' : p.t === 'group' ? hasText(p.children) : false));
}

function addUpLinks(ctx: LayoutContext, plan: PagePlan): void {
  const to = upTarget(plan);
  if (!to) return;
  const days = Array.isArray(plan.params?.days) ? (plan.params.days as string[]) : [];
  for (const b of ctx.blocks) {
    if (!hasText(b.prims)) continue;
    const head = /^daily\.(\d+)\.head$/.exec(b.id);
    if (head) {
      // El encabezado de un día lleva al mes de ese día (la página puede estar en la sección del mes siguiente).
      const iso = days[Number(head[1])];
      const [y, m] = (iso ?? '').split('-').map(Number);
      ctx.link(b.id, pad(b.bbox, 1), y && m ? { kind: 'month', y, m } : to, 'up');
    } else if (TITLE_BLOCKS.has(b.id)) ctx.link(b.id, pad(b.bbox, 1), to, 'up');
  }
}

/** Adónde lleva el número de página según los ajustes de enlaces. */
function pageNumberTarget(design: Design, plan: PagePlan, link: Design['links']['pageNumber']): LinkTarget | null {
  const month = plan.params?.month as { y: number; m: number } | undefined;
  switch (link) {
    case 'toc':
      return { kind: 'toc' };
    case 'year':
      return month ? { kind: 'year', y: month.y, m: month.m } : { kind: 'year', y: design.calendar.year };
    case 'month':
      return month ? { kind: 'month', y: month.y, m: month.m } : null;
    default:
      return null;
  }
}

function addChrome(ctx: LayoutContext, page: PagePlan, totalPages: number, pageNumberLink: Design['links']['pageNumber']): void {
  const d = ctx.doc.design;
  const pn = ctx.doc.binding.pageNumbers;
  const noChrome = new Set(['titlePage', 'monthCover', 'custom', 'cover']);
  if (pn.enabled && page.index >= pn.skipFirst && !noChrome.has(page.type) && page.index < totalPages) {
    const y = ctx.page.h - ctx.theme.margins.bottom / 2;
    const outerRight = ctx.page.side === 'recto';
    const x = pn.position === 'center' ? ctx.page.w / 2 : outerRight ? ctx.page.content.x + ctx.page.content.w : ctx.page.content.x;
    const align = pn.position === 'center' ? 'center' : outerRight ? 'right' : 'left';
    let t = ctx.textAt(String(page.index + 1), x, y, { role: 'number', size: 'labelSmall', align });
    // Si una marca de agua ocupa la esquina (el colibrí abajo y afuera), el número se corre hacia
    // adentro hasta quedar a 2 mm de ella en lugar de pegarse o encimarse.
    if (align !== 'center') {
      const pad = 1.5;
      const hits = ctx.blocks
        .filter((b) => b.role === 'watermark')
        .map((b) => b.bbox)
        .filter((r) => t.bbox.x < r.x + r.w + pad && t.bbox.x + t.bbox.w > r.x - pad && t.bbox.y < r.y + r.h + pad && t.bbox.y + t.bbox.h > r.y - pad);
      if (hits.length > 0) {
        const nx = align === 'right' ? Math.min(...hits.map((r) => r.x)) - 2 : Math.max(...hits.map((r) => r.x + r.w)) + 2;
        t = ctx.textAt(String(page.index + 1), nx, y, { role: 'number', size: 'labelSmall', align });
      }
    }
    const back = pageNumberTarget(d, page, pageNumberLink);
    ctx.add('chrome.pageNumber', 'Número de página', [t.prim], { role: 'chrome', layer: 18, ...(back ? { links: [{ ...pad(t.bbox, 1.5), to: back, cat: 'pageNumber' }] } : {}) });
  }
  const ti = ctx.doc.binding.thumbIndex;
  const month = page.params?.month as { y: number; m: number } | undefined;
  const months = ctx.doc.cal.months;
  const idx = month ? months.findIndex((mm) => mm.y === month.y && mm.m === month.m) : -1;
  // «Todos los meses»: índice completo en el borde (el mes de la página resaltado); en el PDF de
  // páginas cada pestaña lleva a su mes. Va en todas las páginas salvo la portada y las propias.
  const all = ti.months === 'all';
  if (ti.enabled && (idx >= 0 || (all && page.type !== 'titlePage' && page.type !== 'custom'))) {
    const area = inset({ x: 0, y: 0, w: ctx.page.w, h: ctx.page.h }, ctx.theme.margins.top, 0, ctx.theme.margins.bottom, 0);
    const tabH = area.h / months.length;
    const np = ctx.doc.binding.nonPrintable;
    const x = ctx.page.side === 'recto' ? ctx.page.w - np - ti.width : np;
    const prims: Prim[] = [];
    const links: LinkArea[] = [];
    const tab = (k: number, current: boolean): void => {
      const mm = months[k]!;
      const y = area.y + k * tabH;
      const label = mm.name.slice(0, 3).toLocaleUpperCase(ctx.doc.locale);
      prims.push(current ? { t: 'rect', x, y, w: ti.width, h: tabH, fill: { color: ctx.theme.colors.ink } } : { t: 'rect', x, y, w: ti.width, h: tabH, fill: ctx.fill('weekend'), stroke: ctx.stroke('hair', '#ffffff') });
      const run = ctx.run(label, { role: current ? 'labelStrong' : 'label', size: Math.min(6, ti.width * 1.6), tracking: 0.05 });
      prims.push({
        t: 'group',
        m: composeAll(translate(x + ti.width / 2, y + tabH / 2), rotateAround(ctx.page.side === 'recto' ? 90 : -90, 0, 0)),
        children: [{ t: 'text', run, x: -run.width / 2, y: run.capHeight / 2, color: current ? '#ffffff' : ctx.theme.colors.ink }],
      });
      links.push({ x, y, w: ti.width, h: tabH, to: { kind: 'month', y: mm.y, m: mm.m }, cat: all ? 'months' : 'up' });
    };
    if (all) months.forEach((_, k) => tab(k, k === idx));
    else tab(idx, true);
    ctx.add('chrome.thumb', all ? 'Índice de meses' : 'Pestaña del mes', prims, { role: 'chrome', layer: 18, editable: false, links });
  }
}

/** Un aviso por mensaje (la misma advertencia repetida en varios bloques se muestra una vez). */
export function dedupeWarnings(list: readonly PageWarning[]): PageWarning[] {
  return [...new Map(list.map((w) => [w.message, w])).values()];
}

/**
 * Maqueta una página: contenido de la sección, elementos propios, marcas de agua, numeración y
 * pestañas, y los ajustes del editor. Los avisos del resultado son los que salen al maquetar
 * (texto que no entra, ajustes que se acomodaron…); la verificación del contenido terminado
 * (fuera de la página, textos que se pisan, poca resolución) es `verifyPage`, que se pide aparte.
 */
export function layoutPage(
  doc: DocContext,
  plan: PagePlan,
  registry: ReadonlyMap<string, SectionModule>,
  totalPages: number,
  inputs: PageInputs = pageInputs(doc.design, plan),
): PageModel {
  const geom = pageGeometry(doc, plan.side);
  // Ajustes del editor por elemento. «Por tipo» en tipos que caen a ambos lados: X se espeja en las
  // páginas izquierdas (mover o ensanchar «hacia afuera» en una derecha es hacerlo hacia afuera
  // también en una izquierda: ahí crece hacia el otro lado, así que su borde izquierdo se corre).
  const adjuster: BoxAdjuster = (id) => {
    const o = findOverride(inputs.overrides, plan, id);
    if (!o || o.hidden) return undefined;
    const mirror = o.pageKey === null && plan.side === 'verso' && (doc.mirrorTypes?.has(plan.type) ?? false);
    return { dx: mirror ? -(o.dx + o.dw) : o.dx, dy: o.dy, dw: o.dw, dh: o.dh };
  };
  const ctx = new LayoutContext(doc, geom, pageTheme(doc, inputs.styles, plan), pageWritingStyle(inputs.styles, plan), adjuster);
  const mod = registry.get(plan.module);
  if (mod) {
    try {
      mod.layout(ctx, plan);
    } catch (err) {
      ctx.warn('layoutError', `Error al maquetar: ${(err as Error).message}`, { error: (err as Error).message });
    }
  }
  addUpLinks(ctx, plan);
  for (const cb of inputs.blocks) placeCustomBlock(ctx, cb, plan);
  for (const wm of inputs.watermarks) placeWatermark(ctx, wm);
  addChrome(ctx, plan, totalPages, inputs.pageNumberLink);
  // Los elementos que su sección no vuelve a maquetar en su caja se estiran al tamaño que les dio el
  // editor. Va antes del estilo de líneas: así los ornamentos se arman con el largo final de cada línea.
  for (const b of ctx.blocks) {
    if (b.box) continue;
    const a = adjuster(b.id);
    if (a && (a.dw !== 0 || a.dh !== 0)) stretchBlock(b, a);
  }
  // Estilo propio de cada elemento y, encima, el de líneas y ornamentos del tema (renglones,
  // separadores, tablas, marcos): el del elemento primero, así las guardas usan su grosor y su color.
  const styleOf = blockStyleMap(inputs.blockStyles, plan);
  for (const b of ctx.blocks) {
    const uses = strokeUses(b.prims);
    if (uses.length > 0) b.uses = uses;
    const st = styleOf.get(b.id);
    if (st) b.prims = applyBlockStyle(b.prims, st);
    const lines = st ? mergeLineTable(ctx.theme.lines, st.lines) : ctx.theme.lines;
    if (hasLineStyles(lines)) b.prims = applyLineStyles(b.prims, lines, doc.assets);
  }

  // Ajustes del editor.
  const blocks: Block[] = [];
  for (const b of ctx.blocks) {
    const o = findOverride(inputs.overrides, plan, b.id);
    if (o) {
      if (o.hidden) continue;
      const a = adjuster(b.id)!;
      // Con caja, el lugar ya está en el dibujo (la sección lo dibujó adentro): la matriz solo escala y gira.
      const pivot = b.box ?? b.bbox;
      let m = overrideMatrix(pivot, { dx: b.box ? 0 : a.dx, dy: b.box ? 0 : a.dy, scale: o.scale, scaleY: o.scaleY, rotation: o.rotation });
      const bounds = transformRect(m, pivot);
      // Mantener dentro de la página.
      const dx = bounds.x < 0 ? -bounds.x : bounds.x + bounds.w > geom.w ? geom.w - bounds.x - bounds.w : 0;
      const dy = bounds.y < 0 ? -bounds.y : bounds.y + bounds.h > geom.h ? geom.h - bounds.y - bounds.h : 0;
      if ((dx !== 0 || dy !== 0) && bounds.w <= geom.w && bounds.h <= geom.h) {
        m = compose(translate(dx, dy), m);
        ctx.warn('clamped', `«${b.label}» se acomodó para no salir de la página.`, { block: b.id, label: b.label });
      }
      b.m = m;
      if (o.deform) b.deform = true;
      if (o.opacity < 1) b.opacity = o.opacity;
    }
    // Capa, nombre y fusión propios (valen también para los elementos que no se mueven ni se escalan).
    if (o) {
      if (o.layer !== null) b.layer = o.layer;
      if (o.label) {
        b.label = o.label;
        b.renamed = true;
      }
      if (o.blend !== 'normal') b.blend = o.blend;
    }
    blocks.push(b);
  }
  blocks.sort((a, b) => a.layer - b.layer);

  return {
    key: plan.key,
    type: plan.type,
    index: plan.index,
    side: plan.side,
    w: geom.w,
    h: geom.h,
    content: geom.content,
    title: plan.title,
    group: plan.group,
    blocks,
    warnings: dedupeWarnings(ctx.warnings),
  };
}

/**
 * Verificación del contenido ya maquetado: dentro de la página, fuera de la zona que la impresora
 * no imprime, sin textos superpuestos y con imágenes de resolución suficiente. Mide la tinta de
 * cada glifo y compara los textos de a pares, por eso no corre en cada maquetación sino cuando
 * alguien la pide (verificación previa, exportación, servidor MCP, línea de comandos).
 */
export function verifyPage(doc: Pick<DocContext, 'design' | 'binding' | 'fonts' | 'assets'>, page: PageModel): PageWarning[] {
  const out: PageWarning[] = [];
  const warn = (code: PageWarning['code'], message: string, params: PageWarning['params'] = {}): void => void out.push({ code, params, message });
  const pageBox = { x: 0, y: 0, w: page.w, h: page.h };
  const np = doc.binding.nonPrintable;
  const safe = safeArea(doc.binding, page);
  const texts: Array<{ r: Rect; label: string; block: string }> = [];
  for (const b of page.blocks) {
    if (b.role === 'watermark' || b.role === 'chrome' || b.role === 'artwork') continue;
    const own = primsBounds(b.prims);
    const bounds = own ? (b.m ? transformRect(b.m, own) : own) : null;
    if (!bounds || (bounds.w === 0 && bounds.h === 0)) continue;
    if (!rectContains(pageBox, bounds, 0.05)) warn('offPage', `«${b.label}» sale de la página.`, { block: b.id, label: b.label });
    else if (!rectContains(safe, bounds, 0.05)) warn('nonPrintable', `«${b.label}» entra en la zona que la impresora no imprime (${np} mm del borde).`, { block: b.id, label: b.label, mm: np });
    collectTextBoxes(b.prims, b.m ?? IDENTITY, b.label, b.id, texts, doc.fonts);
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const c = texts[j]!;
      const ix = Math.min(a.r.x + a.r.w, c.r.x + c.r.w) - Math.max(a.r.x, c.r.x);
      const iy = Math.min(a.r.y + a.r.h, c.r.y + c.r.h) - Math.max(a.r.y, c.r.y);
      if (ix > 0.2 && iy > 0.2) warn('overlap', `Textos superpuestos: «${a.label}» y «${c.label}».`, { a: a.label, b: c.label });
    }
  }
  // Imágenes con poca resolución para el tamaño impreso.
  for (const b of page.blocks) {
    for (const im of findImages(b.prims)) {
      const info = doc.assets.get(im.asset);
      if (info?.pxWidth && im.w > 0) {
        const dpi = Math.round(info.pxWidth / (im.w / 25.4));
        if (dpi < 200) warn('lowDpi', `La imagen se imprime a ${dpi} ppp (se recomiendan 300 o más): se verá pixelada.`, { dpi });
      }
    }
  }
  return dedupeWarnings(out);
}

/** Aplana una página en primitivas (bloques ordenados con sus transformaciones). */
export function pagePrims(page: PageModel): Prim[] {
  return page.blocks.map((b) => {
    if (!b.m && b.opacity === undefined && b.blend === undefined) return { t: 'group', children: b.prims } satisfies Prim;
    return { t: 'group', children: b.prims, ...(b.m ? { m: b.m } : {}), ...(b.opacity !== undefined ? { opacity: b.opacity } : {}), ...(b.blend ? { blend: b.blend } : {}) } satisfies Prim;
  });
}

export { primsBounds };
