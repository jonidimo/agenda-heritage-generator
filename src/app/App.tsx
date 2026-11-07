import { IconPickerHost } from './components/IconPicker';
import clsx from 'clsx';
import { BookMarked, CalendarDays, Image as ImageIcon, LayoutList, Palette, Printer, SlidersHorizontal, Type, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AgendaDocument } from '@core/document';
import { Canvas } from './components/canvas/Canvas';
import { ContextMenuHost } from './components/ContextMenu';
import { AboutDialog, HiddenDialog, LibraryDialog, SaveTemplateDialog, ShortcutsDialog, WelcomeDialog } from './components/Dialogs';
import { PaperDialog } from './components/PaperDialog';
import { installFullscreen } from './state/fullscreen';
import { ErrorBoundary, ViewError } from './components/ErrorBoundary';
import { installFileDrop, openAnyFile } from './state/fileActions';
import { Inspector } from './components/Inspector';
import { Navigator } from './components/Navigator';
import { AssetsPanel } from './components/panels/AssetsPanel';
import { FontsPanel } from './components/panels/FontsPanel';
import { CalendarPanel } from './components/panels/CalendarPanel';
import { MethodsPanel } from './components/panels/MethodsPanel';
import { PersonaPanel } from './components/panels/PersonaPanel';
import { PrintPanel } from './components/panels/PrintPanel';
import { SectionsPanel } from './components/panels/SectionsPanel';
import { StylePanel } from './components/panels/StylePanel';
import { Splitter } from './components/ui';
import { Topbar } from './components/Topbar';
import { isUiLang, useT, type UiKey } from './i18n/ui';
import { langOf } from '@core/i18n';
import { clearCrashed, crashedId } from './state/crash';
import { useDocument } from './state/doc';
import { collectUnusedAssets, listDesigns, loadDesign } from './state/persist';
import { resources } from './state/resources';
import { installClipboard } from './state/clipboard';
import { EmptyPages } from './components/EmptyPages';
import { isDesktopShell } from './state/desktopBridge';
import { PROVIDER_IDS } from '@core/ai/providers';
import { installAssistant } from './state/ai/assistant';
import { loadRemembered } from './state/ai/keys';
import { installShortcuts } from './state/shortcuts';
import { PANEL_LIMITS } from './state/prefs';
import { activeView, flushSave, useStore, type Panel } from './state/store';
import { DESKTOP_BREAKPOINT, useUiLayout } from './state/uiScale';
import { jumpToPage } from './state/navigation';

const TABS: Array<{ id: Panel; key: UiKey; icon: React.ReactNode }> = [
  { id: 'style', key: 'tab.style', icon: <Palette size={16} /> },
  { id: 'sections', key: 'tab.sections', icon: <LayoutList size={16} /> },
  { id: 'methods', key: 'tab.methods', icon: <BookMarked size={16} /> },
  { id: 'persona', key: 'tab.persona', icon: <UserRound size={16} /> },
  { id: 'calendar', key: 'tab.calendar', icon: <CalendarDays size={16} /> },
  { id: 'assets', key: 'tab.assets', icon: <ImageIcon size={16} /> },
  { id: 'fonts', key: 'tab.fonts', icon: <Type size={16} /> },
  { id: 'print', key: 'tab.print', icon: <Printer size={16} /> },
];

function Sidebar() {
  const t = useT();
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const mode = useStore((s) => s.mode);
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-line bg-paper">
      <nav className="scroll-thin flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-1.5 pt-1.5" role="tablist">
        {TABS.filter((tab) => tab.id !== 'print' || mode === 'print').map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            title={t(tab.key)}
            onClick={() => setPanel(tab.id)}
            className={clsx('flex shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2 py-1.5 text-[11.5px] font-semibold', panel === tab.id ? 'border-line bg-white text-ink' : 'border-transparent text-ink-soft hover:text-ink')}
          >
            {tab.icon}
            <span className={panel === tab.id ? '' : 'hidden'}>{t(tab.key)}</span>
          </button>
        ))}
      </nav>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-white/40 px-3 pb-6" data-sidebar={panel}>
        {panel === 'sections' && <SectionsPanel />}
        {panel === 'style' && <StylePanel />}
        {panel === 'methods' && <MethodsPanel />}
        {panel === 'persona' && <PersonaPanel />}
        {panel === 'calendar' && <CalendarPanel />}
        {panel === 'assets' && <AssetsPanel />}
        {panel === 'fonts' && <FontsPanel />}
        {panel === 'print' && <PrintPanel />}
      </div>
    </aside>
  );
}

