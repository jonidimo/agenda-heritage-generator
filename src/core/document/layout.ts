/**
 * Maquetación final de una página: contenido de la sección + bloques propios
 * del usuario + marcas de agua + numeración/pestañas + ajustes del editor
 * (mover, escalar, rotar, opacidad, ocultar) con verificación de límites.
 */
import { enumProp, IMAGE_FITS, numProp, PROP_RANGES, TEXT_ALIGNS, TEXT_ROLES, TEXT_VALIGNS } from '../design/customBlocks';
import type { BlockOverride, CustomBlock, Design, WatermarkPlacement } from '../design/schema';
import { fmt as fmtStr } from '../i18n';
import { inset } from '../layout/box';
import { LayoutContext, type DocContext } from '../layout/context';
import { primsBounds, type Block, type LinkArea, type LinkTarget, type PageModel, type Prim } from '../layout/prims';
import { dotField, ruledLines, squareGrid } from '../layout/widgets';
import type { PagePlan, SectionModule } from '../sections/types';
import { compose, composeAll, IDENTITY, rectContains, rotateAround, scale, transformRect, translate, type Matrix, type Rect } from '../util/geometry';
import { inkBounds } from '../text/shape';
import { mergeTokens, type ThemeTokens, type WritingStyle } from '../design/themes';
import { normalizeColor } from '../util/color';
import { parseFontSpec, type FontRegistry } from '../text/fonts';
import { assetPrims } from './assets';
import { pageGeometry } from './context';
import { pageTextVars } from '../sections/common';
import { applyLineStyles, hasLineStyles } from './linestyle';

export function findOverride(overrides: BlockOverride[], page: { key: string; type: string }, blockId: string): BlockOverride | undefined {
  return (
    overrides.find((o) => o.blockId === blockId && o.pageKey === page.key) ??
    overrides.find((o) => o.blockId === blockId && o.pageKey === null && o.pageType === page.type)
  );
}

export function overrideMatrix(bbox: Rect, o: Pick<BlockOverride, 'dx' | 'dy' | 'scale' | 'rotation'>, mirrorX = false): Matrix {
  const s = o.scale;
  const dx = mirrorX ? -o.dx : o.dx;
  return composeAll(
    translate(bbox.x + dx, bbox.y + o.dy),
    rotateAround(o.rotation, (bbox.w * s) / 2, (bbox.h * s) / 2),
    scale(s),
    translate(-bbox.x, -bbox.y),
  );
}

/** Caja final de un bloque (con su transformación). */
export function blockBounds(b: Block): Rect {
  return b.m ? transformRect(b.m, b.bbox) : b.bbox;
}

/** Estilo de escritura elegido explícitamente para la página (o su tipo), si lo hay. */
function pageWritingStyle(doc: DocContext, plan: PagePlan): WritingStyle | undefined {
  const pick = (s: { tokens: Record<string, unknown> } | undefined): WritingStyle | undefined => (s?.tokens.writing as { style?: WritingStyle } | undefined)?.style;
  const styles = doc.design.pageStyles.filter((s) => s.pageType === plan.type);
  return pick(styles.find((s) => s.pageKey === plan.key)) ?? pick(styles.find((s) => s.pageKey === null));
}

