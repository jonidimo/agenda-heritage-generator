/**
 * Maquetación final de una página: contenido de la sección + bloques propios
 * del usuario + marcas de agua + numeración/pestañas + ajustes del editor
 * (mover, escalar, rotar, opacidad, ocultar) con verificación de límites.
 */
import type { BlockOverride, CustomBlock, Design, WatermarkPlacement } from '../design/schema';
import { fmt as fmtStr } from '../i18n';
import { inset } from '../layout/box';
import { LayoutContext, type DocContext } from '../layout/context';
import { primsBounds, type Block, type PageModel, type Prim } from '../layout/prims';
import { dotField, squareGrid, writingArea } from '../layout/widgets';
import type { PagePlan, SectionModule } from '../sections/types';
import { compose, composeAll, rectContains, rotateAround, scale, transformRect, translate, type Matrix, type Rect } from '../util/geometry';
import { assetPrims } from './assets';
import { pageGeometry } from './context';

export function findOverride(overrides: BlockOverride[], page: { key: string; type: string }, blockId: string): BlockOverride | undefined {
  return (
    overrides.find((o) => o.blockId === blockId && o.pageKey === page.key) ??
    overrides.find((o) => o.blockId === blockId && o.pageKey === null && o.pageType === page.type)
  );
}

export function overrideMatrix(bbox: Rect, o: Pick<BlockOverride, 'dx' | 'dy' | 'scale' | 'rotation'>): Matrix {
  const s = o.scale;
  return composeAll(
    translate(bbox.x + o.dx, bbox.y + o.dy),
    rotateAround(o.rotation, (bbox.w * s) / 2, (bbox.h * s) / 2),
    scale(s),
    translate(-bbox.x, -bbox.y),
  );
}

/** Caja final de un bloque (con su transformación). */
export function blockBounds(b: Block): Rect {
  return b.m ? transformRect(b.m, b.bbox) : b.bbox;
}

function watermarkApplies(wm: WatermarkPlacement, type: string): boolean {
  if (!wm.enabled) return false;
  if (wm.exclude.includes(type)) return false;
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

function substitute(text: string, ctx: LayoutContext, page: PagePlan): string {
  const d = ctx.doc.design;
  return fmtStr(text, {
    year: d.calendar.year,
    name: d.persona.name,
    title: d.persona.title,
    month: String(page.params?.monthName ?? ''),
    week: String(page.params?.weekNumber ?? ''),
    page: page.index + 1,
  });
}

function placeCustomBlock(ctx: LayoutContext, cb: CustomBlock, page: PagePlan): void {
  const x = cb.mirror && ctx.page.side === 'verso' ? ctx.page.w - cb.x - cb.w : cb.x;
  const box = { x, y: cb.y, w: cb.w, h: cb.h };
  const p = cb.props as Record<string, unknown>;
  let prims: Prim[] = [];
  switch (cb.kind) {
    case 'text': {
      const t = ctx.textIn(substitute(String(p.text ?? ''), ctx, page), box, {
        role: (p.role as 'body') ?? 'body',
        size: (p.size as number) ?? ctx.theme.sizes.body,
        align: (p.align as 'left') ?? 'left',
        valign: (p.valign as 'top') ?? 'top',
        upper: Boolean(p.upper),
        tracking: typeof p.tracking === 'number' ? p.tracking : 0,
        wrap: p.wrap !== false,
        fit: true,
        ...(typeof p.color === 'string' ? { color: p.color } : {}),
      });
      prims = t.prims;
      break;
    }
    case 'image':
      prims = assetPrims(ctx.doc.assets.get(String(p.assetId ?? '')), box, {
        fit: (p.fit as 'contain') ?? 'contain',
        opacity: typeof p.opacity === 'number' ? p.opacity : 1,
        minStrokePt: 0.25,
      });
      break;
    case 'lines':
      prims = writingArea(ctx, box, 'lines', typeof p.pitch === 'number' ? p.pitch : undefined);
      break;
    case 'dots':
      prims = [dotField(box, typeof p.pitch === 'number' ? p.pitch : ctx.theme.dots.pitch, (ctx.theme.dots.radius * 25.4) / 72, ctx.theme.dots.color)];
      break;
    case 'grid':
      prims = squareGrid(box, typeof p.pitch === 'number' ? p.pitch : 5, ctx.stroke('grid'));
      break;
    case 'rect':
      prims = [{ t: 'rect', ...box, r: typeof p.radius === 'number' ? p.radius : 0, stroke: ctx.stroke('rule', 'ink'), ...(p.fill ? { fill: { color: String(p.fill) } } : {}) }];
      break;
    case 'line':
      prims = [{ t: 'line', x1: box.x, y1: box.y + box.h / 2, x2: box.x + box.w, y2: box.y + box.h / 2, stroke: ctx.stroke('rule', 'ink') }];
      break;
  }
  ctx.add(`custom.${cb.id}`, String(p.label ?? 'Elemento propio'), prims, { role: 'custom', layer: 15, bbox: box });
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
    const t = ctx.textAt(String(page.index + 1), x, y, { role: 'number', size: 'labelSmall', align });
    ctx.add('chrome.pageNumber', 'Número de página', [t.prim], { role: 'chrome', layer: 18 });
  }
  const ti = d.binding.thumbIndex;
  const month = page.params?.month as { y: number; m: number } | undefined;
  if (ti.enabled && month) {
    const idx = ctx.doc.cal.months.findIndex((mm) => mm.y === month.y && mm.m === month.m);
    if (idx >= 0) {
      const count = ctx.doc.cal.months.length;
      const area = inset({ x: 0, y: 0, w: ctx.page.w, h: ctx.page.h }, ctx.theme.margins.top, 0, ctx.theme.margins.bottom, 0);
      const tabH = area.h / count;
      const np = d.binding.nonPrintable;
      const x = ctx.page.side === 'recto' ? ctx.page.w - np - ti.width : np;
      const y = area.y + idx * tabH;
      const label = ctx.doc.cal.months[idx]!.name.slice(0, 3).toLocaleUpperCase(ctx.doc.locale);
      const prims: Prim[] = [{ t: 'rect', x, y, w: ti.width, h: tabH, fill: { color: ctx.theme.colors.ink } }];
      const run = ctx.run(label, { role: 'labelStrong', size: Math.min(6, ti.width * 1.6), tracking: 0.05 });
      prims.push({
        t: 'group',
        m: composeAll(translate(x + ti.width / 2, y + tabH / 2), rotateAround(ctx.page.side === 'recto' ? 90 : -90, 0, 0)),
        children: [{ t: 'text', run, x: -run.width / 2, y: run.capHeight / 2, color: '#ffffff' }],
      });
      ctx.add('chrome.thumb', 'Pestaña del mes', prims, { role: 'chrome', layer: 18, editable: false });
    }
  }
}

