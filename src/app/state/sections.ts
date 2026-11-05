/**
 * Operaciones sobre la lista de secciones del diseño: dónde va cada sección (una vez, en su
 * lugar de la lista, o repetida dentro de «Meses» cada mes, semana o día), moverla a un extremo,
 * y las plantillas de página (crearlas y eliminarlas con todo lo que cuelga de ellas).
 */
import type { AgendaDocument } from '@core/document';
import type { Design, SectionItem } from '@core/design/schema';
import { SECTION_REGISTRY } from '@core/sections/registry';
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
