/**
 * Acciones de edición sobre el diseño a partir de lo que el usuario hace en el
 * lienzo: mover, escalar, ocultar o restablecer bloques; mover marcas de agua y
 * elementos propios respetando sus anclajes y su espejado.
 */
import type { BlockLineKey, BlockLineStyle, BlockLink, BlockOverride, BlockStyle, CustomBlock, Design } from '@core/design/schema';
import { newId } from '@core/util/hash';
import { readTextSource, writeTextSource } from '@core/design/textSource';
import { resolveStrings } from '@core/i18n';
import { withPageStyle } from '@core/design/pageStyles';
import type { Block, PageModel, TextSource } from '@core/layout/prims';
import type { Rect } from '@core/util/geometry';
import { blockBounds, findOverride as appliedOverride } from '@core/document/layout';
import { deformable } from '@core/layout/handles';
import { axisScales, deformScales, MIN_BOX, naturalBox, storeAdjust, visualToBox, type BoxAdjust } from '@core/layout/box';
import { alignDeltas, centerGroupDeltas, distributeDeltas, tidyGridDeltas, unionRect, type AlignMode, type Delta } from '@core/layout/align';
import { current, type Draft } from 'immer';
import { documentFor } from './doc';
import { useStore, type Recipe } from './store';

export type Scope = 'type' | 'page';

function effectiveScope(page: PageModel, scope: Scope): Scope {
  // Las páginas propias y los rellenos son únicos: siempre por página.
  return page.type === 'custom' ? 'page' : scope;
}

/**
 * ¿Los ajustes «por tipo» de esta página se espejan en X? Pasa en las páginas izquierdas de
 * tipos que caen a ambos lados (p. ej. notas): mover «hacia afuera» en una es hacia afuera en todas.
 */
export function typeMirrored(page: PageModel): boolean {
  if (page.side !== 'verso' || page.type === 'custom') return false;
  const s = useStore.getState();
  if (!s.design) return false;
  return documentFor(s.design, s.resVersion).doc?.ctx.mirrorTypes?.has(page.type) ?? false;
}

function findOverride(d: Draft<Design>, page: PageModel, blockId: string, scope: Scope): Draft<BlockOverride> | undefined {
  const key = scope === 'page' ? page.key : null;
  return d.overrides.find((o) => o.blockId === blockId && o.pageType === page.type && o.pageKey === key);
}

function upsertOverride(d: Draft<Design>, page: PageModel, blockId: string, scope: Scope, patch: (o: Draft<BlockOverride>) => void, mirrored = false): void {
  let o = findOverride(d, page, blockId, scope);
  if (!o) {
    // Si se crea uno por página y existe uno por tipo, parte de sus valores (tal como se ven en esta página).
    const base = scope === 'page' ? d.overrides.find((x) => x.blockId === blockId && x.pageType === page.type && x.pageKey === null) : undefined;
    d.overrides.push({
      pageType: page.type,
      pageKey: scope === 'page' ? page.key : null,
      blockId,
      dx: base ? (mirrored ? -(base.dx + base.dw) : base.dx) : 0,
      dy: base?.dy ?? 0,
      dw: base?.dw ?? 0,
      dh: base?.dh ?? 0,
      scale: base?.scale ?? 1,
      scaleY: base?.scaleY ?? null,
      deform: base?.deform ?? false,
      rotation: base?.rotation ?? 0,
      opacity: base?.opacity ?? 1,
      hidden: base?.hidden ?? false,
    });
    o = d.overrides[d.overrides.length - 1]!;
  }
  patch(o);
}

function anchorRight(hAnchor: string, page: PageModel): boolean | null {
  if (hAnchor === 'outer') return page.side === 'recto';
  if (hAnchor === 'inner') return page.side === 'verso';
  if (hAnchor === 'right') return true;
  if (hAnchor === 'left') return false;
  return null;
}

/**
 * Limita un desplazamiento para que un bloque que entra en la página no salga de ella
 * (el documento lo acomodaría igual: así lo guardado coincide con lo que se ve).
 */
export function clampMoveDelta(page: Pick<PageModel, 'w' | 'h'>, o: Rect, dx: number, dy: number): { dx: number; dy: number } {
  const cx = o.w <= page.w ? Math.min(page.w - o.x - o.w, Math.max(-o.x, dx)) : dx;
  const cy = o.h <= page.h ? Math.min(page.h - o.y - o.h, Math.max(-o.y, dy)) : dy;
  return { dx: cx, dy: cy };
}

const r2 = (v: number): number => Number(v.toFixed(2));

