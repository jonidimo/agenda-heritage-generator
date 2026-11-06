/**
 * Operaciones sobre la lista de secciones del diseño: dónde va cada sección (una vez, en su
 * lugar de la lista, o repetida dentro de «Meses» cada mes, semana o día), moverla a un extremo,
 * y las plantillas de página (crearlas y eliminarlas con todo lo que cuelga de ellas).
 */
import type { AgendaDocument } from '@core/document';
import type { Design, SectionItem, SectionSpec } from '@core/design/schema';
import { heritageMonthItems } from '@core/design/defaults';
import { SECTION_REGISTRY, USER_SECTION_MODULES } from '@core/sections/registry';
import { newId } from '@core/util/hash';
import type { Draft } from 'immer';
import { useStore } from './store';

export type Repeat = SectionItem['repeat'];

/** Dónde está una sección: en la lista principal o dentro de «Meses». */
export type SectionPath = { list: 'top'; index: number } | { list: 'month'; index: number };

const update = (recipe: (d: Draft<Design>) => void): void => useStore.getState().update(recipe);
const monthsOf = (d: Draft<Design>) => d.sections.find((s) => s.type === 'months');

/** Se puede repetir dentro de los meses: todo menos lo que solo tiene sentido al principio (portada, índice…). */
export function canRepeat(type: string): boolean {
  const mod = SECTION_REGISTRY.get(type);
  return Boolean(mod) && type !== 'months' && mod!.scope !== 'front';
}

/** Puede ir una sola vez fuera de los meses: todo menos lo que se arma con los datos de un mes. */
export function canBeOnce(type: string): boolean {
  const mod = SECTION_REGISTRY.get(type);
  return Boolean(mod) && mod!.scope !== 'month';
}

function take(d: Draft<Design>, p: SectionPath): SectionItem | undefined {
  const list = p.list === 'top' ? d.sections : monthsOf(d)?.items;
  return list?.splice(p.index, 1)[0];
}

/** Repetir una sección cada mes, semana o día (si estaba una sola vez, pasa al final de «Meses»). */
export function setRepeat(p: SectionPath, repeat: Repeat): void {
  update((d) => {
    const months = monthsOf(d);
    if (!months) return;
    if (p.list === 'month') {
      const it = months.items?.[p.index];
      if (it) it.repeat = repeat;
      return;
    }
    const sec = take(d, p);
    if (!sec) return;
    const { items: _nested, ...item } = sec as SectionItem & { items?: unknown };
    (months.items ??= []).push({ ...item, repeat, enabled: true });
  });
}

/** Una sola vez: la sección sale de «Meses» y queda justo después de ellos. */
export function setOnce(p: SectionPath): void {
  if (p.list === 'top') return;
  update((d) => {
    const item = take(d, p);
    if (!item) return;
    const at = d.sections.findIndex((s) => s.type === 'months');
    d.sections.splice(at + 1, 0, { ...item, repeat: 'month' });
  });
}

export function moveToEdge(p: SectionPath, edge: 'start' | 'end'): void {
  update((d) => {
    const list = p.list === 'top' ? d.sections : monthsOf(d)?.items;
    if (!list) return;
    const [it] = list.splice(p.index, 1);
    if (!it) return;
    if (edge === 'start') list.unshift(it);
    else list.push(it);
  });
}

export function setEnabled(p: SectionPath, enabled: boolean): void {
  update((d) => {
    const list = p.list === 'top' ? d.sections : monthsOf(d)?.items;
    const it = list?.[p.index];
    if (it) it.enabled = enabled;
  });
}

/** Páginas de una sección (todas sus copias), en orden. */
export function sectionPages(doc: AgendaDocument, sectionId: string): number[] {
  return doc.plan.pages.filter((p) => p.section === sectionId).map((p) => p.index);
}

/** La próxima aparición de una sección desde la página actual (o la primera, al dar la vuelta). */
export function nextPageOf(doc: AgendaDocument, sectionId: string, from: number): number | undefined {
  const pages = sectionPages(doc, sectionId);
  return pages.find((i) => i > from) ?? pages[0];
}

