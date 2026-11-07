/**
 * Dónde se usa una imagen de la agenda y cómo quitarla sin dejar nada colgando. Una imagen puede
 * estar en una marca de agua, en la tapa, en un elemento propio (una imagen, o un dibujo copiado que
 * la lleva adentro), en una página propia o su plantilla, y en los ornamentos de las líneas (`asset:<id>`).
 */
import type { Design } from './schema';
import { parseDrawing } from './drawing';
import type { Prim } from '../layout/prims';

export type AssetUse =
  | { kind: 'watermark'; id: string }
  | { kind: 'cover' }
  | { kind: 'monthCover'; sectionId: string; months: string[] }
  | { kind: 'block'; id: string; pageType: string; pageKey: string | null; label: string }
  | { kind: 'page'; id: string; title: string }
  | { kind: 'template'; id: string; title: string }
  | { kind: 'ornament'; where: 'theme' | 'blockStyle' | 'pageStyle' };

const ornamentRef = (id: string): string => `asset:${id}`;

/** ¿Hay una referencia `asset:<id>` en algún valor de este objeto? */
function mentionsOrnament(v: unknown, id: string): boolean {
  if (typeof v === 'string') return v === ornamentRef(id);
  if (v && typeof v === 'object') return Object.values(v).some((x) => mentionsOrnament(x, id));
  return false;
}

/** Quita las referencias `asset:<id>` de un objeto (la clave se borra: el ornamento vuelve al del tema). */
function dropOrnament(v: unknown, id: string): void {
  if (!v || typeof v !== 'object') return;
  const bag = v as Record<string, unknown>;
  for (const [k, x] of Object.entries(bag)) {
    if (x === ornamentRef(id)) delete bag[k];
    else dropOrnament(x, id);
  }
}

const imagesOf = (prims: readonly Prim[]): string[] => prims.flatMap((p) => (p.t === 'image' ? [p.asset] : p.t === 'group' ? imagesOf(p.children) : []));

/** Un dibujo copiado sin las imágenes de `id` (los grupos que quedan vacíos se van con ellas). */
function withoutImage(prims: readonly Prim[], id: string): Prim[] {
  return prims.flatMap((p): Prim[] => {
    if (p.t === 'image') return p.asset === id ? [] : [p];
    if (p.t !== 'group') return [p];
    const children = withoutImage(p.children, id);
    return children.length === 0 && p.children.length > 0 ? [] : [{ ...p, children }];
  });
}

const drawingImages = (props: Record<string, unknown>): string[] => {
  const d = parseDrawing(props);
  return d ? imagesOf(d.prims as Prim[]) : [];
};

/** Las portadas de mes (en «Meses» o sueltas) con sus imágenes por mes (`options.images`). */
function monthCovers(design: Design): Array<{ id: string; images: Record<string, unknown> }> {
  const items = design.sections.flatMap((s) => [s, ...(s.items ?? [])]);
  return items.filter((i) => i.type === 'monthCover' && i.options.images && typeof i.options.images === 'object' && !Array.isArray(i.options.images)).map((i) => ({ id: i.id, images: i.options.images as Record<string, unknown> }));
}

/** Todos los lugares de la agenda que usan la imagen, en el orden en que se muestran. */
export function assetUses(design: Design, id: string): AssetUse[] {
  const out: AssetUse[] = [];
  for (const w of design.watermarks) if (w.assetId === id) out.push({ kind: 'watermark', id: w.id });
  if (design.cover.imageAssetId === id) out.push({ kind: 'cover' });
  for (const mc of monthCovers(design)) {
    const months = Object.entries(mc.images).flatMap(([k, v]) => (v === id ? [k] : []));
    if (months.length > 0) out.push({ kind: 'monthCover', sectionId: mc.id, months });
  }
  for (const c of design.customBlocks) {
    const uses = c.kind === 'image' ? c.props.assetId === id : c.kind === 'drawing' && drawingImages(c.props).includes(id);
    if (uses) out.push({ kind: 'block', id: c.id, pageType: c.pageType, pageKey: c.pageKey, label: String(c.props.label ?? '') });
  }
  for (const p of design.customPages) if (p.content.assetId === id) out.push({ kind: 'page', id: p.id, title: p.title });
  for (const p of design.pageTemplates) if (p.content.assetId === id) out.push({ kind: 'template', id: p.id, title: p.title });
  if (mentionsOrnament(design.theme.tokens, id)) out.push({ kind: 'ornament', where: 'theme' });
  if (design.blockStyles.some((s) => mentionsOrnament(s.lines, id))) out.push({ kind: 'ornament', where: 'blockStyle' });
  if (design.pageStyles.some((s) => mentionsOrnament(s.tokens, id))) out.push({ kind: 'ornament', where: 'pageStyle' });
  return out;
}