/** Aplica un desplazamiento a un bloque dentro de un borrador del diseño (sin crear un paso de historial). */
function moveInDraft(d: Draft<Design>, page: PageModel, block: Block, dx: number, dy: number, sc: Scope, mirrored: boolean): void {
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
  if (block.role === 'watermark' && block.id.startsWith('wm.')) {
    const wm = d.watermarks.find((w) => w.id === block.id.slice(3));
    if (!wm) return;
    const right = anchorRight(wm.hAnchor, page);
    wm.dx = r2(right === true ? wm.dx - dx : wm.dx + dx);
    wm.dy = r2(wm.vAnchor === 'bottom' ? wm.dy - dy : wm.dy + dy);
    return;
  }
  if (block.role === 'custom' && block.id.startsWith('custom.')) {
    const cb = d.customBlocks.find((c) => c.id === block.id.slice(7));
    if (!cb) return;
    const flipped = cb.mirror && page.side === 'verso';
    cb.x = r2(flipped ? cb.x - dx : cb.x + dx);
    cb.y = r2(cb.y + dy);
    return;
  }
  const flip = sc === 'type' && mirrored;
  upsertOverride(
    d,
    page,
    block.id,
    sc,
    (o) => {
      o.dx = r2(o.dx + (flip ? -dx : dx));
      o.dy = r2(o.dy + dy);
    },
    mirrored,
  );
  // «Todas las páginas» desde una página que tiene su propio ajuste: ese ajuste manda en
  // esta página, así que también se mueve (si no, lo arrastrado no se movería en pantalla).
  const own = sc === 'type' ? findOverride(d, page, block.id, 'page') : undefined;
  if (own) {
    own.dx = r2(own.dx + dx);
    own.dy = r2(own.dy + dy);
  }
}

/** Desplaza un bloque (dx, dy en mm de página). */
export function moveBlock(page: PageModel, block: Block, dx: number, dy: number, scope: Scope, coalesce?: string): void {
  moveBlocks(page, [{ block, dx, dy }], scope, coalesce);
}

/** Desplaza varios bloques en un solo paso de la historia (deshacer los vuelve a todos). */
export function moveBlocks(page: PageModel, moves: Array<{ block: Block; dx: number; dy: number }>, scope: Scope, coalesce?: string): void {
  // Un elemento maquetado dentro de la caja de otro que también se mueve ya lo sigue: no se mueve de nuevo.
  const ids = new Set(moves.map((m) => m.block.id));
  const real = moves.filter((m) => (Math.abs(m.dx) >= 1e-4 || Math.abs(m.dy) >= 1e-4) && !(m.block.parent && ids.has(m.block.parent)));
  if (real.length === 0) return;
  const sc = effectiveScope(page, scope);
  const mirrored = typeMirrored(page);
  useStore.getState().update((d) => {
    for (const m of real) moveInDraft(d, page, m.block, m.dx, m.dy, sc, mirrored);
  }, coalesce);
}

/** Referencia para alinear: la caja de la selección, los márgenes de la página o la página entera. */
export type AlignRef = 'selection' | 'margins' | 'page';

function refRect(page: PageModel, rects: Rect[], ref: AlignRef): Rect {
  if (ref === 'margins') return page.content;
  if (ref === 'page') return { x: 0, y: 0, w: page.w, h: page.h };
  return unionRect(rects);
}

function applyDeltas(page: PageModel, blocks: Block[], deltas: Delta[], scope: Scope): void {
  moveBlocks(
    page,
    blocks.map((block, i) => {
      const c = clampMoveDelta(page, blockBounds(block), deltas[i]!.dx, deltas[i]!.dy);
      return { block, dx: c.dx, dy: c.dy };
    }),
    scope,
  );
}

export function alignBlocks(page: PageModel, blocks: Block[], mode: AlignMode, ref: AlignRef, scope: Scope): void {
  const rects = blocks.map(blockBounds);
  // Un solo elemento se alinea con los márgenes aunque se pida «la selección».
  applyDeltas(page, blocks, alignDeltas(rects, mode, refRect(page, rects, blocks.length === 1 && ref === 'selection' ? 'margins' : ref)), scope);
}

export function distributeBlocks(page: PageModel, blocks: Block[], axis: 'x' | 'y', scope: Scope): void {
  applyDeltas(page, blocks, distributeDeltas(blocks.map(blockBounds), axis), scope);
}

export function centerBlocks(page: PageModel, blocks: Block[], ref: Exclude<AlignRef, 'selection'>, axis: 'x' | 'y' | 'both', scope: Scope): void {
  const rects = blocks.map(blockBounds);
  applyDeltas(page, blocks, centerGroupDeltas(rects, refRect(page, rects, ref), axis), scope);
}

