/**
 * Acciones de edición sobre el diseño a partir de lo que el usuario hace en el
 * lienzo: mover, escalar, ocultar o restablecer bloques; mover marcas de agua y
 * elementos propios respetando sus anclajes y su espejado.
 */
import type { BlockOverride, Design } from '@core/design/schema';
import type { Block, PageModel } from '@core/layout/prims';
import type { Draft } from 'immer';
import { documentFor } from './doc';
import { useStore } from './store';

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
      dx: base ? (mirrored ? -base.dx : base.dx) : 0,
      dy: base?.dy ?? 0,
      scale: base?.scale ?? 1,
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

/** Desplaza un bloque (dx, dy en mm de página). */
export function moveBlock(page: PageModel, block: Block, dx: number, dy: number, scope: Scope, coalesce?: string): void {
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
  const sc = effectiveScope(page, scope);
  const mirrored = typeMirrored(page);
  const flip = sc === 'type' && mirrored;
  useStore.getState().update((d) => {
    if (block.role === 'watermark' && block.id.startsWith('wm.')) {
      const wm = d.watermarks.find((w) => w.id === block.id.slice(3));
      if (!wm) return;
      const right = anchorRight(wm.hAnchor, page);
      wm.dx = Number((right === true ? wm.dx - dx : wm.dx + dx).toFixed(2));
      wm.dy = Number((wm.vAnchor === 'bottom' ? wm.dy - dy : wm.dy + dy).toFixed(2));
      return;
    }
    if (block.role === 'custom' && block.id.startsWith('custom.')) {
      const cb = d.customBlocks.find((c) => c.id === block.id.slice(7));
      if (!cb) return;
      const mirrored = cb.mirror && page.side === 'verso';
      cb.x = Number((mirrored ? cb.x - dx : cb.x + dx).toFixed(2));
      cb.y = Number((cb.y + dy).toFixed(2));
      return;
    }
    upsertOverride(
      d,
      page,
      block.id,
      sc,
      (o) => {
        o.dx = Number((o.dx + (flip ? -dx : dx)).toFixed(2));
        o.dy = Number((o.dy + dy).toFixed(2));
      },
      mirrored,
    );
  }, coalesce);
}

/** Escala un bloque por un factor (marcas de agua y elementos propios cambian su tamaño real). */
export function scaleBlock(page: PageModel, block: Block, factor: number, scope: Scope, coalesce?: string): void {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useStore.getState().update((d) => {
    if (block.role === 'watermark' && block.id.startsWith('wm.')) {
      const wm = d.watermarks.find((w) => w.id === block.id.slice(3));
      if (wm) wm.width = Number(Math.max(1, wm.width * factor).toFixed(2));
      return;
    }
    if (block.role === 'custom' && block.id.startsWith('custom.')) {
      const cb = d.customBlocks.find((c) => c.id === block.id.slice(7));
      if (cb) {
        cb.w = Number(Math.max(1, cb.w * factor).toFixed(2));
        cb.h = Number(Math.max(1, cb.h * factor).toFixed(2));
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
      },
      typeMirrored(page),
    );
  }, coalesce);
}

export function patchOverride(page: PageModel, blockId: string, scope: Scope, patch: Partial<BlockOverride>, coalesce?: string): void {
  const mirrored = typeMirrored(page);
  useStore.getState().update((d) => {
    upsertOverride(d, page, blockId, effectiveScope(page, scope), (o) => Object.assign(o, patch), mirrored);
  }, coalesce);
}

export function resetBlock(page: PageModel, blockId: string, scope: Scope): void {
  useStore.getState().update((d) => {
    const key = effectiveScope(page, scope) === 'page' ? page.key : null;
    d.overrides = d.overrides.filter((o) => !(o.blockId === blockId && o.pageType === page.type && o.pageKey === key));
  });
}

export function hideBlock(page: PageModel, block: Block, scope: Scope): void {
  if (block.role === 'watermark' && block.id.startsWith('wm.')) {
    useStore.getState().update((d) => {
      const wm = d.watermarks.find((w) => w.id === block.id.slice(3));
      if (wm && !wm.exclude.includes(page.type)) wm.exclude.push(page.type);
    });
    return;
  }
  if (block.role === 'custom' && block.id.startsWith('custom.')) {
    useStore.getState().update((d) => {
      d.customBlocks = d.customBlocks.filter((c) => c.id !== block.id.slice(7));
    });
    return;
  }
  patchOverride(page, block.id, scope, { hidden: true });
}

export function currentOverride(design: Design, page: PageModel, blockId: string, scope: Scope): BlockOverride | undefined {
  const key = effectiveScope(page, scope) === 'page' ? page.key : null;
  return design.overrides.find((o) => o.blockId === blockId && o.pageType === page.type && o.pageKey === key);
}