/** Tema de una página: el del documento más el estilo de escritura de su tipo y, encima, el de la página. */
function pageTheme(doc: DocContext, plan: PagePlan): ThemeTokens | undefined {
  const styles = doc.design.pageStyles.filter((s) => s.pageType === plan.type && (s.pageKey === null || s.pageKey === plan.key));
  if (styles.length === 0) return undefined;
  const byType = styles.find((s) => s.pageKey === null);
  const byPage = styles.find((s) => s.pageKey === plan.key);
  let theme = doc.theme;
  if (byType) theme = mergeTokens(theme, byType.tokens);
  if (byPage) theme = mergeTokens(theme, byPage.tokens);
  return theme;
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
  const box = { x, y: cb.y, w: cb.w, h: cb.h };
  const p = cb.props as Record<string, unknown>;
  let prims: Prim[] = [];
  switch (cb.kind) {
    case 'text': {
      const t = ctx.textIn(substitute(String(p.text ?? ''), ctx, page), box, {
        role: enumProp(p.role, TEXT_ROLES, 'body'),
        size: numProp(p.size, PROP_RANGES.textSize, ctx.theme.sizes.body),
        align: enumProp(p.align, TEXT_ALIGNS, 'left'),
        valign: enumProp(p.valign, TEXT_VALIGNS, 'top'),
        upper: Boolean(p.upper),
        tracking: numProp(p.tracking, PROP_RANGES.tracking, 0),
        wrap: p.wrap !== false,
        fit: true,
        ...(normalizeColor(p.color) ? { color: normalizeColor(p.color)! } : {}),
        // Fuente propia del elemento (si no, la de su tipo de texto).
        ...(parseFontSpec(p.font) ? { font: parseFontSpec(p.font)! } : {}),
      });
      prims = t.prims;
      break;
    }
    case 'image':
      prims = assetPrims(ctx.doc.assets.get(String(p.assetId ?? '')), box, {
        fit: enumProp(p.fit, IMAGE_FITS, 'contain'),
        opacity: numProp(p.opacity, PROP_RANGES.opacity, 1),
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
      prims = squareGrid(box, numProp(p.pitch, PROP_RANGES.pitch, 5), ctx.stroke('grid'));
      break;
    case 'rect':
      prims = [{ t: 'rect', ...box, r: numProp(p.radius, PROP_RANGES.radius, 0), stroke: ctx.stroke('rule', 'ink', { use: 'frame' }), ...(normalizeColor(p.fill) ? { fill: { color: normalizeColor(p.fill)! } } : {}) }];
      break;
    case 'line':
      prims = [{ t: 'line', x1: box.x, y1: box.y + box.h / 2, x2: box.x + box.w, y2: box.y + box.h / 2, stroke: ctx.stroke('rule', 'ink', { use: 'separator' }) }];
      break;
  }
  ctx.add(`custom.${cb.id}`, String(p.label ?? 'Elemento propio'), prims, { role: 'custom', layer: 15, bbox: box });
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
function pageNumberTarget(design: Design, plan: PagePlan): LinkTarget | null {
  const month = plan.params?.month as { y: number; m: number } | undefined;
  switch (design.links.pageNumber) {
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

function addChrome(ctx: LayoutContext, page: PagePlan, totalPages: number): void {
  const d = ctx.doc.design;
  const pn = d.binding.pageNumbers;
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
    const back = pageNumberTarget(d, page);
    ctx.add('chrome.pageNumber', 'Número de página', [t.prim], { role: 'chrome', layer: 18, ...(back ? { links: [{ ...pad(t.bbox, 1.5), to: back, cat: 'pageNumber' }] } : {}) });
  }
  const ti = d.binding.thumbIndex;
  const month = page.params?.month as { y: number; m: number } | undefined;
  const months = ctx.doc.cal.months;
  const idx = month ? months.findIndex((mm) => mm.y === month.y && mm.m === month.m) : -1;
  // «Todos los meses»: índice completo en el borde (el mes de la página resaltado); en el PDF de
  // páginas cada pestaña lleva a su mes. Va en todas las páginas salvo la portada y las propias.
  const all = ti.months === 'all';
  if (ti.enabled && (idx >= 0 || (all && page.type !== 'titlePage' && page.type !== 'custom'))) {
    const area = inset({ x: 0, y: 0, w: ctx.page.w, h: ctx.page.h }, ctx.theme.margins.top, 0, ctx.theme.margins.bottom, 0);
    const tabH = area.h / months.length;
    const np = d.binding.nonPrintable;
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

export interface LayoutResult {
  page: PageModel;
}

export function layoutPage(doc: DocContext, plan: PagePlan, registry: ReadonlyMap<string, SectionModule>, totalPages: number): PageModel {
  const geom = pageGeometry(doc, plan.side);
  const ctx = new LayoutContext(doc, geom, pageTheme(doc, plan), pageWritingStyle(doc, plan));
  const design: Design = doc.design;
  const mod = registry.get(plan.module);
  if (mod) {
    try {
      mod.layout(ctx, plan);
    } catch (err) {
      ctx.warn('layoutError', `Error al maquetar: ${(err as Error).message}`, { error: (err as Error).message });
    }
  }
  addUpLinks(ctx, plan);
  for (const cb of design.customBlocks) {
    if (cb.pageType === plan.type && (cb.pageKey === null || cb.pageKey === plan.key)) placeCustomBlock(ctx, cb, plan);
  }
  for (const wm of design.watermarks) if (watermarkApplies(wm, plan.type, plan.key)) placeWatermark(ctx, wm);
  addChrome(ctx, plan, totalPages);
  // Estilo de líneas y ornamentos del tema (renglones, separadores, tablas, marcos).
  if (hasLineStyles(ctx.theme.lines)) for (const b of ctx.blocks) b.prims = applyLineStyles(b.prims, ctx.theme.lines, doc.assets);

  // Ajustes del editor.
  const pageBox = { x: 0, y: 0, w: geom.w, h: geom.h };
  const blocks: Block[] = [];
  for (const b of ctx.blocks) {
    const o = findOverride(design.overrides, plan, b.id);
    if (o) {
      if (o.hidden) continue;
      // Ajustes «por tipo» en tipos que caen a ambos lados: X se espeja en las páginas izquierdas
      // (mover «hacia afuera» en una derecha es mover hacia afuera también en una izquierda).
      const mirror = o.pageKey === null && plan.side === 'verso' && (doc.mirrorTypes?.has(plan.type) ?? false);
      let m = overrideMatrix(b.bbox, o, mirror);
      const bounds = transformRect(m, b.bbox);
      // Mantener dentro de la página.
      const dx = bounds.x < 0 ? -bounds.x : bounds.x + bounds.w > geom.w ? geom.w - bounds.x - bounds.w : 0;
      const dy = bounds.y < 0 ? -bounds.y : bounds.y + bounds.h > geom.h ? geom.h - bounds.y - bounds.h : 0;
      if ((dx !== 0 || dy !== 0) && bounds.w <= geom.w && bounds.h <= geom.h) {
        m = compose(translate(dx, dy), m);
        ctx.warn('clamped', `«${b.label}» se acomodó para no salir de la página.`, { block: b.id, label: b.label });
      }
      b.m = m;
      if (o.opacity < 1) b.opacity = o.opacity;
    }
    blocks.push(b);
  }
  blocks.sort((a, b) => a.layer - b.layer);

  // Verificación: contenido real dentro de la página, fuera de la zona no imprimible y sin textos superpuestos.
  const np = design.binding.nonPrintable;
  const allEdges = design.binding.method === 'single' || design.binding.method === 'cut-stack';
  const safe = allEdges ? inset(pageBox, np) : inset(pageBox, np, geom.side === 'recto' ? np : 0, np, geom.side === 'recto' ? 0 : np);
  const texts: Array<{ r: Rect; label: string; block: string }> = [];
  for (const b of blocks) {
    if (b.role === 'watermark' || b.role === 'chrome' || b.role === 'artwork') continue;
    const own = primsBounds(b.prims);
    const bounds = own ? (b.m ? transformRect(b.m, own) : own) : null;
    if (!bounds || (bounds.w === 0 && bounds.h === 0)) continue;
    if (!rectContains(pageBox, bounds, 0.05)) ctx.warn('offPage', `«${b.label}» sale de la página.`, { block: b.id, label: b.label });
    else if (!rectContains(safe, bounds, 0.05)) ctx.warn('nonPrintable', `«${b.label}» entra en la zona que la impresora no imprime (${np} mm del borde).`, { block: b.id, label: b.label, mm: np });
    collectTextBoxes(b.prims, b.m ?? IDENTITY, b.label, b.id, texts, doc.fonts);
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const c = texts[j]!;
      const ix = Math.min(a.r.x + a.r.w, c.r.x + c.r.w) - Math.max(a.r.x, c.r.x);
      const iy = Math.min(a.r.y + a.r.h, c.r.y + c.r.h) - Math.max(a.r.y, c.r.y);
      if (ix > 0.2 && iy > 0.2) ctx.warn('overlap', `Textos superpuestos: «${a.label}» y «${c.label}».`, { a: a.label, b: c.label });
    }
  }
  // Imágenes con poca resolución para el tamaño impreso.
  for (const b of blocks) {
    for (const im of findImages(b.prims)) {
      const info = doc.assets.get(im.asset);
      if (info?.pxWidth && im.w > 0) {
        const dpi = Math.round(info.pxWidth / (im.w / 25.4));
        if (dpi < 200) ctx.warn('lowDpi', `La imagen se imprime a ${dpi} ppp (se recomiendan 300 o más): se verá pixelada.`, { dpi });
      }
    }
  }
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
    warnings: [...new Map(ctx.warnings.map((w) => [w.message, w])).values()],
  };
}

/** Aplana una página en primitivas (bloques ordenados con sus transformaciones). */
export function pagePrims(page: PageModel): Prim[] {
  return page.blocks.map((b) => {
    if (!b.m && b.opacity === undefined) return { t: 'group', children: b.prims } satisfies Prim;
    return { t: 'group', children: b.prims, ...(b.m ? { m: b.m } : {}), ...(b.opacity !== undefined ? { opacity: b.opacity } : {}) } satisfies Prim;
  });
}

export { primsBounds };