/** Vista central: si una página o la hoja no se pueden dibujar, el resto del editor sigue andando. */
function CanvasArea({ doc, live }: { doc: AgendaDocument; live: AgendaDocument }) {
  const pageIndex = useStore((s) => s.pageIndex);
  const view = useStore(activeView);
  return (
    <ErrorBoundary resetKeys={[live, pageIndex, view]} fallback={(e) => <ViewError error={e} />}>
      <Canvas committed={doc} live={live} />
    </ErrorBoundary>
  );
}

function InspectorArea({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const pageIndex = useStore((s) => s.pageIndex);
  const selection = useStore((s) => s.selection);
  return (
    <ErrorBoundary resetKeys={[doc, pageIndex, selection]} fallback={(e) => <ViewError error={e} message={t('insp.error')} />}>
      <Inspector doc={doc} />
    </ErrorBoundary>
  );
}

let shownErrors = 0;

export function App() {
  const t = useT();
  const design = useStore((s) => s.design);
  const setDesign = useStore((s) => s.setDesign);
  const showWelcome = useStore((s) => s.showWelcome);
  const showLibrary = useStore((s) => s.showLibrary);
  const showSaveTemplate = useStore((s) => s.showSaveTemplate);
  const showAbout = useStore((s) => s.showAbout);
  const showShortcuts = useStore((s) => s.showShortcuts);
  const showPaper = useStore((s) => s.showPaper);
  const focusMode = useStore((s) => s.focusMode);
  const showHidden = useStore((s) => s.showHidden);
  const setShowWelcome = useStore((s) => s.setShowWelcome);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const selection = useStore((s) => s.selection);
  const notice = useStore((s) => s.notice);
  const aiNotice = useStore((s) => s.aiNotice);
  const setAiNotice = useStore((s) => s.setAiNotice);
  const revision = useStore((s) => s.revision);
  const canUndo = useStore((s) => s.past.length > 0);
  const updateReady = useStore((s) => s.updateReady);
  const setNotice = useStore((s) => s.setNotice);
  const bump = useStore((s) => s.bumpResources);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { desktop, wide: large } = useUiLayout();
  const panelSizes = useStore((s) => s.panelSizes);
  const setPanelSize = useStore((s) => s.setPanelSize);
  const commitPanelSizes = useStore((s) => s.commitPanelSizes);
  const sheetOpen = useStore((s) => s.inspectorOpen);
  const setSheetOpen = useStore((s) => s.setInspectorOpen);
  const { doc, error } = useDocument();
  /** El lienzo muestra la vista previa mientras se arrastra un control; lo demás, el diseño confirmado. */
  const live = useDocument('editing').doc ?? doc;

  /** Muestra los problemas de carga nuevos (fuentes, feriados, imágenes). */
  const reportResourceErrors = useCallback((): void => {
    if (resources.errors.length > shownErrors) {
      setNotice(resources.errors.slice(shownErrors).join(' · '));
      shownErrors = resources.errors.length;
    }
  }, [setNotice]);

  const start = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      if (!resources.manifest) {
        await collectUnusedAssets();
        await resources.init();
      }
      if (!useStore.getState().design) {
        const list = await listDesigns();
        const first = list[0];
        if (first && first.id === crashedId()) {
          // La última vez esta agenda hizo fallar el editor: abrirla sola volvería a fallar en cada recarga.
          setNotice(t('crash.skipped', { name: first.name }));
          if (!useStore.getState().design) useStore.getState().setShowLibrary(true);
        } else {
          try {
            const last = first ? await loadDesign(first.id) : null;
            // Si mientras tanto ya se abrió o importó otra agenda, no se la reemplaza.
            if (last && !useStore.getState().design) {
              setDesign(last);
              // El asistente de «Nueva agenda», si así se eligió, sobre la agenda recién abierta (se puede cerrar).
              if (useStore.getState().welcomeOnStart) setShowWelcome(true);
            } else if (!useStore.getState().design) setShowWelcome(true);
          } catch (err) {
            setNotice(`${t('notice.loadFailed')} ${(err as Error).message}`);
            if (!useStore.getState().design) setShowWelcome(true);
          }
        }
      }
      const d = useStore.getState().design;
      if (d) await resources.ensureFor(d);
      setReady(true);
    } catch (err) {
      setLoadError((err as Error).message);
    }
    reportResourceErrors();
  }, [reportResourceErrors, setDesign, setNotice, setShowWelcome, t]);

  // Arranque: recursos + última agenda abierta (o el asistente).
  useEffect(() => {
    const unsub = resources.subscribe(() => bump(resources.version));
    void start();
    if (typeof window !== 'undefined' && window.innerWidth < DESKTOP_BREAKPOINT) setSidebarOpen(false);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Copiar, cortar, pegar y duplicar elementos propios.
  useEffect(() => installClipboard(), []);
  useEffect(() => installAssistant(), []);
  // Las claves del asistente recordadas en este navegador (cifradas): en la aplicación de escritorio las guarda ella.
  useEffect(() => {
    if (!isDesktopShell()) void loadRemembered(PROVIDER_IDS);
  }, []);

  // Cada cambio de diseño asegura sus fuentes, feriados y recursos.
  useEffect(() => {
    if (!design) return;
    resources
      .ensureFor(design)
      .catch((err: unknown) => setNotice((err as Error).message))
      .finally(reportResourceErrors);
  }, [design, reportResourceErrors, setNotice]);

  // Si la agenda se muestra bien durante unos segundos, deja de estar anotada como que falló.
  const designId = design?.id;
  useEffect(() => {
    if (!designId || !doc) return;
    const timer = setTimeout(() => clearCrashed(designId), 4000);
    return () => clearTimeout(timer);
  }, [designId, doc]);

  // Mientras la persona no elija el idioma de la interfaz, la interfaz habla el idioma de la agenda.
  const designLang = design ? langOf(design.locale) : null;
  useEffect(() => {
    const st = useStore.getState();
    if (designLang && !st.uiLangChosen && isUiLang(designLang) && st.uiLang !== designLang) st.followLang(designLang);
  }, [designLang]);

  // Si la agenda pasa a tener menos páginas, la página actual se acomoda; y si se pidió ir a
  // una página que recién se creó, se va en cuanto existe.
  useEffect(() => {
    if (!doc) return;
    const st = useStore.getState();
    if (st.goToKey) {
      const i = doc.indexOfKey(st.goToKey);
      if (i >= 0) {
        // Una página recién creada: se salta a ella y «Atrás» vuelve adonde se estaba.
        jumpToPage(i);
        st.setGoToKey(null);
        return;
      }
    }
    const max = Math.max(0, doc.pageCount - 1);
    if (st.pageIndex > max) st.goToPage(max);
  }, [doc]);

  // En pantallas angostas el inspector es una hoja inferior que se abre al tocar un elemento.
  useEffect(() => {
    if (!large && selection) setSheetOpen(true);
  }, [large, selection, setSheetOpen]);

  // Sin fuentes no hay páginas: en lugar de «Cargando…» para siempre, el motivo y un botón para reintentar.
  const noFonts = ready && !doc && resources.fonts.list().length === 0 && resources.errors.length > 0;

  // Todos los atajos de teclado, en un solo oyente (ver `state/shortcuts.ts`).
  useEffect(() => installShortcuts(), []);

  // Soltar un archivo de agenda sobre la ventana lo abre.
  useEffect(() => installFileDrop(), []);
  // Salir de la pantalla completa por el sistema (Esc, F11 del navegador) devuelve los paneles.
  useEffect(() => installFullscreen(), []);

  return (
    <div className="flex h-full flex-col">
      <Topbar />
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && !focusMode && design && (
          <div className="absolute inset-y-0 left-0 z-30 w-[calc(92*var(--vw))] max-w-[360px] shadow-xl md:static md:max-w-none md:shrink-0 md:shadow-none" style={desktop ? { width: panelSizes.left } : undefined}>
            <Sidebar />
          </div>
        )}
        {sidebarOpen && !focusMode && design && desktop && (
          <Splitter
            orientation="vertical"
            label={t('panel.resize.left')}
            value={panelSizes.left}
            min={PANEL_LIMITS.left.min}
            max={PANEL_LIMITS.left.max}
            defaultValue={PANEL_LIMITS.left.default}
            onChange={(v) => setPanelSize('left', v)}
            onCommit={commitPanelSizes}
          />
        )}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {doc && doc.pageCount > 0 && !large && !sheetOpen && !focusMode && (
            <button
              type="button"
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg"
              onClick={() => setSheetOpen(true)}
            >
              <SlidersHorizontal size={15} /> {t('insp.open')}
            </button>
          )}
          {updateReady && (
            <div role="status" className="flex items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-[12px] text-ink">
              <span className="min-w-0 flex-1">{t('notice.updated')}</span>
              <button type="button" className="rounded-md bg-accent px-2 py-0.5 font-semibold text-white" onClick={() => void flushSave().then(() => location.reload())}>
                {t('notice.reload')}
              </button>
            </div>
          )}
          {aiNotice && (
            <div role="status" data-testid="ai-notice" className="flex items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-[12px] text-ink">
              <span className="min-w-0 flex-1 break-words">{aiNotice.text}</span>
              {/* «Deshacer» solo mientras lo último que cambió sea lo del modelo: si no, desharía otra cosa. */}
              {aiNotice.revision === revision && canUndo && (
                <button type="button" className="rounded-md bg-accent px-2 py-0.5 font-semibold text-white" onClick={() => useStore.getState().undo()}>
                  {t('live.undo')}
                </button>
              )}
              <button type="button" className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label={t('common.close')} onClick={() => setAiNotice(null)}>
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="flex items-start gap-2 border-b border-line bg-[#fbf3e4] px-3 py-1.5 text-[12px] text-ink">
              <span className="min-w-0 flex-1 break-words">{notice}</span>
              <button type="button" className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label={t('common.close')} onClick={() => setNotice(null)}>
                <X size={14} />
              </button>
            </div>
          )}
          {loadError || noFonts ? (
            <div className="desk flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-ink-soft">
              <p>{t('app.loadError')}</p>
              <p className="max-w-md text-[11.5px]">{loadError ?? resources.errors.join(' · ')}</p>
              <button type="button" className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink hover:bg-paper" onClick={() => void start()}>
                {t('app.retry')}
              </button>
            </div>
          ) : ready && !design ? (
            <div className="desk flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-ink-soft">
              <p>{t('app.noDesign')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="rounded-md bg-accent px-3 py-1.5 font-semibold text-white" onClick={() => setShowWelcome(true)}>
                  {t('welcome.title')}
                </button>
                <button type="button" className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink hover:bg-paper" onClick={() => useStore.getState().setShowLibrary(true)}>
                  {t('top.library')}
                </button>
                <button type="button" className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink hover:bg-paper" onClick={() => void openAnyFile()}>
                  {t('file.open')}
                </button>
              </div>
            </div>
          ) : !ready || !doc ? (
            <div className="desk flex flex-1 items-center justify-center text-[13px] text-ink-soft">{error ?? t('app.loading')}</div>
          ) : doc.pageCount === 0 ? (
            <EmptyPages doc={doc} />
          ) : (
            <>
              <CanvasArea doc={doc} live={live ?? doc} />
              {/* En pantalla completa solo queda la página: la tira de miniaturas también se va. */}
              {!focusMode && <Navigator doc={doc} />}
            </>
          )}
        </main>
        {doc && doc.pageCount > 0 && large && !focusMode && (
          <>
            <Splitter
              orientation="vertical"
              label={t('panel.resize.right')}
              value={panelSizes.right}
              min={PANEL_LIMITS.right.min}
              max={PANEL_LIMITS.right.max}
              defaultValue={PANEL_LIMITS.right.default}
              invert
              onChange={(v) => setPanelSize('right', v)}
              onCommit={commitPanelSizes}
            />
            <aside className="shrink-0 border-l border-line bg-paper" style={{ width: panelSizes.right }}>
              <InspectorArea doc={doc} />
            </aside>
          </>
        )}
        {doc && doc.pageCount > 0 && !large && sheetOpen && (
          <div className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(52*var(--vh))] flex-col rounded-t-xl border-t border-line bg-paper shadow-2xl" role="dialog" aria-label={t('insp.title')}>
            <div className="flex shrink-0 justify-end border-b border-line px-2 py-1">
              <button type="button" className="rounded p-1 hover:bg-black/5" aria-label={t('common.close')} onClick={() => setSheetOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <InspectorArea doc={doc} />
            </div>
          </div>
        )}
      </div>
      <ContextMenuHost />
      {showWelcome && <WelcomeDialog />}
      {showLibrary && <LibraryDialog />}
      {showSaveTemplate && <SaveTemplateDialog />}
      {showAbout && <AboutDialog />}
      {showShortcuts && <ShortcutsDialog />}
      {showPaper && <PaperDialog />}
      <IconPickerHost />
      {showHidden && <HiddenDialog />}
    </div>
  );
}
