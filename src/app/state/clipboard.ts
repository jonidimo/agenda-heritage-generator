/**
 * Copiar, cortar, pegar y duplicar elementos propios. Usa los eventos `copy`, `cut` y `paste` del
 * documento (el sistema entrega el portapapeles sin pedir permisos) y guarda además una copia en
 * memoria, así los menús funcionan también cuando el navegador no deja leer el portapapeles. Los
 * elementos del programa no se copian: se ajustan en su lugar. Mientras se escribe en un campo, las
 * teclas son del campo.
 */
import { CustomBlockZ, type CustomBlock } from '@core/design/schema';
import type { Block, PageModel } from '@core/layout/prims';
import { z } from 'zod';
import { customBlocksOf, duplicateCustomBlock, hideBlocks, pasteCustomBlocks } from './actions';
import { documentFor } from './doc';
import { useStore } from './store';

/** Formato propio del portapapeles: lleva los elementos completos, no solo su texto. */
export const CLIPBOARD_MIME = 'application/x-heritage-blocks';

const MAX_COPIED = 50;
const PayloadZ = z.object({ app: z.literal('heritage-studio'), blocks: z.array(CustomBlockZ).min(1).max(MAX_COPIED) });

/** Lo último que se copió en esta ventana (sirve a los menús y cuando el sistema no deja leer). */
let internal: CustomBlock[] = [];

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
};

/** La página de la selección y sus bloques seleccionados; si no hay selección, la página actual. */
function selectionContext(): { page: PageModel; selected: Block[] } | null {
  const s = useStore.getState();
  if (!s.design) return null;
  const doc = documentFor(s.design, s.resVersion).doc;
  if (!doc) return null;
  const index = s.selection ? doc.plan.pages.findIndex((p) => p.key === s.selection!.pageKey) : s.pageIndex;
  if (index < 0 || index >= doc.pageCount) return null;
  const page = doc.page(index);
  return { page, selected: page.blocks.filter((b) => s.selectedIds.includes(b.id)) };
}

/** Los elementos propios seleccionados (con la página donde están). */
function selectedCopies(): { page: PageModel; blocks: Block[]; copies: CustomBlock[] } | null {
  const ctx = selectionContext();
  const design = useStore.getState().design;
  if (!ctx || !design) return null;
  const blocks = ctx.selected.filter((b) => b.role === 'custom');
  const copies = customBlocksOf(design, blocks).map((c) => JSON.parse(JSON.stringify(c)) as CustomBlock);
  return copies.length > 0 ? { page: ctx.page, blocks, copies } : null;
}

const textOf = (copies: readonly CustomBlock[]): string => copies.map((c) => (c.kind === 'text' ? String(c.props.text ?? '') : '')).filter(Boolean).join('\n');

/** Pone los elementos seleccionados en el portapapeles del sistema (si se puede) y en memoria. Devuelve si había algo. */
export function copySelection(data?: DataTransfer | null): boolean {
  const got = selectedCopies();
  if (!got) return false;
  internal = got.copies;
  const json = JSON.stringify({ app: 'heritage-studio', blocks: got.copies });
  if (data) {
    data.setData(CLIPBOARD_MIME, json);
    data.setData('text/plain', textOf(got.copies));
  } else void navigator.clipboard?.writeText(textOf(got.copies)).catch(() => undefined);
  return true;
}

export function cutSelection(data?: DataTransfer | null): boolean {
  const got = selectedCopies();
  if (!got || !copySelection(data)) return false;
  hideBlocks(got.page, got.blocks, useStore.getState().scope);
  useStore.getState().select(null);
  return true;
}

/** Pega en la página de la selección (o la actual). Los datos del evento mandan sobre la copia en memoria. */
export function pasteSelection(data?: DataTransfer | null): boolean {
  let copies = internal;
  const raw = data?.getData(CLIPBOARD_MIME);
  // Pegar algo de otra aplicación no es pegar lo último que se copió acá.
  if (data && !raw && data.types.length > 0) return false;
  if (raw) {
    try {
      const parsed = PayloadZ.safeParse(JSON.parse(raw));
      if (parsed.success) copies = parsed.data.blocks;
    } catch {
      // Un portapapeles con otra cosa: se usa lo que se copió en esta ventana, si hay.
    }
  }
  const ctx = selectionContext();
  if (!ctx || copies.length === 0) return false;
  pasteCustomBlocks(ctx.page, copies, useStore.getState().scope);
  return true;
}

/** Duplica los elementos propios seleccionados (cada copia, corrida 5 mm). */
export function duplicateSelection(): boolean {
  const got = selectedCopies();
  if (!got) return false;
  for (const b of got.blocks) duplicateCustomBlock(got.page, b);
  return true;
}

/** Engancha el portapapeles y Ctrl/⌘+D al documento. Devuelve la función que lo desengancha. */
export function installClipboard(): () => void {
  const onCopy = (e: ClipboardEvent): void => {
    if (typing(e.target)) return;
    if (copySelection(e.clipboardData)) e.preventDefault();
  };
  const onCut = (e: ClipboardEvent): void => {
    if (typing(e.target)) return;
    if (cutSelection(e.clipboardData)) e.preventDefault();
  };
  const onPaste = (e: ClipboardEvent): void => {
    if (typing(e.target)) return;
    if (pasteSelection(e.clipboardData)) e.preventDefault();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (typing(e.target) || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'd') return;
    if (duplicateSelection()) e.preventDefault();
  };
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);
  window.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCut);
    document.removeEventListener('paste', onPaste);
    window.removeEventListener('keydown', onKey);
  };
}