export function tidyBlocks(page: PageModel, blocks: Block[], scope: Scope): void {
  applyDeltas(page, blocks, tidyGridDeltas(blocks.map(blockBounds)), scope);
}

/** Iguala la escala de los bloques a la del principal (o a 1 si no tiene ajuste). */
export function matchScale(page: PageModel, blocks: Block[], primary: Block, scope: Scope): void {
  const design = useStore.getState().design;
  if (!design) return;
  const target = currentOverride(design, page, primary.id, 'page')?.scale ?? currentOverride(design, page, primary.id, 'type')?.scale ?? 1;
  const mirrored = typeMirrored(page);
  const sc = effectiveScope(page, scope);
  useStore.getState().update((d) => {
    for (const b of blocks) {
      if (b.id === primary.id || b.role === 'watermark' || b.role === 'custom') continue;
      upsertOverride(d, page, b.id, sc, (o) => void ((o.scale = target), (o.scaleY = null)), mirrored);
      const own = sc === 'type' ? findOverride(d, page, b.id, 'page') : undefined;
      if (own) {
        own.scale = target;
        own.scaleY = null;
      }
    }
  });
}

/** Restablece varios bloques (quita sus ajustes en el alcance elegido) en un solo paso. */
export function resetBlocks(page: PageModel, ids: string[], scope: Scope): void {
  useStore.getState().update((d) => {
    const key = effectiveScope(page, scope) === 'page' ? page.key : null;
    d.overrides = d.overrides.filter((o) => !(ids.includes(o.blockId) && o.pageType === page.type && o.pageKey === key));
  });
}

/** Bloques de la página cuyo id comparte prefijo con este (los doce meses, los siete días…). */
export function similarBlocks(page: PageModel, block: Block): Block[] {
  // El mismo id con otros números: `birthdays.1` … `birthdays.12`, `daily.2.notes`, `goal.3`.
  const pattern = new RegExp(`^${block.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\d+/g, '\\d+')}$`);
  return [block, ...page.blocks.filter((b) => b.id !== block.id && b.editable && b.role === block.role && pattern.test(b.id))];
}

/* ---------- Estilo de escritura por tipo de página o por página ---------- */

export function pageStyleOf(design: Design, page: PageModel, scope: Scope): Record<string, unknown> {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  return design.pageStyles.find((s) => s.pageType === page.type && s.pageKey === key)?.tokens ?? {};
}

/**
 * Cambia un valor del estilo de escritura (p. ej. `['dots', 'pitch']`) para el tipo o la página.
 * Con `undefined` lo quita (el valor vuelve a salir del tema) y descarta lo que quede vacío.
 */
export function pageStyleRecipe(page: PageModel, scope: Scope, path: string[], value: unknown): Recipe {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  return (d) => void (d.pageStyles = withPageStyle(current(d.pageStyles), { pageType: page.type, pageKey: key }, path, value));
}

export function setPageStyle(page: PageModel, scope: Scope, path: string[], value: unknown, coalesce?: string): void {
  useStore.getState().update(pageStyleRecipe(page, scope, path, value), coalesce);
}

export function resetPageStyle(page: PageModel, scope: Scope): void {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  useStore.getState().update((d) => void (d.pageStyles = d.pageStyles.filter((s) => !(s.pageType === page.type && s.pageKey === key))));
}

/**
 * Escala un bloque por un factor. Marcas de agua y elementos propios cambian su tamaño real y
 * corrigen su anclaje para que la esquina superior izquierda quede donde la mostró la vista previa.
 */
/**
 * Nuevo tamaño y lugar de un elemento propio (la caja tal como se ve en esta página). En una página
 * izquierda, un elemento espejado guarda su posición como la de la página derecha.
 */
export function resizeCustomRecipe(page: PageModel, block: Block, box: Rect): Recipe {
  return (d) => {
    if (block.role !== 'custom' || !block.id.startsWith('custom.')) return;
    const cb = d.customBlocks.find((c) => c.id === block.id.slice(7));
    if (!cb) return;
    cb.x = r2(cb.mirror && page.side === 'verso' ? page.w - box.x - box.w : box.x);
    cb.y = r2(box.y);
    cb.w = r2(Math.max(0.5, box.w));
    // Con alto automático, `box.h` es el de los renglones: solo se guarda si el usuario lo cambió
    // (entonces el alto deja de ser automático).
    if (cb.props.autoHeight === true) {
      if (Math.abs(box.h - block.bbox.h) < 0.01) return;
      cb.props = { ...cb.props, autoHeight: false };
    }
    cb.h = r2(Math.max(0.5, box.h));
  };
}