/**
 * Los recursos que la agenda usa en algún lugar (el resto no hace falta para dibujarla ni exportarla).
 * Suma a `assetUses` una búsqueda del id en todo el diseño (menos la lista de recursos y las fuentes
 * incrustadas), como valor suelto o como ornamento `asset:<id>`: si un lugar nuevo llega a usar una
 * imagen y `assetUses` no lo sabe, el recurso viaja igual en lugar de faltar en el PDF. Un falso
 * positivo solo manda un recurso de más.
 */
export function usedAssetIds(design: Design): Set<string> {
  const text = JSON.stringify({ ...design, assets: [], userFonts: [] });
  const out = new Set<string>();
  for (const a of design.assets) {
    if (assetUses(design, a.id).length > 0 || text.includes(JSON.stringify(a.id)) || text.includes(JSON.stringify(ornamentRef(a.id)))) out.add(a.id);
  }
  return out;
}

/**
 * Quita la imagen de la agenda y todo lo que la usaba: las marcas de agua, la imagen de la tapa, los
 * elementos propios que son esa imagen (los dibujos copiados solo pierden esa imagen), las páginas y plantillas
 * (quedan sin imagen) y los ornamentos (vuelve el del tema). Se aplica sobre un borrador del diseño.
 */
export function removeAssetFrom(d: Design, id: string): void {
  d.assets = d.assets.filter((a) => a.id !== id);
  d.watermarks = d.watermarks.filter((w) => w.assetId !== id);
  if (d.cover.imageAssetId === id) d.cover.imageAssetId = null;
  // Las portadas de mes que la usaban vuelven al recuadro del sticker.
  for (const item of d.sections.flatMap((s) => [s, ...(s.items ?? [])])) {
    const images = item.type === 'monthCover' ? item.options.images : undefined;
    if (!images || typeof images !== 'object' || Array.isArray(images)) continue;
    const map = images as Record<string, unknown>;
    for (const [k, v] of Object.entries(map)) if (v === id) delete map[k];
    if (Object.keys(map).length === 0) delete item.options.images;
  }
  const gone = new Set<string>();
  for (const c of d.customBlocks) {
    if (c.kind === 'image' && c.props.assetId === id) gone.add(c.id);
    else if (c.kind === 'drawing') {
      const drawing = parseDrawing(c.props);
      if (drawing && imagesOf(drawing.prims as Prim[]).includes(id)) c.props = { ...c.props, prims: withoutImage(drawing.prims as Prim[], id) };
    }
  }
  d.customBlocks = d.customBlocks.filter((c) => !gone.has(c.id));
  // Lo que dependía de un elemento que se fue (enlaces, estilo, ajustes) se va con él.
  d.links.blocks = d.links.blocks.filter((l) => !gone.has(l.blockId.replace(/^custom\./, '')));
  d.blockStyles = d.blockStyles.filter((s) => !gone.has(s.blockId.replace(/^custom\./, '')));
  d.overrides = d.overrides.filter((o) => !gone.has(o.blockId.replace(/^custom\./, '')));
  for (const p of d.customPages) if (p.content.assetId === id) p.content.assetId = null;
  for (const p of d.pageTemplates) if (p.content.assetId === id) p.content.assetId = null;
  dropOrnament(d.theme.tokens, id);
  for (const s of d.blockStyles) dropOrnament(s.lines, id);
  for (const s of d.pageStyles) dropOrnament(s.tokens, id);
}
