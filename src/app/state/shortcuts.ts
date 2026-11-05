/**
 * Atajos de teclado: un solo registro con todo lo que tiene tecla, un solo oyente y el texto de
 * ayuda que se muestra en el diálogo y en los menús salen de la misma lista. Antes cada
 * pieza de la interfaz tenía su oyente y nadie sabía qué teclas estaban tomadas.
 *
 * Una tecla «Mod» es Ctrl, o ⌘ en un Mac. Nunca se toma una tecla mientras se escribe en un campo
 * (salvo las marcadas `typing`), y Ctrl con Alt es AltGr en varias distribuciones: no cuenta como Ctrl.
 */
import { blockBounds } from '@core/document/layout';
import { unionRect } from '@core/layout/align';
import type { Block } from '@core/layout/prims';
import { clampMoveDelta, hideBlocks, moveBlocks } from './actions';
import { duplicateSelection } from './clipboard';
import { openAnyFile, saveCurrent } from './fileActions';
import { goBack, goForward } from './navigation';
import { pageStep } from './paging';
import { currentDocument, selectionContext } from './selectionContext';
import { scrollRectIntoView, zoomToRect } from './viewport';
import { PANEL_ORDER, useStore, ZOOM, type View } from './store';
import { isTyping } from './typing';

export type ShortcutGroup = 'file' | 'edit' | 'select' | 'view' | 'navigate' | 'panels' | 'help';

/** El orden de los grupos en la ayuda. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['file', 'edit', 'select', 'view', 'navigate', 'panels', 'help'];

/** Una combinación de teclas. Las modificadoras que no se nombran deben estar sueltas (salvo `'any'`). */
export interface Chord {
  /** `KeyboardEvent.key` (sin importar mayúsculas). */
  key?: string;
  /** `KeyboardEvent.code`: para las teclas que no dependen de la distribución (los dígitos). */
  code?: string;
  mod?: boolean;
  shift?: boolean | 'any';
  alt?: boolean | 'any';
}

/** Lo que se usa de un evento de teclado (así se prueba sin navegador). */
export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchesChord(c: Chord, e: KeyLike): boolean {
  if ((e.ctrlKey || e.metaKey) !== (c.mod === true)) return false;
  if (c.shift !== 'any' && e.shiftKey !== (c.shift === true)) return false;
  // Ctrl+Alt es AltGr: sin pedirlo expresamente, una Alt apretada no deja pasar la combinación.
  if (c.alt !== 'any' && e.altKey !== (c.alt === true)) return false;
  if (c.code !== undefined) return e.code === c.code;
  if (c.key === undefined) return false;
  return e.key.length === 1 ? e.key.toLowerCase() === c.key.toLowerCase() : e.key === c.key;
}

export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  chords: readonly Chord[];
  /** Se atiende también mientras se escribe en un campo (el zoom, la ayuda). */
  typing?: boolean;
  /** Lo atiende el navegador (copiar, cortar, pegar): figura en la ayuda pero no tiene acción acá. */
  native?: boolean;
  /** Devuelve `false` si no corresponde en este momento (así la tecla sigue su camino). */
  run?(e: KeyboardEvent): boolean | void;
}

/* ---------- Acciones ---------- */

const state = () => useStore.getState();

function selectedMovable(): { page: NonNullable<ReturnType<typeof selectionContext>>['page']; blocks: Block[] } | null {
  const ctx = selectionContext();
  if (!ctx) return null;
  const blocks = ctx.selected.filter((b) => b.editable);
  return blocks.length > 0 ? { page: ctx.page, blocks } : null;
}

/** Los bloques de la página que se pueden elegir con el teclado, en el orden en que se dibujan. */
function pickable(blocks: readonly Block[]): Block[] {
  return blocks.filter((b) => b.editable && b.role !== 'chrome');
}

function select(block: Block, page: { key: string; type: string }, ids?: string[]): void {
  state().setSelection({ pageKey: page.key, pageType: page.type, blockId: block.id, role: block.role }, ids);
}

function stepSelection(dir: 1 | -1): boolean {
  const ctx = selectionContext();
  if (!ctx) return false;
  const list = pickable(ctx.page.blocks);
  if (list.length === 0) return false;
  const cur = state().selection ? list.findIndex((b) => b.id === state().selection!.blockId) : -1;
  const next = list[(cur + dir + list.length) % list.length]!;
  select(next, ctx.page);
  scrollRectIntoView(ctx.page.index, blockBounds(next));
  return true;
}

function nudge(e: KeyboardEvent): boolean {
  const sel = selectedMovable();
  if (!sel) return false;
  const step = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5;
  const [dx, dy] = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : [0, step];
  const c = clampMoveDelta(sel.page, unionRect(sel.blocks.map(blockBounds)), dx, dy);
  moveBlocks(sel.page, sel.blocks.map((b) => ({ block: b, dx: c.dx, dy: c.dy })), state().scope, `nudge:${sel.blocks.map((b) => b.id).join(',')}`);
  return true;
}