export function resizeCustomBlock(page: PageModel, block: Block, box: Rect, coalesce?: string): void {
  if (block.role !== 'custom' || !block.id.startsWith('custom.')) return;
  useStore.getState().update(resizeCustomRecipe(page, block, box), coalesce);
}

/** Receta que pone `value` en la propiedad de la que sale un texto (ver `TextSource`). */
export function textSourceRecipe(source: TextSource, value: string): Recipe {
  return (d) => writeTextSource(d, source, value, resolveStrings(d.locale));
}

/** El texto tal como se edita: el crudo, con variables, sin mayúsculas. */
export function textSourceValue(design: Design, source: TextSource): string {
  return readTextSource(design, source, resolveStrings(design.locale));
}

export function scaleBlock(page: PageModel, block: Block, factor: number, scope: Scope, coalesce?: string): void {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useStore.getState().update((d) => {
    if (block.role === 'watermark' && block.id.startsWith('wm.')) {
      const wm = d.watermarks.find((w) => w.id === block.id.slice(3));
      if (!wm) return;
      const w1 = r2(Math.max(1, wm.width * factor));
      const dw = w1 - wm.width;
      const dh = (block.bbox.h || 0) * (w1 / wm.width - 1);
      const right = anchorRight(wm.hAnchor, page);
      if (right === true) wm.dx = r2(wm.dx - dw);
      else if (right === null) wm.dx = r2(wm.dx + dw / 2);
      if (wm.vAnchor === 'bottom') wm.dy = r2(wm.dy - dh);
      else if (wm.vAnchor === 'middle') wm.dy = r2(wm.dy + dh / 2);
      wm.width = w1;
      return;
    }
    if (block.role === 'custom' && block.id.startsWith('custom.')) {
      const cb = d.customBlocks.find((c) => c.id === block.id.slice(7));
      if (cb) {
        const w1 = r2(Math.max(1, cb.w * factor));
        // Espejado en una página izquierda: lo que queda fijo es su borde izquierdo dibujado.
        if (cb.mirror && page.side === 'verso') cb.x = r2(cb.x - (w1 - cb.w));
        cb.w = w1;
        cb.h = r2(Math.max(1, cb.h * factor));
      }
      return;
    }
    upsertOverride(
      d,
      page,
      block.id,
      effectiveScope(page, scope),
      (o) => {
        o.scale = Number(Math.min(20, Math.max(0.05, o.scale * factor)).toFixed(4));
        if (o.scaleY !== null) o.scaleY = Number(Math.min(20, Math.max(0.05, o.scaleY * factor)).toFixed(4));
      },
      typeMirrored(page),
    );
    const own = effectiveScope(page, scope) === 'type' ? findOverride(d, page, block.id, 'page') : undefined;
    if (own) {
      own.scale = Number(Math.min(20, Math.max(0.05, own.scale * factor)).toFixed(4));
      if (own.scaleY !== null) own.scaleY = Number(Math.min(20, Math.max(0.05, own.scaleY * factor)).toFixed(4));
    }
  }, coalesce);
}

/**
 * Receta de un tirador sobre un bloque, según qué es: un elemento propio guarda su caja; uno que se
 * permitió deformar cambia sus escalas; uno con caja del programa la reacomoda. `box` es el
 * rectángulo que se ve en la página (con la escala puesta).
 */
export function resizeRecipeFor(page: PageModel, block: Block, box: Rect, scope: Scope): Recipe {
  if (block.role === 'custom') return resizeCustomRecipe(page, block, box);
  if (deformable(block)) return deformRecipe(page, block, box, scope);
  return resizeBoxRecipe(page, block, visualToBox(box, axisScales(block.m) ?? { sx: 1, sy: 1 }), scope);
}

/**
 * Receta que estira el dibujo de un bloque hasta el rectángulo `visual` (lo que se ve): cada eje con
 * su escala y la esquina superior izquierda en su lugar. La caja natural de la sección no cambia de
 * tamaño; cambian la posición y las escalas. En una página izquierda con ajuste «por tipo» la
 * posición se espeja como en `resizeBoxRecipe`.
 */
