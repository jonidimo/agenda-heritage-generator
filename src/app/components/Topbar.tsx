import { Archive, ArrowLeft, Eye, Keyboard, Pencil, PenTool, ArrowRight, BookOpen, Search, Columns2, File, FileDown, FolderOpen, Grid3x3, Info, LayoutTemplate, Link2, Magnet, Maximize, PanelLeft, Printer, Redo2, Ruler, Save, Sparkles, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect } from 'react';
import { backupAll, openAnyFile, saveCurrent } from '../state/fileActions';
import { openMenuAt, type MenuItem } from './ContextMenu';
import { editMenu, viewMenu } from './topMenus';
import { shortcutHint } from '../state/shortcutHints';
import { UI_LANG_NAMES, UI_LANGS, useT } from '../i18n/ui';
import { UI_SCALE } from '../state/prefs';
import { activeView, useStore, viewsOf, ZOOM, type Mode, type View } from '../state/store';
import { supportsUiScale } from '../state/uiScale';
import { IconButton, Segmented } from './ui';
import { goBack, goForward } from '../state/navigation';
import { isDesktopShell, revealFile } from '../state/desktopBridge';
import { useAssistant } from '../state/ai/assistant';
import { SearchPalette } from './SearchPalette';

/** Un botón de la barra que abre un menú justo debajo; el menú se arma al abrirlo, con lo que haya en ese momento. */
function MenuButton({ label, icon, build }: { label: string; icon: React.ReactNode; build: () => MenuItem[] }) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      title={label}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold hover:bg-black/5"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        openMenuAt({ clientX: r.left, clientY: r.bottom + 4, preventDefault: () => undefined }, build());
      }}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

const VIEW_ICONS: Record<View, React.ReactNode> = {
  page: <File size={14} />,
  spread: <BookOpen size={14} />,
  sheet: <Columns2 size={14} />,
  book: <Grid3x3 size={14} />,
};