function hideSelection(scope: 'current' | 'type'): boolean {
  const sel = selectedMovable();
  if (!sel) return false;
  hideBlocks(sel.page, sel.blocks, scope === 'type' ? 'type' : state().scope);
  state().select(null);
  return true;
}

function selectAll(): boolean {
  const ctx = selectionContext();
  if (!ctx) return false;
  const list = pickable(ctx.page.blocks);
  if (list.length === 0) return false;
  select(list[list.length - 1]!, ctx.page, list.map((b) => b.id));
  return true;
}

/** ¿El foco está en la página (o en nada)? Enter sobre un botón enfocado es del botón. */
function onCanvas(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !el || el === document.body || el.closest('[data-page-index]') !== null;
}

function editText(e: KeyboardEvent): boolean {
  if (e.key === 'Enter' && !onCanvas(e.target)) return false;
  const ctx = selectionContext();
  const sel = ctx?.selected;
  if (!ctx || !sel || sel.length !== 1 || !sel[0]!.text) return false;
  state().requestTextEdit({ pageKey: ctx.page.key, blockId: sel[0]!.id });
  return true;
}

/** Acerca la vista al elemento elegido (a todos los elegidos, si son varios). */
function zoomToSelection(): boolean {
  const ctx = selectionContext();
  if (!ctx || ctx.selected.length === 0) return false;
  void zoomToRect(ctx.page.index, unionRect(ctx.selected.map(blockBounds)));
  return true;
}

const VIEWS: readonly View[] = ['page', 'spread', 'sheet', 'book'];

function openPanel(panel: (typeof PANEL_ORDER)[number]): boolean {
  if (!state().design) return false;
  state().setPanel(panel);
  state().setSidebarOpen(true);
  return true;
}

function page(dir: 1 | -1): boolean {
  const count = currentDocument()?.pageCount ?? 0;
  if (count === 0) return false;
  state().goToPage(pageStep(state().view, state().pageIndex, count, dir));
  return true;
}

const digit = (n: number): Chord[] => [
  { code: `Digit${n}`, mod: true },
  // En un navegador Ctrl+1…8 cambia de pestaña del navegador y la página no lo recibe.
  { code: `Digit${n}`, alt: true, shift: true },
];