/** Crea una plantilla de página y la agrega una vez después de «Meses». Devuelve la clave de su primera página. */
export function createTemplate(title: string): string {
  const id = newId('plantilla');
  update((d) => {
    d.pageTemplates.push({
      id,
      title,
      showTitle: true,
      content: { kind: 'template', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'lines', text: '', rotation: 0, opacity: 1 },
    });
    const at = d.sections.findIndex((s) => s.type === 'months');
    d.sections.splice(at + 1, 0, { id: newId('sec'), type: 'pageTemplate', enabled: true, options: { template: id }, repeat: 'month' });
  });
  return `tpl:${id}:0`;
}

/** Elimina una plantilla, sus secciones y lo que se le agregó (elementos, ajustes, enlaces, estilos). */
export function deleteTemplate(id: string): void {
  const type = `tpl:${id}`;
  update((d) => {
    d.pageTemplates = d.pageTemplates.filter((x) => x.id !== id);
    const uses = (s: SectionItem): boolean => s.type === 'pageTemplate' && s.options.template === id;
    d.sections = d.sections.filter((s) => !uses(s));
    for (const s of d.sections) if (s.items) s.items = s.items.filter((it) => !uses(it));
    d.customBlocks = d.customBlocks.filter((c) => c.pageType !== type);
    d.overrides = d.overrides.filter((o) => o.pageType !== type);
    d.pageStyles = d.pageStyles.filter((o) => o.pageType !== type);
    d.blockStyles = d.blockStyles.filter((o) => o.pageType !== type);
    d.links.blocks = d.links.blocks.filter((o) => o.pageType !== type);
    for (const w of d.watermarks) w.scope = w.scope.filter((x) => x !== type);
  });
}

