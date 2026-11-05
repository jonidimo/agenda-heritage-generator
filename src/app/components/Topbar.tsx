import { Archive, ArrowLeft, ArrowRight, BookOpen, Search, Columns2, File, FileDown, FolderOpen, Grid3x3, Info, LayoutTemplate, Link2, Magnet, Maximize, PanelLeft, Printer, Redo2, Ruler, Save, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backupAll, openAnyFile, saveCurrent } from '../state/fileActions';
import { openMenuAt } from './ContextMenu';
import { UI_LANG_NAMES, UI_LANGS, useT } from '../i18n/ui';
import { UI_SCALE } from '../state/prefs';
import { useStore, ZOOM, type View } from '../state/store';
import { supportsUiScale } from '../state/uiScale';
import { IconButton, Segmented } from './ui';
import { goBack, goForward } from '../state/navigation';
import { SearchPalette } from './SearchPalette';

export function Topbar() {
  const t = useT();
  const design = useStore((s) => s.design);
  const update = useStore((s) => s.update);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const fit = useStore((s) => s.fit);
  const zoomBy = useStore((s) => s.zoomBy);
  const zoomFit = useStore((s) => s.zoomFit);
  const lang = useStore((s) => s.uiLang);
  const setLang = useStore((s) => s.setUiLang);
  const uiScale = useStore((s) => s.uiScale);
  const setUiScale = useStore((s) => s.setUiScale);
  const autoReveal = useStore((s) => s.autoReveal);
  const setAutoReveal = useStore((s) => s.setAutoReveal);
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
  const [searching, setSearching] = useState(false);
  // Buscador: Ctrl+K (o ⌘K), o «/» si no se está escribiendo en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        setSearching(true);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const canBack = useStore((s) => s.navBack.length > 0);
  const canForward = useStore((s) => s.navForward.length > 0);
  // Alt+← / Alt+→ y los botones laterales del mouse, como en un navegador.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'ArrowRight') goForward();
      else return;
      e.preventDefault();
    };
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) goBack();
      else if (e.button === 4) goForward();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
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
      <button
        type="button"
        aria-haspopup="menu"
        title={t('file.menu')}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold hover:bg-black/5"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openMenuAt({ clientX: r.left, clientY: r.bottom + 4, preventDefault: () => undefined }, [
            { label: t('file.save'), icon: <Save size={14} />, disabled: !design, onSelect: () => void saveCurrent(false) },
            { label: t('file.saveAs'), icon: <FileDown size={14} />, disabled: !design, onSelect: () => void saveCurrent(true) },
            { label: t('file.open'), icon: <Upload size={14} />, onSelect: () => void openAnyFile() },
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
            { separator: true },
            { label: t('file.autoReveal'), checked: autoReveal, onSelect: () => setAutoReveal(!autoReveal) },
            { label: t('file.about'), icon: <Info size={14} />, onSelect: () => setShowAbout(true) },
          ]);
        }}
      >
        <Save size={16} />
        <span className="hidden xl:inline">{t('file.menu')}</span>
      </button>
      {design && (
        <input
          aria-label={t('top.name')}
          className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold hover:border-line focus:border-accent focus:bg-white focus:outline-none sm:max-w-[200px]"
          value={design.name}
          onChange={(e) => update((d) => void (d.name = e.target.value), 'name')}
        />
      )}
      <IconButton label={t('search.open')} onClick={() => setSearching(true)}>
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
        <IconButton label={t('top.undo')} onClick={undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label={t('top.redo')} onClick={redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </IconButton>
      </div>
      <div className="mx-auto">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'page', label: t('view.page'), icon: <File size={14} /> },
            { value: 'spread', label: t('view.spread'), icon: <BookOpen size={14} /> },
            { value: 'sheet', label: t('view.sheet'), icon: <Columns2 size={14} /> },
            { value: 'book', label: t('view.book'), icon: <Grid3x3 size={14} /> },
          ]}
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
