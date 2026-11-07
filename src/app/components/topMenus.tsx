/**
 * Los menús de la barra superior: Archivo (la agenda y sus archivos), Edición, Ver, Ajustes (cómo se
 * ve y se comporta el programa) y Ayuda. Las teclas de cada acción van a la derecha.
 */
import {
  Archive,
  Bug,
  BookOpen,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  FileDown,
  FilePlus,
  FolderOpen,
  Info,
  LayoutTemplate,
  Link2,
  MousePointer2,
  PanelLeft,
  Redo2,
  Save,
  Scissors,
  SquareDashedMousePointer,
  Undo2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
  Keyboard,
  Sparkles,
  Ruler,
  Maximize,
} from 'lucide-react';
import { useAssistant } from '../state/ai/assistant';
import { copySelection, cutSelection, duplicateSelection, pasteSelection } from '../state/clipboard';
import { isDesktopShell, revealFile } from '../state/desktopBridge';
import { backupAll, openAnyFile, saveCurrent } from '../state/fileActions';
import { currentDocument, selectionContext } from '../state/selectionContext';
import { shortcutHint } from '../state/shortcutHints';
import { SHORTCUTS } from '../state/shortcuts';
import { activeView, useStore, viewsOf, type View } from '../state/store';
import { supportsUiScale } from '../state/uiScale';
import { UI_LANG_NAMES, UI_LANGS, useT, type UiKey, type UiLang } from '../i18n/ui';
import type { MenuItem } from './ContextMenu';
import { clampPage } from '../state/paging';
import { toggleFullscreen } from '../state/fullscreen';
import { UI_SCALE } from '../state/prefs';
import { Slider } from './ui';

type T = (key: UiKey, vars?: Record<string, string | number>) => string;

/** La guía para modelos de IA: en castellano o en inglés, según el idioma de la interfaz. */
export function llmGuideUrl(lang: UiLang): string {
  return `${__APP_HOMEPAGE__}/blob/main/docs/${lang === 'es' ? 'plantillas-llm.md' : 'llm-templates.md'}`;
}