export function Topbar() {
  const t = useT();
  const design = useStore((s) => s.design);
  const update = useStore((s) => s.update);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const view = useStore(activeView);
  const setView = useStore((s) => s.setView);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const screen = useStore((s) => s.design?.binding.target === 'screen');
  const fit = useStore((s) => s.fit);
  const zoomBy = useStore((s) => s.zoomBy);
  const zoomFit = useStore((s) => s.zoomFit);
  const lang = useStore((s) => s.uiLang);
  const setLang = useStore((s) => s.setUiLang);
  const uiScale = useStore((s) => s.uiScale);
  const setUiScale = useStore((s) => s.setUiScale);
  const autoReveal = useStore((s) => s.autoReveal);
  const lastExport = useStore((s) => s.lastExport);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);
  const setAutoReveal = useStore((s) => s.setAutoReveal);
  const liveLink = useStore((s) => s.liveLink);
  const setLiveLink = useStore((s) => s.setLiveLink);
  const setShowAbout = useStore((s) => s.setShowAbout);
  const setShowLibrary = useStore((s) => s.setShowLibrary);
  const setShowSaveTemplate = useStore((s) => s.setShowSaveTemplate);
  const setPanel = useStore((s) => s.setPanel);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const guides = useStore((s) => s.guides);
  const toggleGuides = useStore((s) => s.toggleGuides);
  const snap = useStore((s) => s.snap);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const showLinks = useStore((s) => s.showLinks);
  const searching = useStore((s) => s.searchOpen);
  const setSearching = useStore((s) => s.setSearchOpen);
  const canBack = useStore((s) => s.navBack.length > 0);
  const canForward = useStore((s) => s.navForward.length > 0);
  // Los botones laterales del mouse, como en un navegador (Alt+← y Alt+→ están en el registro de atajos).
  useEffect(() => {
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) goBack();
      else if (e.button === 4) goForward();
      else return;
      e.preventDefault();
    };
    window.addEventListener('mouseup', onMouse);
    return () => window.removeEventListener('mouseup', onMouse);
  }, []);
  const setShowLinks = useStore((s) => s.setShowLinks);

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-2 py-1.5">
      <IconButton label={t('top.menu')} onClick={() => setSidebarOpen(!sidebarOpen)} active={sidebarOpen}>
        <PanelLeft size={18} />
      </IconButton>
      <button type="button" onClick={() => setShowLibrary(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold hover:bg-black/5" title={t('top.library')}>
        <FolderOpen size={16} />
        <span className="hidden xl:inline">{t('top.library')}</span>
      </button>
      <MenuButton label={t('file.menu')} icon={<Save size={16} />} build={() => [
            { label: t('file.save'), icon: <Save size={14} />, hint: shortcutHint('file.save', t), disabled: !design, onSelect: () => void saveCurrent(false) },
            { label: t('file.saveAs'), icon: <FileDown size={14} />, hint: shortcutHint('file.saveAs', t), disabled: !design, onSelect: () => void saveCurrent(true) },
            { label: t('file.open'), icon: <Upload size={14} />, hint: shortcutHint('file.open', t), onSelect: () => void openAnyFile() },
            { separator: true },
            { label: t('file.saveTemplate'), icon: <LayoutTemplate size={14} />, disabled: !design, onSelect: () => setShowSaveTemplate(true) },
            { label: t('file.backup'), icon: <Archive size={14} />, onSelect: () => void backupAll() },
            { separator: true },
            { heading: t('top.lang') },
            ...UI_LANGS.map((l) => ({ label: UI_LANG_NAMES[l], checked: lang === l, onSelect: () => setLang(l) })),
            // El tamaño de la interfaz usa `zoom`: los navegadores que no lo tienen no lo ofrecen.
            ...(supportsUiScale()
              ? [{ separator: true }, { heading: t('file.uiScale') }, ...UI_SCALE.presets.map((p) => ({ label: `${Math.round(p * 100)} %`, checked: Math.abs(uiScale - p) < 0.005, onSelect: () => setUiScale(p) }))]
              : []),
            ...(lastExport ? [{ label: t('file.openLastFolder'), onSelect: () => void revealFile(lastExport.path) }, { separator: true as const }] : [{ separator: true as const }]),
            { label: t('file.autoReveal'), checked: autoReveal, onSelect: () => setAutoReveal(!autoReveal) },
            { label: t('file.aiSettings'), icon: <Sparkles size={14} />, onSelect: () => useAssistant.getState().setShowSettings(true) },
            // El puente con un modelo de IA existe solo en la aplicación de escritorio.
            ...(isDesktopShell() ? [{ label: t('file.liveLink'), checked: liveLink, onSelect: () => setLiveLink(!liveLink) }] : []),
            { label: t('file.shortcuts'), icon: <Keyboard size={14} />, hint: shortcutHint('help.shortcuts', t), onSelect: () => setShowShortcuts(true) },
            { label: t('file.about'), icon: <Info size={14} />, onSelect: () => setShowAbout(true) },
          ]} />
      <MenuButton label={t('menu.edit')} icon={<Pencil size={16} />} build={() => editMenu(t)} />
      <MenuButton label={t('menu.view')} icon={<Eye size={16} />} build={() => viewMenu(t)} />
      {design && (
        <input
          aria-label={t('top.name')}
          className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold hover:border-line focus:border-accent focus:bg-white focus:outline-none sm:max-w-[200px]"
          value={design.name}
          onChange={(e) => update((d) => void (d.name = e.target.value), 'name')}
        />
      )}
      <IconButton label={`${t('search.open')} (${shortcutHint('search.open', t)})`} onClick={() => setSearching(true)}>
        <Search size={17} />
      </IconButton>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      <div className="flex items-center">
        <IconButton label={t('top.back')} onClick={goBack} disabled={!canBack}>
          <ArrowLeft size={17} />
        </IconButton>
        <IconButton label={t('top.forward')} onClick={goForward} disabled={!canForward}>
          <ArrowRight size={17} />
        </IconButton>
      </div>
      <div className="flex items-center">
        <IconButton label={`${t('top.undo')} (${shortcutHint('edit.undo', t)})`} onClick={undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label={`${t('top.redo')} (${shortcutHint('edit.redo', t)})`} onClick={redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </IconButton>
      </div>
      <div className="mx-auto flex items-center gap-2">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'design', label: t('mode.design'), icon: <PenTool size={14} /> },
            { value: 'print', label: t('mode.print'), icon: <Printer size={14} /> },
          ]}
        />
        <Segmented<View>
          value={view}
          onChange={setView}
          options={viewsOf(mode, screen).map((v) => ({ value: v, label: t(`view.${v}`), icon: VIEW_ICONS[v] }))}
        />
      </div>
      <div className="flex items-center">
        <IconButton label={t('top.zoomOut')} onClick={() => zoomBy(1 / ZOOM.step)}>
          <ZoomOut size={17} />
        </IconButton>
        <IconButton label={t('top.fit')} onClick={zoomFit} active={fit}>
          <Maximize size={16} />
        </IconButton>
        <IconButton label={t('top.zoomIn')} onClick={() => zoomBy(ZOOM.step)}>
          <ZoomIn size={17} />
        </IconButton>
        <IconButton label={t('top.guides')} onClick={toggleGuides} active={guides}>
          <Ruler size={16} />
        </IconButton>
        <IconButton label={t('top.snap')} onClick={toggleSnap} active={snap}>
          <Magnet size={16} />
        </IconButton>
        <IconButton label={t('top.links')} onClick={() => setShowLinks(!showLinks)} active={showLinks}>
          <Link2 size={17} />
        </IconButton>
      </div>
      <button
        type="button"
        onClick={() => {
          setPanel('print');
          setSidebarOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#435c31]"
      >
        <Printer size={15} />
        <span className="hidden sm:inline">{t('top.export')}</span>
      </button>
    </header>
  );
}
