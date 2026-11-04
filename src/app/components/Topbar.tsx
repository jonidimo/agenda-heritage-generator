import { Archive, ArrowLeft, ArrowRight, BookOpen, Columns2, File, FileDown, FolderOpen, Grid3x3, LayoutTemplate, Link2, Magnet, Maximize, PanelLeft, Printer, Redo2, Ruler, Save, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect } from 'react';
import { backupAll, openAnyFile, saveCurrent } from '../state/fileActions';
import { openMenuAt } from './ContextMenu';
import { useT, type UiLang } from '../i18n/ui';
import { useStore, type View } from '../state/store';
import { IconButton, Segmented } from './ui';
import { goBack, goForward } from '../state/navigation';

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
  const zoom = useStore((s) => s.zoom);
  const fit = useStore((s) => s.fit);
  const setZoom = useStore((s) => s.setZoom);
  const lang = useStore((s) => s.uiLang);
  const setLang = useStore((s) => s.setUiLang);
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
      <div className="flex items-baseline gap-2 pr-2">
        <span className="font-display text-[19px] leading-none italic">Heritage</span>
        <span className="hidden text-[10.5px] font-extrabold tracking-[0.16em] text-ink-soft uppercase md:inline">Studio</span>
      </div>
      <button type="button" onClick={() => setShowLibrary(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold hover:bg-black/5" title={t('top.library')}>
        <FolderOpen size={16} />
        <span className="hidden sm:inline">{t('top.library')}</span>
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
          ]);
        }}
      >
        <Save size={16} />
        <span className="hidden sm:inline">{t('file.menu')}</span>
      </button>
      {design && (
        <input
          aria-label={t('top.name')}
          className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold hover:border-line focus:border-accent focus:bg-white focus:outline-none sm:max-w-[260px]"
          value={design.name}
          onChange={(e) => update((d) => void (d.name = e.target.value), 'name')}
        />
      )}
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
        <IconButton label={t('top.zoomOut')} onClick={() => setZoom((fit ? 1 : zoom) / 1.2)}>
          <ZoomOut size={17} />
        </IconButton>
        <IconButton label={t('top.fit')} onClick={() => setZoom(1, true)} active={fit}>
          <Maximize size={16} />
        </IconButton>
        <IconButton label={t('top.zoomIn')} onClick={() => setZoom((fit ? 1 : zoom) * 1.2)}>
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
      <select aria-label={t('top.lang')} className="rounded-md border border-line bg-white px-1.5 py-1 text-[12px]" value={lang} onChange={(e) => setLang(e.target.value as UiLang)}>
        <option value="es">ES</option>
        <option value="en">EN</option>
        <option value="pt">PT</option>
        <option value="it">IT</option>
      </select>
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
