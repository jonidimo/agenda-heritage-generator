/** La página que se está editando y lo que hay seleccionado en ella (para atajos y portapapeles). */
import type { AgendaDocument } from '@core/document';
import type { Block, PageModel } from '@core/layout/prims';
import { documentFor } from './doc';
import { useStore } from './store';

export interface SelectionContext {
  doc: AgendaDocument;
  page: PageModel;
  /** Los bloques seleccionados de esa página. */
  selected: Block[];
}

/** El documento de la agenda abierta (sin maquetar ninguna página), o `null` si no hay. */
export function currentDocument(): AgendaDocument | null {
  const s = useStore.getState();
  return s.design ? documentFor(s.design, s.resVersion).doc : null;
}

/**
 * La página de la selección y sus bloques seleccionados; sin selección, la página actual. `null` si no
 * hay agenda o si esa página no se pudo dibujar (un error en una página no debe tumbar los atajos).
 */
export function selectionContext(): SelectionContext | null {
  const doc = currentDocument();
  if (!doc) return null;
  const s = useStore.getState();
  const index = s.selection ? doc.plan.pages.findIndex((p) => p.key === s.selection!.pageKey) : s.pageIndex;
  if (index < 0 || index >= doc.pageCount) return null;
  try {
    const page = doc.page(index);
    return { doc, page, selected: page.blocks.filter((b) => s.selectedIds.includes(b.id)) };
  } catch {
    return null;
  }
}