export function deformRecipe(page: PageModel, block: Block, visual: Rect, scope: Scope): Recipe {
  return (d) => {
    const pivot = block.box ?? block.bbox;
    const sc = effectiveScope(page, scope);
    const mirrored = typeMirrored(page);
    const before = appliedOverride(d.overrides, page, block.id);
    const was: BoxAdjust = before
      ? { dx: before.pageKey === null && mirrored ? -(before.dx + before.dw) : before.dx, dy: before.dy, dw: before.dw, dh: before.dh }
      : { dx: 0, dy: 0, dw: 0, dh: 0 };
    // Con caja, el lugar ya está en el dibujo; sin ella, el ancho y el alto ajustados ya están en `bbox` pero el lugar no.
    const natural = naturalBox(pivot, block.box ? was : { dx: 0, dy: 0, dw: was.dw, dh: was.dh });
    const target = { x: visual.x, y: visual.y, w: pivot.w, h: pivot.h };
    const shown = storeAdjust(natural, target, false);
    const stored = storeAdjust(natural, target, sc === 'type' && mirrored);
    const { sx, sy } = deformScales(visual, pivot);
    const apply = (o: Draft<BlockOverride>, a: BoxAdjust): void => {
      o.dx = r2(a.dx);
      o.dy = r2(a.dy);
      o.dw = r2(a.dw);
      o.dh = r2(a.dh);
      o.scale = Number(sx.toFixed(4));
      o.scaleY = Math.abs(sy - sx) < 1e-4 ? null : Number(sy.toFixed(4));
      o.deform = true;
    };
    upsertOverride(d, page, block.id, sc, (o) => apply(o, stored), mirrored);
    const own = sc === 'type' ? findOverride(d, page, block.id, 'page') : undefined;
    if (own) apply(own, shown);
  };
}

/**
 * Receta que deja la caja de un bloque del programa en `box` (tal como se ve en esta página). Parte
 * de la caja natural (la de la sección sin ajustes) y escribe el ajuste que lleva hasta ahí; en una
 * página izquierda con ajuste «por tipo» el lado se espeja igual que al maquetar. Es la misma receta
 * para la vista previa mientras se arrastra y para confirmar al soltar.
 */
export function resizeBoxRecipe(page: PageModel, block: Block, box: Rect, scope: Scope): Recipe {
  return (d) => {
    const seen = block.box;
    if (!seen) return;
    const sc = effectiveScope(page, scope);
    const mirrored = typeMirrored(page);
    // Lo que se aplicaba cuando se tomó `block`: el de la página si lo hay, si no el del tipo.
    const before = appliedOverride(d.overrides, page, block.id);
    const was: BoxAdjust = before
      ? { dx: before.pageKey === null && mirrored ? -(before.dx + before.dw) : before.dx, dy: before.dy, dw: before.dw, dh: before.dh }
      : { dx: 0, dy: 0, dw: 0, dh: 0 };
    const natural = naturalBox(seen, was);
    const target = { x: box.x, y: box.y, w: Math.max(MIN_BOX, box.w), h: Math.max(MIN_BOX, box.h) };
    const shown = storeAdjust(natural, target, false);
    const stored = storeAdjust(natural, target, sc === 'type' && mirrored);
    upsertOverride(
      d,
      page,
      block.id,
      sc,
      (o) => {
        o.dx = r2(stored.dx);
        o.dy = r2(stored.dy);
        o.dw = r2(stored.dw);
        o.dh = r2(stored.dh);
      },
      mirrored,
    );
    // «Todas las páginas» desde una página con ajuste propio: ese manda aquí, así que también cambia.
    const own = sc === 'type' ? findOverride(d, page, block.id, 'page') : undefined;
    if (own) {
      own.dx = r2(shown.dx);
      own.dy = r2(shown.dy);
      own.dw = r2(shown.dw);
      own.dh = r2(shown.dh);
    }
  };
}

/** Cambia la caja de un bloque del programa (campos Ancho y Alto del panel: un paso de historial por campo). */
export function resizeBox(page: PageModel, block: Block, box: Rect, scope: Scope, coalesce?: string): void {
  useStore.getState().update(resizeBoxRecipe(page, block, box, scope), coalesce);
}

/* ---------- Estilo propio de un elemento ---------- */

/** El estilo guardado para un elemento en este alcance (sin sumar el del tipo ni el de la página). */
export function blockStyleOf(design: Design, page: PageModel, blockId: string, scope: Scope): BlockStyle | undefined {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  return design.blockStyles.find((s) => s.blockId === blockId && s.pageType === page.type && s.pageKey === key);
}

const styleIsEmpty = (s: BlockStyle): boolean => Object.keys(s.lines).length === 0 && s.fill === undefined && s.text?.color === undefined && Object.keys(s.text?.roles ?? {}).length === 0;

/** Receta que cambia el estilo de un elemento en el alcance dado; si queda vacío, se borra. */
export function blockStyleRecipe(page: PageModel, blockId: string, scope: Scope, change: (style: Draft<BlockStyle>) => void): Recipe {
  return (d) => {
    const sc = effectiveScope(page, scope);
    const key = sc === 'page' ? page.key : null;
    let style = d.blockStyles.find((s) => s.blockId === blockId && s.pageType === page.type && s.pageKey === key);
    if (!style) {
      d.blockStyles.push({ pageType: page.type, pageKey: key, blockId, lines: {} });
      style = d.blockStyles[d.blockStyles.length - 1]!;
    }
    change(style);
    if (styleIsEmpty(style as BlockStyle)) d.blockStyles = d.blockStyles.filter((s) => s !== style);
  };
}

