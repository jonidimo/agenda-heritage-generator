/** Los menús «Edición» y «Ver» de la barra superior, con las teclas de cada acción a la derecha. */
import { Copy, Crosshair, Eye, EyeOff, Link2, MousePointer2, PanelLeft, Redo2, Scissors, SquareDashedMousePointer, Undo2, Type, ZoomIn, ZoomOut, Keyboard, Sparkles } from 'lucide-react';
import { useAssistant } from '../state/ai/assistant';
import { copySelection, cutSelection, duplicateSelection, pasteSelection } from '../state/clipboard';
import { currentDocument, selectionContext } from '../state/selectionContext';
import { shortcutHint } from '../state/shortcutHints';
import { SHORTCUTS } from '../state/shortcuts';
import { activeView, useStore, viewsOf, type View } from '../state/store';
import type { UiKey } from '../i18n/ui';
import type { MenuItem } from './ContextMenu';

type T = (key: UiKey, vars?: Record<string, string | number>) => string;

/** Ejecuta un atajo del registro como si se hubiera apretado la tecla (para los ítems de menú). */
function run(id: string): void {
  const s = SHORTCUTS.find((x) => x.id === id);
  // Los atajos de menú no usan el evento: algunos (las flechas) sí, pero ninguno de los que se ofrecen acá.
  s?.run?.(new KeyboardEvent('keydown'));
}

/** Cuántos elementos tiene ocultos la página actual (maqueta solo si hay alguno). */
function hiddenCount(): number {
  const doc = currentDocument();
  if (!doc) return 0;
  try {
    return doc.hidden(Math.min(useStore.getState().pageIndex, doc.pageCount - 1)).length;
  } catch {
    return 0;
  }
}

export function editMenu(t: T): MenuItem[] {
  const st = useStore.getState();
  const has = Boolean(st.design);
  const selected = (selectionContext()?.selected ?? []).filter((b) => b.editable);
  const text = selected.length === 1 && selected[0]!.text !== undefined;
  const item = (id: string, label: UiKey, icon: React.ReactNode, onSelect: () => void, disabled = false): MenuItem => ({ label: t(label), icon, hint: shortcutHint(id, t), disabled, onSelect });
  return [
    item('edit.undo', 'top.undo', <Undo2 size={14} />, () => st.undo(), st.past.length === 0),
    item('edit.redo', 'top.redo', <Redo2 size={14} />, () => st.redo(), st.future.length === 0),
    { separator: true },
    item('edit.cut', 'menu.cut', <Scissors size={14} />, () => void cutSelection(), selected.length === 0),
    item('edit.copy', 'menu.copy', <Copy size={14} />, () => void copySelection(), selected.length === 0),
    item('edit.paste', 'menu.paste', <Copy size={14} />, () => void pasteSelection(), !has),
    item('edit.duplicate', 'menu.duplicate', <Copy size={14} />, () => void duplicateSelection(), selected.length === 0),
    { separator: true },
    item('select.all', 'sc.select.all', <SquareDashedMousePointer size={14} />, () => run('select.all'), !has),
    item('select.none', 'sc.select.none', <MousePointer2 size={14} />, () => st.select(null), !st.selection),
    { separator: true },
    item('edit.editText', 'sc.edit.editText', <Type size={14} />, () => run('edit.editText'), !text),
    item('edit.hide', 'sc.edit.hide', <Eye size={14} />, () => run('edit.hide'), selected.length === 0),
    { label: t('menu.showHidden'), icon: <EyeOff size={14} />, disabled: hiddenCount() === 0, onSelect: () => st.setShowHidden(true) },
  ];
}

const VIEW_LABELS: Array<[View, UiKey]> = [
  ['page', 'view.page'],
  ['spread', 'view.spread'],
  ['sheet', 'view.sheet'],
  ['book', 'view.book'],
];

export function viewMenu(t: T): MenuItem[] {
  const st = useStore.getState();
  const ai = useAssistant.getState();
  const screen = st.design?.binding.target === 'screen';
  return [
    { label: t('sc.view.zoomIn'), icon: <ZoomIn size={14} />, hint: shortcutHint('view.zoomIn', t), onSelect: () => st.zoomBy(1.2) },
    { label: t('sc.view.zoomOut'), icon: <ZoomOut size={14} />, hint: shortcutHint('view.zoomOut', t), onSelect: () => st.zoomBy(1 / 1.2) },
    { label: t('sc.view.zoomFit'), icon: <Crosshair size={14} />, hint: shortcutHint('view.zoomFit', t), onSelect: () => st.zoomFit() },
    { label: t('sc.view.zoom100'), hint: shortcutHint('view.zoom100', t), onSelect: () => st.setZoom(1, false) },
    { label: t('sc.view.zoomSelection'), hint: shortcutHint('view.zoomSelection', t), disabled: !st.selection, onSelect: () => run('view.zoomSelection') },
    { separator: true },
    { label: t('mode.design'), checked: st.mode === 'design', onSelect: () => st.setMode('design') },
    { label: t('mode.print'), checked: st.mode === 'print', onSelect: () => st.setMode('print') },
    { separator: true },
    ...VIEW_LABELS.filter(([v]) => viewsOf(st.mode, screen).includes(v)).map(([v, key]): MenuItem => ({ label: t(key), checked: activeView(st) === v, onSelect: () => st.setView(v) })),
    { separator: true },
    { label: t('sc.view.sidebar'), icon: <PanelLeft size={14} />, checked: st.sidebarOpen, hint: shortcutHint('view.sidebar', t), onSelect: () => st.setSidebarOpen(!st.sidebarOpen) },
    { label: t('sc.view.guides'), checked: st.guides, hint: shortcutHint('view.guides', t), onSelect: () => st.toggleGuides() },
    { label: t('sc.view.snap'), checked: st.snap, hint: shortcutHint('view.snap', t), onSelect: () => st.toggleSnap() },
    { label: t('sc.view.links'), icon: <Link2 size={14} />, checked: st.showLinks, hint: shortcutHint('view.links', t), onSelect: () => st.setShowLinks(!st.showLinks) },
    { label: t('view.aiPill'), icon: <Sparkles size={14} />, checked: ai.settings.pill, hint: shortcutHint('ai.focus', t), onSelect: () => ai.updateSettings((x) => ({ ...x, pill: !x.pill })) },
    { separator: true },
    { label: t('file.shortcuts'), icon: <Keyboard size={14} />, hint: shortcutHint('help.shortcuts', t), onSelect: () => st.setShowShortcuts(true) },
  ];
}