/** Una sección por su id, esté en la lista principal o dentro de «Meses». */
function itemById(d: Draft<Design>, id: string): Draft<SectionItem> | undefined {
  for (const s of d.sections) {
    if (s.id === id) return s;
    const inner = s.items?.find((i) => i.id === id);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * La imagen propia de la portada de un mes (`monthKey`, como «2027-03») o de todos (`default`): con `null`
 * vuelve el recuadro del sticker. Un solo paso de deshacer.
 */
export function monthCoverImageRecipe(sectionId: string, monthKey: string, assetId: string | null): (d: Draft<Design>) => void {
  return (d) => {
    const item = itemById(d, sectionId);
    if (!item) return;
    const prev = item.options.images;
    const images: Record<string, string> = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...(prev as Record<string, string>) } : {};
    if (assetId) images[monthKey] = assetId;
    else delete images[monthKey];
    // «Todos los meses» deja de lado lo que tenía cada mes: si no, la imagen nueva no se vería en ellos.
    if (monthKey === 'default' && assetId) for (const k of Object.keys(images)) if (k !== 'default') delete images[k];
    if (Object.keys(images).length > 0) item.options.images = images;
    else delete item.options.images;
  };
}

export const setMonthCoverImage = (sectionId: string, monthKey: string, assetId: string | null): void => update(monthCoverImageRecipe(sectionId, monthKey, assetId));

/* ---------- Agregar y quitar secciones (para armar una agenda desde cero) ---------- */

/** Secciones que pueden ir más de una vez: sus páginas se identifican por la id de la sección, no por el tipo. */
const REPEATABLE = new Set(['notes', 'monthNotes']);

export type CatalogueGroup = 'front' | 'calendar' | 'back';
export interface CatalogueEntry {
  type: string;
  group: CatalogueGroup;
}

/** Todas las ids de secciones (de la lista y de adentro de «Meses»). */
const allIds = (d: Pick<Design, 'sections'>): Set<string> => new Set(d.sections.flatMap((s) => [s.id, ...(s.items ?? []).map((i) => i.id)]));

/** Una id libre para una sección nueva de ese tipo: `notes`, `notes-2`… */
export function uniqueSectionId(d: Pick<Design, 'sections'>, type: string): string {
  const used = allIds(d);
  if (!used.has(type)) return type;
  for (let n = 2; ; n++) if (!used.has(`${type}-${n}`)) return `${type}-${n}`;
}

/**
 * Lo que se puede agregar: a la lista (lo del principio, «Meses» y lo del final) y adentro de «Meses» (lo
 * que se arma con cada mes). Una sección que ya está no se ofrece de nuevo, salvo las que pueden repetirse;
 * las plantillas de página se crean desde su propio botón.
 */
export function sectionCatalogue(d: Pick<Design, 'sections'>): { top: CatalogueEntry[]; month: CatalogueEntry[]; hasMonths: boolean } {
  const months = d.sections.find((s) => s.type === 'months');
  const topTypes = new Set(d.sections.map((s) => s.type));
  const monthTypes = new Set((months?.items ?? []).map((i) => i.type));
  const free = (type: string, present: Set<string>): boolean => REPEATABLE.has(type) || !present.has(type);
  const top: CatalogueEntry[] = USER_SECTION_MODULES.filter((m) => m.scope !== 'month' && m.type !== 'pageTemplate' && free(m.type, topTypes)).map((m) => ({ type: m.type, group: m.scope === 'front' ? 'front' : 'back' }));
  if (!months) top.push({ type: 'months', group: 'calendar' });
  const month: CatalogueEntry[] = months ? USER_SECTION_MODULES.filter((m) => m.scope === 'month' && free(m.type, monthTypes)).map((m) => ({ type: m.type, group: 'calendar' })) : [];
  const order: Record<CatalogueGroup, number> = { front: 0, calendar: 1, back: 2 };
  return { top: top.sort((a, b) => order[a.group] - order[b.group]), month, hasMonths: months !== undefined };
}

/** Una sección nueva en un lugar razonable: lo del principio antes de «Meses», «Meses» después de lo del principio, el resto al final. */
export function addSectionRecipe(type: string): (d: Draft<Design>) => void {
  return (d) => {
    const id = uniqueSectionId(d, type);
    const item: SectionSpec = type === 'months' ? { id, type, enabled: true, options: {}, repeat: 'month', items: heritageMonthItems() } : { id, type, enabled: true, options: {}, repeat: 'month' };
    const scope = SECTION_REGISTRY.get(type)?.scope;
    const isFront = (s: { type: string }): boolean => SECTION_REGISTRY.get(s.type)?.scope === 'front';
    let at = d.sections.length;
    if (scope === 'front') {
      const firstOther = d.sections.findIndex((s) => !isFront(s));
      at = firstOther < 0 ? d.sections.length : firstOther;
    } else if (type === 'months') {
      const lastFront = d.sections.reduce((last, s, i) => (isFront(s) ? i : last), -1);
      at = lastFront + 1;
    }
    d.sections.splice(at, 0, item);
  };
}

/** Algo nuevo que se arma con cada mes, al final de «Meses». */
export function addMonthItemRecipe(type: string): (d: Draft<Design>) => void {
  return (d) => {
    const months = monthsOf(d);
    if (!months) return;
    months.items ??= [];
    months.items.push({ id: uniqueSectionId(d, type), type, enabled: true, options: {}, repeat: 'month' });
  };
}

/** Quita una sección (con todo lo de adentro, si es «Meses»). Un paso de deshacer. */
export function removeSectionRecipe(path: SectionPath): (d: Draft<Design>) => void {
  return (d) => {
    const list = path.list === 'top' ? d.sections : monthsOf(d)?.items;
    list?.splice(path.index, 1);
  };
}

export const addSection = (type: string): void => update(addSectionRecipe(type));
export const addMonthItem = (type: string): void => update(addMonthItemRecipe(type));
export const removeSection = (path: SectionPath): void => update(removeSectionRecipe(path));