/** Cambia campos del estilo de las líneas de un uso (`undefined` quita el campo: vuelve al tema). */
export function lineStyleRecipe(page: PageModel, blockId: string, scope: Scope, key: BlockLineKey, patch: { [K in keyof BlockLineStyle]?: BlockLineStyle[K] | undefined }): Recipe {
  return blockStyleRecipe(page, blockId, scope, (s) => {
    const next: Record<string, unknown> = { ...s.lines[key] };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    if (Object.keys(next).length === 0) delete s.lines[key];
    else s.lines[key] = next as BlockLineStyle;
  });
}

/** Relleno de los recuadros del elemento: un color, `null` (sin relleno) o `undefined` (el del programa). */
export function fillStyleRecipe(page: PageModel, blockId: string, scope: Scope, color: string | null | undefined): Recipe {
  return blockStyleRecipe(page, blockId, scope, (s) => {
    if (color === undefined) delete s.fill;
    else s.fill = { color };
  });
}

/** Color de todo el texto del elemento (`undefined` quita el color propio). */
export function textColorRecipe(page: PageModel, blockId: string, scope: Scope, color: string | undefined): Recipe {
  return blockStyleRecipe(page, blockId, scope, (s) => {
    const roles = { ...s.text?.roles };
    if (color === undefined && Object.keys(roles).length === 0) delete s.text;
    else s.text = { ...(color ? { color } : {}), roles };
  });
}

export function resetBlockStyle(page: PageModel, blockId: string, scope: Scope): void {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  useStore.getState().update((d) => void (d.blockStyles = d.blockStyles.filter((s) => !(s.blockId === blockId && s.pageType === page.type && s.pageKey === key))));
}

/** Receta que cambia el estilo de las líneas de varios usos de una vez (los menús: «líneas a guiones»). */
export function allLinesRecipe(page: PageModel, blockId: string, scope: Scope, keys: readonly BlockLineKey[], patch: { [K in keyof BlockLineStyle]?: BlockLineStyle[K] | undefined }): Recipe {
  return (d) => {
    for (const k of keys) lineStyleRecipe(page, blockId, scope, k, patch)(d);
  };
}

/** Receta que cambia un ajuste del elemento (la usan `patchOverride` y los deslizadores con vista previa). */
export function overrideRecipe(page: PageModel, blockId: string, scope: Scope, patch: Partial<BlockOverride>): Recipe {
  const mirrored = typeMirrored(page);
  return (d) => upsertOverride(d, page, blockId, effectiveScope(page, scope), (o) => Object.assign(o, patch), mirrored);
}

export function patchOverride(page: PageModel, blockId: string, scope: Scope, patch: Partial<BlockOverride>, coalesce?: string): void {
  useStore.getState().update(overrideRecipe(page, blockId, scope, patch), coalesce);
}

export function resetBlock(page: PageModel, blockId: string, scope: Scope): void {
  useStore.getState().update((d) => {
    const key = effectiveScope(page, scope) === 'page' ? page.key : null;
    d.overrides = d.overrides.filter((o) => !(o.blockId === blockId && o.pageType === page.type && o.pageKey === key));
  });
}

export function hideBlock(page: PageModel, block: Block, scope: Scope): void {
  hideBlocks(page, [block], scope);
}

/**
 * Oculta varios elementos en un solo paso: marcas de agua (en esta página o en su tipo, según el
 * alcance), elementos propios (se quitan) y los demás (ajuste «oculto»).
 */
export function hideBlocks(page: PageModel, blocks: Block[], scope: Scope): void {
  const sc = effectiveScope(page, scope);
  const mirrored = typeMirrored(page);
  useStore.getState().update((d) => {
    for (const block of blocks) {
      if (block.role === 'watermark' && block.id.startsWith('wm.')) {
        const wm = d.watermarks.find((w) => w.id === block.id.slice(3));
        if (!wm) continue;
        if (sc === 'page') {
          if (!wm.excludePages.includes(page.key)) wm.excludePages.push(page.key);
        } else if (!wm.exclude.includes(page.type)) wm.exclude.push(page.type);
      } else if (block.role === 'custom' && block.id.startsWith('custom.')) {
        d.customBlocks = d.customBlocks.filter((c) => c.id !== block.id.slice(7));
        // Sus enlaces a mano, su estilo y sus ajustes se van con él.
        d.links.blocks = d.links.blocks.filter((l) => l.blockId !== block.id);
        d.blockStyles = d.blockStyles.filter((s) => s.blockId !== block.id);
        d.overrides = d.overrides.filter((o) => o.blockId !== block.id);
      } else {
        upsertOverride(d, page, block.id, sc, (o) => void (o.hidden = true), mirrored);
      }
    }
  });
}