/** Abre una dirección web fuera del programa (en el escritorio, en el navegador del sistema). */
function openWeb(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function fileMenu(t: T): MenuItem[] {
  const st = useStore.getState();
  const has = Boolean(st.design);
  const last = st.lastExport;
  return [
    { label: t('file.new'), icon: <FilePlus size={14} />, onSelect: () => st.setShowWelcome(true) },
    { label: t('file.open'), icon: <Upload size={14} />, hint: shortcutHint('file.open', t), onSelect: () => void openAnyFile() },
    { label: t('file.library'), icon: <FolderOpen size={14} />, onSelect: () => st.setShowLibrary(true) },
    { separator: true },
    { label: t('file.save'), icon: <Save size={14} />, hint: shortcutHint('file.save', t), disabled: !has, onSelect: () => void saveCurrent(false) },
    { label: t('file.saveAs'), icon: <FileDown size={14} />, hint: shortcutHint('file.saveAs', t), disabled: !has, onSelect: () => void saveCurrent(true) },
    { label: t('file.saveTemplate'), icon: <LayoutTemplate size={14} />, disabled: !has, onSelect: () => st.setShowSaveTemplate(true) },
    { separator: true },
    { label: t('paper.menu'), icon: <Ruler size={14} />, disabled: !has, onSelect: () => st.setShowPaper(true) },
    { label: t('file.backup'), icon: <Archive size={14} />, onSelect: () => void backupAll() },
    ...(last ? [{ separator: true as const }, { label: t('file.openLastFolder'), icon: <FolderOpen size={14} />, onSelect: () => void revealFile(last.path) }] : []),
  ];
}

/**
 * El tamaño de la interfaz: un deslizador con su número. El deslizador se aplica al soltar (agrandar
 * la interfaz mientras se arrastra movería el deslizador debajo del puntero) y el número, con Enter
 * o al dejar el campo; mientras tanto, solo cambia lo que se ve escrito.
 */
function UiScaleControl() {
  const t = useT();
  const uiScale = useStore((s) => s.uiScale);
  const setUiScale = useStore((s) => s.setUiScale);
  const pct = (v: number): number => Math.round(v * 100);
  return (
    <div className="w-[260px]" data-testid="ui-scale">
      <Slider
        label={t('file.uiScale')}
        value={pct(uiScale)}
        min={pct(UI_SCALE.min)}
        max={pct(UI_SCALE.max)}
        step={5}
        unit="%"
        integer
        defaultValue={pct(UI_SCALE.default)}
        numberCommit="enter"
        onPreview={() => undefined}
        onChange={(v) => setUiScale(v / 100)}
      />
    </div>
  );
}

export function settingsMenu(t: T): MenuItem[] {
  const st = useStore.getState();
  return [
    // Cada idioma con su propio nombre: quien no entiende el actual encuentra el suyo.
    { heading: t('top.lang') },
    ...UI_LANGS.map((l): MenuItem => ({ label: UI_LANG_NAMES[l], checked: st.uiLang === l, onSelect: () => st.setUiLang(l) })),
    // El tamaño de la interfaz usa `zoom`: los navegadores que no lo tienen no lo ofrecen.
    ...(supportsUiScale() ? [{ separator: true as const }, { label: t('file.uiScale'), custom: <UiScaleControl /> }] : []),
    { separator: true },
    { label: t('settings.welcomeOnStart'), checked: st.welcomeOnStart, onSelect: () => st.setWelcomeOnStart(!st.welcomeOnStart) },
    { label: t('file.autoReveal'), checked: st.autoReveal, onSelect: () => st.setAutoReveal(!st.autoReveal) },
    { separator: true },
    { label: t('file.aiSettings'), icon: <Sparkles size={14} />, onSelect: () => useAssistant.getState().setShowSettings(true) },
    // El puente con un modelo de IA existe solo en la aplicación de escritorio.
    ...(isDesktopShell() ? [{ label: t('file.liveLink'), checked: st.liveLink, onSelect: () => st.setLiveLink(!st.liveLink) }] : []),
  ];
}

export function helpMenu(t: T): MenuItem[] {
  const st = useStore.getState();
  return [
    { label: t('file.shortcuts'), icon: <Keyboard size={14} />, hint: shortcutHint('help.shortcuts', t), onSelect: () => st.setShowShortcuts(true) },
    { label: t('help.llmGuide'), icon: <BookOpen size={14} />, onSelect: () => openWeb(llmGuideUrl(st.uiLang)) },
    { label: t('about.issues'), icon: <Bug size={14} />, onSelect: () => openWeb(`${__APP_HOMEPAGE__}/issues`) },
    { separator: true },
    { label: t('file.about'), icon: <Info size={14} />, onSelect: () => st.setShowAbout(true) },
  ];
}

/** Ejecuta un atajo del registro como si se hubiera apretado la tecla (para los ítems de menú). */
function run(id: string): void {
  const s = SHORTCUTS.find((x) => x.id === id);
  // Los atajos de menú no usan el evento: algunos (las flechas) sí, pero ninguno de los que se ofrecen acá.
  s?.run?.(new KeyboardEvent('keydown'));
}

/** Cuántos elementos tiene ocultos la página actual (maqueta solo si hay alguno). */
function hiddenCount(): number {
  const doc = currentDocument();
  if (!doc || doc.pageCount === 0) return 0;
  try {
    return doc.hidden(clampPage(useStore.getState().pageIndex, doc.pageCount)).length;
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
    { separator: true },
    { label: t('paper.menu'), icon: <Ruler size={14} />, disabled: !has, onSelect: () => st.setShowPaper(true) },
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
    { label: t('sc.view.fullscreen'), icon: <Maximize size={14} />, checked: st.focusMode, hint: shortcutHint('view.fullscreen', t), onSelect: () => toggleFullscreen() },
    { label: t('sc.view.sidebar'), icon: <PanelLeft size={14} />, checked: st.sidebarOpen, hint: shortcutHint('view.sidebar', t), onSelect: () => st.setSidebarOpen(!st.sidebarOpen) },
    { label: t('sc.view.guides'), checked: st.guides, hint: shortcutHint('view.guides', t), onSelect: () => st.toggleGuides() },
    { label: t('sc.view.snap'), checked: st.snap, hint: shortcutHint('view.snap', t), onSelect: () => st.toggleSnap() },
    { label: t('sc.view.links'), icon: <Link2 size={14} />, checked: st.showLinks, hint: shortcutHint('view.links', t), onSelect: () => st.setShowLinks(!st.showLinks) },
    { label: t('view.aiPill'), icon: <Sparkles size={14} />, checked: ai.settings.pill, hint: shortcutHint('ai.focus', t), onSelect: () => ai.updateSettings((x) => ({ ...x, pill: !x.pill })) },
  ];
}
