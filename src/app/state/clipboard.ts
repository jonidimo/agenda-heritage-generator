/**
 * Copiar, cortar, pegar y duplicar elementos. Usa los eventos `copy`, `cut` y `paste` del documento
 * (el sistema entrega el portapapeles sin pedir permisos) y guarda además una copia en memoria, así
 * los menús funcionan también cuando el navegador no deja leer el portapapeles. Un elemento del
 * programa (un nombre de mes, un marco, un filete) se copia como elemento propio: un texto editable o
 * un dibujo (ver `snapshot.ts`); el original no cambia. Mientras se escribe en un campo, las teclas
 * son del campo.
 */
import { CustomBlockZ, type CustomBlock } from '@core/design/schema';
import type { Block, PageModel } from '@core/layout/prims';
import { z } from 'zod';
import { newId } from '@core/util/hash';
import { resolveStrings } from '@core/i18n';
import { customBlockFromBlock } from '@core/document/snapshot';
import { customBlocksOf, hideBlocks, pasteCustomBlocks } from './actions';
import { isTyping } from './typing';
import { selectionContext } from './selectionContext';
import { useStore } from './store';

/** Formato propio del portapapeles: lleva los elementos completos, no solo su texto. */
export const CLIPBOARD_MIME = 'application/x-heritage-blocks';

const MAX_COPIED = 50;
const PayloadZ = z.object({ app: z.literal('heritage-studio'), blocks: z.array(CustomBlockZ).min(1).max(MAX_COPIED) });

/** Lo último que se copió en esta ventana (sirve a los menús y cuando el sistema no deja leer). */
let internal: CustomBlock[] = [];

/**
 * Lo seleccionado como elementos propios, con la página donde está: los propios tal cual y los del
 * programa convertidos (un texto, o un dibujo). Las marcas de agua y lo que no se puede editar no se copian.
 */
function selectedCopies(): { page: PageModel; blocks: Block[]; copies: CustomBlock[] } | null {
  const ctx = selectionContext();
  const design = useStore.getState().design;
  if (!ctx || !design) return null;
  const blocks = ctx.selected.filter((b) => b.editable && b.role !== 'watermark');
  const snap = { fonts: ctx.doc.ctx.fonts, design, strings: resolveStrings(design.locale) };
  const copies: CustomBlock[] = [];
  for (const b of blocks) {
    if (b.role === 'custom') {
      for (const c of customBlocksOf(design, [b])) copies.push(JSON.parse(JSON.stringify(c)) as CustomBlock);
    } else {
      const c = customBlockFromBlock(snap, ctx.page, b, newId('el'));
      if (c) copies.push(c);
    }
  }
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

/**
 * De dónde sale lo que se pega: los elementos que trae el portapapeles (`payload`), los que se copiaron en
 * esta ventana (`internal`), o nada porque el portapapeles trae otra cosa (`foreign`). Copiar desde el menú
 * Edición no puede escribir el formato propio (solo el texto), así que un portapapeles que trae exactamente
 * el texto de lo último copiado acá es esa copia.
 */
export function pasteSource(data: { types: readonly string[]; getData(type: string): string } | null | undefined, internalText: string | null): 'payload' | 'internal' | 'foreign' {
  if (!data) return 'internal';
  if (data.getData(CLIPBOARD_MIME)) return 'payload';
  if (data.types.length === 0) return 'internal';
  const onlyText = data.types.every((t) => t === 'text/plain');
  return onlyText && internalText !== null && data.getData('text/plain') === internalText ? 'internal' : 'foreign';
}

/** Pega en la página de la selección (o la actual). Los datos del evento mandan sobre la copia en memoria. */
export function pasteSelection(data?: DataTransfer | null): boolean {
  let copies = internal;
  const source = pasteSource(data, internal.length > 0 ? textOf(internal) : null);
  // Pegar algo de otra aplicación no es pegar lo último que se copió acá.
  if (source === 'foreign') return false;
  const raw = source === 'payload' ? data?.getData(CLIPBOARD_MIME) : undefined;
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

/** Duplica lo seleccionado en la misma página (cada copia, corrida 5 mm). Un elemento de una sola página sigue siéndolo. */
export function duplicateSelection(): boolean {
  const got = selectedCopies();
  if (!got) return false;
  pasteCustomBlocks(got.page, got.copies, got.copies.every((c) => c.pageKey !== null) ? 'page' : useStore.getState().scope);
  return true;
}

/** Engancha el portapapeles del sistema (copiar, cortar y pegar) al documento; Ctrl/⌘+D es un atajo del registro (`shortcuts.ts`). Devuelve la función que lo desengancha. */
export function installClipboard(): () => void {
  const onCopy = (e: ClipboardEvent): void => {
    if (isTyping(e.target)) return;
    if (copySelection(e.clipboardData)) e.preventDefault();
  };
  const onCut = (e: ClipboardEvent): void => {
    if (isTyping(e.target)) return;
    if (cutSelection(e.clipboardData)) e.preventDefault();
  };
  const onPaste = (e: ClipboardEvent): void => {
    if (isTyping(e.target)) return;
    if (pasteSelection(e.clipboardData)) e.preventDefault();
  };
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);
  return () => {
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCut);
    document.removeEventListener('paste', onPaste);
  };
}