/* ---------- Copiar y pegar elementos propios ---------- */

/** Los elementos propios que corresponden a estos bloques (los del programa no se copian). */
export function customBlocksOf(design: Design, blocks: readonly Pick<Block, 'id' | 'role'>[]): CustomBlock[] {
  return blocks.flatMap((b) => (b.role === 'custom' && b.id.startsWith('custom.') ? design.customBlocks.filter((c) => c.id === b.id.slice(7)) : []));
}

/**
 * Pega copias de elementos propios en una página. Cada uno recibe un id nuevo y es de esta página
 * (o de todas las de su tipo, según el alcance); si se pega donde estaba, se corre 5 mm para que no
 * quede encima. Las copias quedan dentro de la página. Devuelve los ids de los bloques nuevos.
 */
export function pasteCustomBlocks(page: PageModel, copies: readonly CustomBlock[], scope: Scope): string[] {
  if (copies.length === 0) return [];
  const pageKey = effectiveScope(page, scope) === 'page' || page.type === 'custom' ? page.key : null;
  const made: CustomBlock[] = copies.map((src) => {
    const same = src.pageType === page.type && src.pageKey === pageKey;
    const w = Math.min(src.w, page.w);
    const h = Math.min(src.h, page.h);
    const x = Math.min(Math.max(0, src.x + (same ? 5 : 0)), page.w - w);
    const y = Math.min(Math.max(0, src.y + (same ? 5 : 0)), page.h - h);
    return { ...JSON.parse(JSON.stringify(src)), id: newId('el'), pageType: page.type, pageKey, x: r2(x), y: r2(y), w, h };
  });
  useStore.getState().update((d) => {
    d.customBlocks.push(...made);
    copies.forEach((src, i) => cloneBlockData(d, src, made[i]!));
  });
  const ids = made.map((c) => `custom.${c.id}`);
  useStore.getState().setSelection({ pageKey: page.key, pageType: page.type, blockId: ids[ids.length - 1]!, role: 'custom' }, ids);
  return ids;
}

/** Copia lo propio de un elemento (estilo, ajustes, enlaces a mano) al elemento nuevo que salió de él. */
function cloneBlockData(d: Draft<Design>, from: CustomBlock, to: CustomBlock): void {
  const old = `custom.${from.id}`;
  const fresh = `custom.${to.id}`;
  const mine = (x: { blockId: string; pageType: string; pageKey: string | null }): boolean => x.blockId === old && x.pageType === from.pageType && x.pageKey === from.pageKey;
  const copy = <T extends { blockId: string; pageType: string; pageKey: string | null }>(list: Draft<T>[]): void => {
    for (const x of list.filter((e) => mine(e as T)).map((e) => current(e) as T)) list.push({ ...x, blockId: fresh, pageType: to.pageType, pageKey: to.pageKey } as Draft<T>);
  };
  copy(d.blockStyles);
  copy(d.overrides);
  copy(d.links.blocks);
}

/* ---------- Enlaces ---------- */

/** Enlace a mano de un elemento (o de una de sus zonas: `area`) en el alcance elegido, si lo hay. */
export function currentBlockLink(design: Design, page: PageModel, blockId: string, scope: Scope, area = ''): BlockLink | undefined {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  return design.links.blocks.find((l) => l.blockId === blockId && l.pageType === page.type && l.pageKey === key && l.area === area);
}

/**
 * Elige el enlace de un elemento: `auto` vuelve a los automáticos (en una página solo se guarda si
 * su tipo dice otra cosa), `none` se los quita, `page` y `url` ponen uno a mano que cubre el elemento.
 */
export function setBlockLink(page: PageModel, blockId: string, scope: Scope, link: Pick<BlockLink, 'mode'> & Partial<Pick<BlockLink, 'page' | 'url'>>, coalesce?: string, area = ''): void {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  useStore.getState().update((d) => {
    const list = d.links.blocks;
    const at = list.findIndex((l) => l.blockId === blockId && l.pageType === page.type && l.pageKey === key && l.area === area);
    const byType = key === null ? undefined : list.find((l) => l.blockId === blockId && l.pageType === page.type && l.pageKey === null && l.area === area);
    if (link.mode === 'auto' && (key === null || !byType || byType.mode === 'auto')) {
      if (at >= 0) list.splice(at, 1);
      return;
    }
    const prev = at >= 0 ? list[at] : undefined;
    const entry: BlockLink = { pageType: page.type, pageKey: key, blockId, area, mode: link.mode, page: link.page ?? prev?.page ?? '', url: link.url ?? prev?.url ?? '' };
    if (at >= 0) list[at] = entry;
    else list.push(entry);
  }, coalesce);
}

