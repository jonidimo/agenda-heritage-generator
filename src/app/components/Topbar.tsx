import { Archive, ArrowLeft, Eye, Keyboard, Pencil, PenTool, ArrowRight, BookOpen, Search, Columns2, File, FileDown, FolderOpen, Grid3x3, Info, LayoutTemplate, Link2, Magnet, Maximize, MoreHorizontal, PanelLeft, Printer, Redo2, Ruler, Save, Sparkles, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
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
import { SearchField } from './SearchField';
import { overflowGroups, useTopbarLevel } from '../state/topbarLayout';

/** Un botón de la barra que abre un menú justo debajo; el menú se arma al abrirlo, con lo que haya en ese momento. */
function MenuButton({ label, icon, build, showLabel = true }: { label: string; icon: React.ReactNode; build: () => MenuItem[]; showLabel?: boolean }) {
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
      {showLabel && <span>{label}</span>}
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

  const header = useRef<HTMLElement | null>(null);
  const level = useTopbarLevel(header);
  /** Los menús con su nombre (nivel 3); modo y vistas con su nombre (nivel 2 o más). */
  const labels = level >= 3;
  const viewLabels = level >= 2;
  const overflow = overflowGroups(level);
  const narrow = level === 0;

  const history = (
    <div className="flex items-center" role="group" aria-label={t('top.history')}>
      <IconButton label={t('top.back')} onClick={goBack} disabled={!canBack}>
        <ArrowLeft size={17} />
      </IconButton>
      <IconButton label={t('top.forward')} onClick={goForward} disabled={!canForward}>
        <ArrowRight size={17} />
      </IconButton>
    </div>
  );
  const zoom = (
    <div className="flex items-center" role="group" aria-label={t('top.zoomGroup')}>
      <IconButton label={t('top.zoomOut')} onClick={() => zoomBy(1 / ZOOM.step)}>
        <ZoomOut size={17} />
      </IconButton>
      <IconButton label={t('top.fit')} onClick={zoomFit} active={fit}>
        <Maximize size={16} />
      </IconButton>
      <IconButton label={t('top.zoomIn')} onClick={() => zoomBy(ZOOM.step)}>
        <ZoomIn size={17} />
      </IconButton>
    </div>
  );
  const toggles = (
    <div className="flex items-center" role="group" aria-label={t('top.helpers')}>
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
  );
  /** Lo que no entra en una barra angosta: el historial, el zoom y las ayudas de vista, en un menú. */
  const moreMenu = (): MenuItem[] => [
    ...(overflow.includes('history')
      ? [
          { label: t('top.back'), icon: <ArrowLeft size={14} />, disabled: !canBack, onSelect: goBack },
          { label: t('top.forward'), icon: <ArrowRight size={14} />, disabled: !canForward, onSelect: goForward },
          { separator: true as const },
        ]
      : []),
    ...(overflow.includes('zoom')
      ? [
          { label: t('top.zoomIn'), icon: <ZoomIn size={14} />, hint: shortcutHint('view.zoomIn', t), onSelect: () => zoomBy(ZOOM.step) },
          { label: t('top.zoomOut'), icon: <ZoomOut size={14} />, hint: shortcutHint('view.zoomOut', t), onSelect: () => zoomBy(1 / ZOOM.step) },
          { label: t('top.fit'), icon: <Maximize size={14} />, checked: fit, hint: shortcutHint('view.zoomFit', t), onSelect: zoomFit },
          { separator: true as const },
        ]
      : []),
    ...(overflow.includes('toggles')
      ? [
          { label: t('top.guides'), icon: <Ruler size={14} />, checked: guides, onSelect: toggleGuides },
          { label: t('top.snap'), icon: <Magnet size={14} />, checked: snap, onSelect: toggleSnap },
          { label: t('top.links'), icon: <Link2 size={14} />, checked: showLinks, onSelect: () => setShowLinks(!showLinks) },
        ]
      : []),
  ];
  const sep = <span role="separator" aria-orientation="vertical" className="mx-1 h-5 w-px shrink-0 bg-line" />;

  const left = (
    <div data-zone="left" className="flex w-max shrink-0 items-center gap-1">
      <IconButton label={t('top.menu')} onClick={() => setSidebarOpen(!sidebarOpen)} active={sidebarOpen}>
        <PanelLeft size={18} />
      </IconButton>
      <button type="button" onClick={() => setShowLibrary(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold hover:bg-black/5" title={t('top.library')} aria-label={t('top.library')}>
        <FolderOpen size={16} />
        {labels && <span>{t('top.library')}</span>}
      </button>
      <MenuButton showLabel={labels} label={t('file.menu')} icon={<Save size={16} />} build={() => [
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
      <MenuButton showLabel={labels} label={t('menu.edit')} icon={<Pencil size={16} />} build={() => editMenu(t)} />
      <MenuButton showLabel={labels} label={t('menu.view')} icon={<Eye size={16} />} build={() => viewMenu(t)} />
      {design && (
        <input
          aria-label={t('top.name')}
          className="max-w-[220px] min-w-[80px] truncate rounded-md [field-sizing:content] border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold hover:border-line focus:border-accent focus:bg-white focus:outline-none"
          value={design.name}
          onChange={(e) => update((d) => void (d.name = e.target.value), 'name')}
        />
      )}
      {sep}
      <div className="flex shrink-0 items-center" role="group" aria-label={t('top.undoGroup')}>
        <IconButton label={`${t('top.undo')} (${shortcutHint('edit.undo', t)})`} onClick={undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label={`${t('top.redo')} (${shortcutHint('edit.redo', t)})`} onClick={redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </IconButton>
      </div>
      {!overflow.includes('history') && history}
    </div>
  );

  const center = (
    <div data-zone="center" className="flex w-max shrink-0 items-center gap-2" role="group" aria-label={t('top.viewGroup')}>
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        compact={!viewLabels}
        options={[
          { value: 'design', label: t('mode.design'), icon: <PenTool size={14} /> },
          { value: 'print', label: t('mode.print'), icon: <Printer size={14} /> },
        ]}
      />
      <Segmented<View> value={view} onChange={setView} compact={!viewLabels} options={viewsOf(mode, screen).map((v) => ({ value: v, label: t(`view.${v}`), icon: VIEW_ICONS[v] }))} />
    </div>
  );

  const right = (
    <div data-zone="right" className="flex w-max shrink-0 items-center justify-end gap-1">
      {narrow ? (
        <IconButton label={t('search.open')} onClick={() => setSearching(true)}>
          <Search size={17} />
        </IconButton>
      ) : (
        <SearchField wide={labels} label={t('search.open')} placeholder={t('search.short')} hint={shortcutHint('search.open', t) ?? ''} onOpen={() => setSearching(true)} />
      )}
      {sep}
      {!overflow.includes('zoom') && zoom}
      {!overflow.includes('toggles') && toggles}
      {overflow.length > 0 && <MenuButton showLabel={false} label={t('top.more')} icon={<MoreHorizontal size={17} />} build={moreMenu} />}
      <button
        type="button"
        onClick={() => {
          setPanel('print');
          setSidebarOpen(true);
        }}
        title={t('top.export')}
        aria-label={t('top.export')}
        className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#435c31]"
      >
        <Printer size={15} />
        {!narrow && <span>{t('top.export')}</span>}
      </button>
    </div>
  );

  return (
    // `overflow-hidden`: mientras la barra se mide, lo que no entra no agranda la página (en un teléfono, el
    // navegador agrandaría la ventana de maquetación y la aplicación se creería en una pantalla grande).
    <header
      ref={header}
      data-level={level}
      className={
        narrow
          ? 'flex flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden border-b border-line bg-paper px-2 py-1.5'
          : // Tres zonas: archivo y edición a la izquierda, modo y vista al centro del espacio libre, buscar, zoom y exportar a la derecha.
            'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden border-b border-line bg-paper px-2 py-1.5'
      }
    >
      {left}
      <div className="flex min-w-0 justify-center">{center}</div>
      {right}
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
    </header>
  );
}