export interface LayoutResult {
  page: PageModel;
}

export function layoutPage(doc: DocContext, plan: PagePlan, registry: ReadonlyMap<string, SectionModule>, totalPages: number): PageModel {
  const geom = pageGeometry(doc, plan.side);
  const ctx = new LayoutContext(doc, geom);
  const design: Design = doc.design;
  const mod = registry.get(plan.module);
  if (mod) {
    try {
      mod.layout(ctx, plan);
    } catch (err) {
      ctx.warn(`Error al maquetar: ${(err as Error).message}`);
    }
  }
  for (const cb of design.customBlocks) {
    if (cb.pageType === plan.type && (cb.pageKey === null || cb.pageKey === plan.key)) placeCustomBlock(ctx, cb, plan);
  }
  for (const wm of design.watermarks) if (watermarkApplies(wm, plan.type)) placeWatermark(ctx, wm);
  addChrome(ctx, plan, totalPages);

  // Ajustes del editor.
  const pageBox = { x: 0, y: 0, w: geom.w, h: geom.h };
  const blocks: Block[] = [];
  for (const b of ctx.blocks) {
    const o = findOverride(design.overrides, plan, b.id);
    if (o) {
      if (o.hidden) continue;
      let m = overrideMatrix(b.bbox, o);
      let bounds = transformRect(m, b.bbox);
      // Mantener dentro de la página.
      const dx = bounds.x < 0 ? -bounds.x : bounds.x + bounds.w > geom.w ? geom.w - bounds.x - bounds.w : 0;
      const dy = bounds.y < 0 ? -bounds.y : bounds.y + bounds.h > geom.h ? geom.h - bounds.y - bounds.h : 0;
      if ((dx !== 0 || dy !== 0) && bounds.w <= geom.w && bounds.h <= geom.h) {
        m = compose(translate(dx, dy), m);
        bounds = transformRect(m, b.bbox);
        ctx.warn(`«${b.label}» se acomodó para no salir de la página.`);
      }
      b.m = m;
      if (o.opacity < 1) b.opacity = o.opacity;
    }
    blocks.push(b);
  }
  blocks.sort((a, b) => a.layer - b.layer);

  // Verificación: contenido dentro de la página y fuera de la zona no imprimible.
  const np = design.binding.nonPrintable;
  const safe = inset(pageBox, np, geom.side === 'recto' ? np : 0, np, geom.side === 'recto' ? 0 : np);
  for (const b of blocks) {
    if (b.role === 'watermark' || b.role === 'chrome' || b.role === 'artwork') continue;
    const bounds = blockBounds(b);
    if (bounds.w === 0 && bounds.h === 0) continue;
    if (!rectContains(pageBox, bounds, 0.05)) ctx.warn(`«${b.label}» sale de la página.`);
    else if (!rectContains(safe, bounds, 0.05)) ctx.warn(`«${b.label}» entra en la zona que la impresora no imprime (${np} mm del borde).`);
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
    warnings: [...new Set(ctx.warnings)],
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