/**
 * Alcance al que vale el enlace de un elemento: una página propia o un elemento propio de una sola
 * página se enlazan solo en esa página; el resto, según el alcance que elija el usuario.
 */
export function linkScope(design: Design, page: PageModel, blockId: string, scope: Scope): Scope {
  if (page.type === 'custom') return 'page';
  const custom = design.customBlocks.find((c) => `custom.${c.id}` === blockId);
  return custom && custom.pageKey !== null ? 'page' : scope;
}

/** Quita todas las elecciones a mano de un elemento en el alcance (la del elemento entero y las de sus zonas). */
export function clearBlockLinks(page: PageModel, blockId: string, scope: Scope): void {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  useStore.getState().update((d) => void (d.links.blocks = d.links.blocks.filter((l) => !(l.blockId === blockId && l.pageType === page.type && l.pageKey === key))));
}

export function currentOverride(design: Design, page: PageModel, blockId: string, scope: Scope): BlockOverride | undefined {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  return design.overrides.find((o) => o.blockId === blockId && o.pageType === page.type && o.pageKey === key);
}

/* ---------- Elementos propios ---------- */

/**
 * Agrega un elemento propio al tipo de página (o solo a esta página). Si se indica un punto
 * (clic derecho), el elemento se ubica ahí; si no, abajo del área de contenido.
 */
export function addCustomBlock(page: PageModel, kind: CustomBlock['kind'], labels: { text: string; image: string; rect: string; lines: string; dots: string }, scope: Scope, at?: { x: number; y: number }, assetId?: string): string {
  const design = useStore.getState().design;
  const c = page.content;
  const id = newId('el');
  const size: Record<string, { w: number; h: number }> = { text: { w: c.w, h: 10 }, image: { w: 30, h: 30 }, rect: { w: c.w, h: 30 }, lines: { w: c.w, h: 30 }, dots: { w: c.w, h: 30 } };
  const { w, h } = size[kind] ?? { w: 30, h: 30 };
  const def = at
    ? { x: Math.min(Math.max(0, at.x), page.w - w), y: Math.min(Math.max(0, at.y), page.h - h) }
    : kind === 'image'
      ? { x: c.x + c.w - w, y: c.y + c.h - h }
      : { x: c.x, y: c.y + c.h - (kind === 'text' ? 14 : h) };
  // Lo que se ve en una página izquierda se guarda como en una derecha (el elemento se espeja).
  const x = page.side === 'verso' ? page.w - def.x - w : def.x;
  const props: Record<string, unknown> =
    kind === 'text'
      ? { text: '{name}', role: 'quote', size: 11, align: 'right', fit: false, autoHeight: true, label: labels.text }
      : kind === 'image'
        ? { assetId: assetId ?? design?.assets.find((a) => a.kind !== 'pdf')?.id ?? '', fit: 'contain', opacity: 1, label: labels.image }
        : { label: labels[kind as 'rect' | 'lines' | 'dots'] ?? kind };
  const block: CustomBlock = { id, pageType: page.type, pageKey: effectiveScope(page, scope) === 'page' || page.type === 'custom' ? page.key : null, kind, mirror: true, x: r2(x), y: r2(def.y), w, h, props };
  useStore.getState().update((d) => void d.customBlocks.push(block));
  useStore.getState().select({ pageKey: page.key, pageType: page.type, blockId: `custom.${id}`, role: 'custom' });
  return id;
}

/** Copia un elemento propio, corrido 5 mm. */
export function duplicateCustomBlock(page: PageModel, block: Block): void {
  if (!block.id.startsWith('custom.')) return;
  const id = newId('el');
  useStore.getState().update((d) => {
    const src = d.customBlocks.find((c) => c.id === block.id.slice(7));
    if (src) {
      const copy: CustomBlock = { ...JSON.parse(JSON.stringify(src)), id, x: r2(src.x + 5), y: r2(src.y + 5) };
      d.customBlocks.push(copy);
      cloneBlockData(d, current(src) as CustomBlock, copy);
    }
  });
  useStore.getState().select({ pageKey: page.key, pageType: page.type, blockId: `custom.${id}`, role: 'custom' });
}
