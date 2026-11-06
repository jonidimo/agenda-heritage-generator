/**
 * Llevar a la persona a una página (por número o por clave) y, si se pide, dejar elegido un elemento:
 * lo usan el puente en vivo del MCP y el asistente de la aplicación, para mostrar de qué hablan.
 */
import { jumpToPage } from './navigation';
import { currentDocument } from './selectionContext';
import { useStore } from './store';

export interface RevealRequest {
  /** Número de página, desde 1. */
  page?: number | undefined;
  key?: string | undefined;
  blockId?: string | undefined;
}

export type RevealOutcome = { ok: true; page: number; key: string; selected: boolean } | { ok: false; reason: 'noDocument' } | { ok: false; reason: 'notFound'; pageCount: number };

/** Sin página ni clave, se queda en la actual (y puede elegir un elemento de ella). */
export function revealTarget(req: RevealRequest): RevealOutcome {
  const doc = currentDocument();
  if (!doc) return { ok: false, reason: 'noDocument' };
  const index = req.key !== undefined ? doc.indexOfKey(req.key) : req.page !== undefined ? req.page - 1 : useStore.getState().pageIndex;
  if (!Number.isInteger(index) || index < 0 || index >= doc.pageCount) return { ok: false, reason: 'notFound', pageCount: doc.pageCount };
  jumpToPage(index);
  const page = doc.page(index);
  const block = req.blockId !== undefined ? page.blocks.find((b) => b.id === req.blockId) : undefined;
  if (block) {
    const st = useStore.getState();
    st.setSelection({ pageKey: page.key, pageType: page.type, blockId: block.id, role: block.role });
    st.setInspectorOpen(true);
  }
  return { ok: true, page: index + 1, key: page.key, selected: block !== undefined };
}