/* ---------- El registro ---------- */

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'file.save', group: 'file', chords: [{ key: 's', mod: true }], run: () => void saveCurrent(false) },
  { id: 'file.saveAs', group: 'file', chords: [{ key: 's', mod: true, shift: true }], run: () => void saveCurrent(true) },
  { id: 'file.open', group: 'file', chords: [{ key: 'o', mod: true }], run: () => void openAnyFile() },
  { id: 'file.export', group: 'file', chords: [{ key: 'e', mod: true }], run: () => openPanel('print') },
  {
    id: 'file.print',
    group: 'file',
    chords: [{ key: 'p', mod: true }],
    run: () => {
      if (!openPanel('print')) return false;
      state().setView('sheet');
    },
  },

  { id: 'edit.undo', group: 'edit', chords: [{ key: 'z', mod: true }], run: () => state().undo() },
  { id: 'edit.redo', group: 'edit', chords: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }], run: () => state().redo() },
  { id: 'edit.copy', group: 'edit', chords: [{ key: 'c', mod: true }], native: true },
  { id: 'edit.cut', group: 'edit', chords: [{ key: 'x', mod: true }], native: true },
  { id: 'edit.paste', group: 'edit', chords: [{ key: 'v', mod: true }], native: true },
  { id: 'edit.duplicate', group: 'edit', chords: [{ key: 'd', mod: true }], run: () => duplicateSelection() },
  { id: 'edit.delete', group: 'edit', chords: [{ key: 'Delete' }, { key: 'Backspace' }], run: () => hideSelection('current') },
  { id: 'edit.hide', group: 'edit', chords: [{ key: 'h', mod: true }], run: () => hideSelection('current') },
  { id: 'edit.hideType', group: 'edit', chords: [{ key: 'h', mod: true, shift: true }], run: () => hideSelection('type') },
  {
    id: 'edit.nudge',
    group: 'edit',
    chords: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map((key) => ({ key, shift: 'any' as const, alt: 'any' as const })),
    run: nudge,
  },
  { id: 'edit.editText', group: 'edit', chords: [{ key: 'F2' }, { key: 'Enter' }], run: editText },

  { id: 'select.all', group: 'select', chords: [{ key: 'a', mod: true }], run: selectAll },
  {
    id: 'select.none',
    group: 'select',
    chords: [{ key: 'Escape' }, { key: 'a', mod: true, shift: true }],
    run: () => {
      if (!state().selection) return false;
      state().select(null);
    },
  },
  { id: 'select.next', group: 'select', chords: [{ key: ']' }], run: () => stepSelection(1) },
  { id: 'select.prev', group: 'select', chords: [{ key: '[' }], run: () => stepSelection(-1) },

  { id: 'view.zoomIn', group: 'view', typing: true, chords: [{ key: '+', mod: true, shift: 'any' }, { key: '=', mod: true, shift: 'any' }], run: () => state().zoomBy(ZOOM.step) },
  { id: 'view.zoomOut', group: 'view', typing: true, chords: [{ key: '-', mod: true, shift: 'any' }, { key: '_', mod: true, shift: 'any' }], run: () => state().zoomBy(1 / ZOOM.step) },
  { id: 'view.zoomFit', group: 'view', typing: true, chords: [{ key: '0', mod: true }], run: () => state().zoomFit() },
  { id: 'view.zoom100', group: 'view', typing: true, chords: [{ code: 'Digit0', mod: true, shift: true }], run: () => state().setZoom(1, false) },
  { id: 'view.zoomSelection', group: 'view', typing: true, chords: [{ code: 'Digit2', mod: true, shift: true }], run: zoomToSelection },
  {
    id: 'view.cycle',
    group: 'view',
    chords: [{ key: 'v' }],
    run: () => {
      if (!state().design) return false;
      state().setView(VIEWS[(VIEWS.indexOf(state().view) + 1) % VIEWS.length]!);
    },
  },
  { id: 'view.sidebar', group: 'view', chords: [{ key: 'b', mod: true }], run: () => state().setSidebarOpen(!state().sidebarOpen) },
  { id: 'view.guides', group: 'view', chords: [{ key: "'", mod: true }], run: () => state().toggleGuides() },
  { id: 'view.snap', group: 'view', chords: [{ key: ';', mod: true }], run: () => state().toggleSnap() },
  { id: 'view.links', group: 'view', chords: [{ key: 'l', mod: true, shift: true }], run: () => state().setShowLinks(!state().showLinks) },

  { id: 'nav.next', group: 'navigate', chords: [{ key: 'PageDown' }, { key: 'ArrowRight' }], run: (e) => (e.key === 'ArrowRight' && state().selection ? false : page(1)) },
  { id: 'nav.prev', group: 'navigate', chords: [{ key: 'PageUp' }, { key: 'ArrowLeft' }], run: (e) => (e.key === 'ArrowLeft' && state().selection ? false : page(-1)) },
  { id: 'nav.first', group: 'navigate', chords: [{ key: 'Home' }], run: () => (state().design ? void state().goToPage(0) : false) },
  { id: 'nav.last', group: 'navigate', chords: [{ key: 'End' }], run: () => (currentDocument() ? void state().goToPage(currentDocument()!.pageCount - 1) : false) },
  { id: 'nav.back', group: 'navigate', chords: [{ key: 'ArrowLeft', alt: true }], run: () => goBack() },
  { id: 'nav.forward', group: 'navigate', chords: [{ key: 'ArrowRight', alt: true }], run: () => goForward() },

  ...PANEL_ORDER.map((panel, i): Shortcut => ({ id: `panel.${panel}`, group: 'panels', typing: true, chords: digit(i + 1), run: () => openPanel(panel) })),

  { id: 'search.open', group: 'help', typing: true, chords: [{ key: 'f', mod: true }, { key: 'k', mod: true }, { key: '/' }], run: (e) => (e.key === '/' && isTyping(e.target) ? false : state().setSearchOpen(true)) },
  { id: 'help.shortcuts', group: 'help', typing: true, chords: [{ key: 'F1' }, { key: '/', mod: true }, { key: '?', shift: 'any' }], run: (e) => (e.key === '?' && isTyping(e.target) ? false : state().setShowShortcuts(true)) },
];

/** Los atajos que podrían atender este evento, en el orden del registro. */
export function shortcutsFor(e: KeyLike, typing: boolean): Shortcut[] {
  return SHORTCUTS.filter((s) => s.run && (!typing || s.typing === true) && s.chords.some((c) => matchesChord(c, e)));
}

/** Engancha el oyente único de teclado. Devuelve la función que lo desengancha. */
export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    // Si el primero no corresponde ahora (`false`: p. ej. las flechas sin nada elegido), sigue el siguiente
    // (Alt+← sin elemento elegido es «Atrás»); si ninguno, la tecla sigue su camino.
    // Con un diálogo abierto, solo las teclas que valen escribiendo (zoom, buscar, ayuda): nada se mueve detrás.
    const modal = document.querySelector('[aria-modal="true"]') !== null;
    for (const s of shortcutsFor(e, isTyping(e.target) || modal)) {
      if (s.run!(e) !== false) {
        e.preventDefault();
        return;
      }
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** Cómo se escribe una combinación para mostrarla: «Ctrl+Mayús+S», o «⌘⇧S» en un Mac. */
export function formatChord(c: Chord, mac: boolean, names: { ctrl: string; shift: string; alt: string }): string {
  const base = c.code?.startsWith('Digit') ? c.code.slice(5) : c.key === ' ' ? 'Espacio' : (c.key ?? '').length === 1 ? (c.key ?? '').toUpperCase() : (c.key ?? '');
  const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  const key = arrows[base] ?? base;
  if (mac) return `${c.mod ? '⌘' : ''}${c.alt === true ? '⌥' : ''}${c.shift === true ? '⇧' : ''}${key}`;
  return [c.mod ? names.ctrl : '', c.alt === true ? names.alt : '', c.shift === true ? names.shift : '', key].filter(Boolean).join('+');
}
