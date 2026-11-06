/**
 * Lo que un modelo de lenguaje necesita saber de las páginas de una agenda armada, sin mirarlas: la
 * lista de páginas con sus claves, y de cada una su lado, su zona de contenido y la caja de cada
 * bloque. Lo comparten el servidor MCP y el asistente de la aplicación, así los dos responden igual.
 */
import type { AgendaDocument } from './index';
import { blockBounds } from './layout';

export interface PageListItem {
  /** Número de página, desde 1. */
  page: number;
  key: string;
  type: string;
  side: 'recto' | 'verso';
  title: string;
}

export interface PageList {
  /** Cuántas páginas hay en total (con el filtro de tipo, si lo hay). */
  total: number;
  offset: number;
  pages: PageListItem[];
}

/** Un tope razonable para una sola respuesta. */
export const PAGE_LIST_MAX = 300;

export function listPages(doc: AgendaDocument, opts: { type?: string | undefined; offset?: number | undefined; limit?: number | undefined } = {}): PageList {
  const all = doc.plan.pages.filter((p) => !opts.type || p.type === opts.type);
  const from = Math.max(0, Math.floor(opts.offset ?? 0));
  const limit = Math.min(PAGE_LIST_MAX, Math.max(1, Math.floor(opts.limit ?? 100)));
  const pages = all.slice(from, from + limit).map((p) => ({ page: p.index + 1, key: p.key, type: p.type, side: p.side, title: doc.pageLabel(p.index) }));
  return { total: all.length, offset: from, pages };
}

/** Caja `[x, y, ancho, alto]` en mm desde la esquina superior izquierda de la página, a la décima. */
export type Box = [number, number, number, number];

export interface PageRenderInfo {
  page: number;
  key: string;
  type: string;
  side: 'recto' | 'verso';
  size: { w: number; h: number };
  content: Box;
  blocks: Array<{ id: string; label: string; box: Box }>;
  warnings: string[];
}

const box = (r: { x: number; y: number; w: number; h: number }): Box => [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 10) / 10) as Box;

/** Lo que acompaña a la imagen de una página: dónde está cada bloque y qué avisos tiene. `index` desde 0. */
export function pageRenderInfo(doc: AgendaDocument, index: number): PageRenderInfo {
  const model = doc.page(index);
  return {
    page: index + 1,
    key: model.key,
    type: model.type,
    side: model.side,
    size: { w: model.w, h: model.h },
    content: box(model.content),
    blocks: model.blocks.map((b) => ({ id: b.id, label: b.label, box: box(blockBounds(b)) })),
    warnings: doc.pageWarnings(index).map((w) => w.message),
  };
}
