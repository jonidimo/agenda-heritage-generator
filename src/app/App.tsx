import clsx from 'clsx';
import { BookMarked, CalendarDays, Image as ImageIcon, LayoutList, Palette, Printer, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AgendaDocument } from '@core/document';
import { Canvas } from './components/canvas/Canvas';
import { ContextMenuHost } from './components/ContextMenu';
import { LibraryDialog, SaveTemplateDialog, WelcomeDialog } from './components/Dialogs';
import { ErrorBoundary, ViewError } from './components/ErrorBoundary';
import { openAnyFile, saveCurrent } from './state/fileActions';
import { Inspector } from './components/Inspector';
import { Navigator } from './components/Navigator';
import { AssetsPanel } from './components/panels/AssetsPanel';
import { CalendarPanel } from './components/panels/CalendarPanel';
import { MethodsPanel } from './components/panels/MethodsPanel';
import { PersonaPanel } from './components/panels/PersonaPanel';
import { PrintPanel } from './components/panels/PrintPanel';
import { SectionsPanel } from './components/panels/SectionsPanel';
import { StylePanel } from './components/panels/StylePanel';
import { Topbar } from './components/Topbar';
import { isUiLang, useT, type UiKey } from './i18n/ui';
import { langOf } from '@core/i18n';
import { clearCrashed, crashedId } from './state/crash';
import { useDocument } from './state/doc';
import { collectUnusedAssets, listDesigns, loadDesign } from './state/persist';
import { resources } from './state/resources';
import { flushSave, useStore, type Panel } from './state/store';
import { jumpToPage } from './state/navigation';

const TABS: Array<{ id: Panel; key: UiKey; icon: React.ReactNode }> = [
  { id: 'sections', key: 'tab.sections', icon: <LayoutList size={16} /> },
  { id: 'style', key: 'tab.style', icon: <Palette size={16} /> },
  { id: 'methods', key: 'tab.methods', icon: <BookMarked size={16} /> },
  { id: 'persona', key: 'tab.persona', icon: <UserRound size={16} /> },
  { id: 'calendar', key: 'tab.calendar', icon: <CalendarDays size={16} /> },
  { id: 'assets', key: 'tab.assets', icon: <ImageIcon size={16} /> },
  { id: 'print', key: 'tab.print', icon: <Printer size={16} /> },
];

function Sidebar() {
  const t = useT();
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-line bg-paper md:w-[330px]">
      <nav className="scroll-thin flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-1.5 pt-1.5" role="tablist">
        {TABS.map((tab) => (
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
        {panel === 'print' && <PrintPanel />}
      </div>
    </aside>
  );
}

/** Coincidencia de una media query (se actualiza al girar el teléfono o cambiar el tamaño). */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (): void => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Vista central: si una página o la hoja no se pueden dibujar, el resto del editor sigue andando. */
function CanvasArea({ doc }: { doc: AgendaDocument }) {
  const pageIndex = useStore((s) => s.pageIndex);
  const view = useStore((s) => s.view);
  return (
    <ErrorBoundary resetKeys={[doc, pageIndex, view]} fallback={(e) => <ViewError error={e} />}>
      <Canvas doc={doc} />
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
  const setShowWelcome = useStore((s) => s.setShowWelcome);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const selection = useStore((s) => s.selection);
  const notice = useStore((s) => s.notice);
  const updateReady = useStore((s) => s.updateReady);
  const setNotice = useStore((s) => s.setNotice);
  const bump = useStore((s) => s.bumpResources);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const large = useMediaQuery('(min-width: 1024px)');
  const sheetOpen = useStore((s) => s.inspectorOpen);
  const setSheetOpen = useStore((s) => s.setInspectorOpen);
  const { doc, error } = useDocument();

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
            if (last && !useStore.getState().design) setDesign(last);
            else if (!useStore.getState().design) setShowWelcome(true);
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
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Atajos globales: deshacer / rehacer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'y') {
        useStore.getState().redo();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 's') {
        // Ctrl+S guarda en el archivo elegido (Ctrl+Mayús+S: «Guardar como»).
        void saveCurrent(e.shiftKey);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'o') {
        void openAnyFile();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Topbar />
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && design && (
          <div className="absolute inset-y-0 left-0 z-30 w-[92vw] max-w-[360px] shadow-xl md:static md:w-auto md:max-w-none md:shadow-none">
            <Sidebar />
          </div>
        )}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {doc && !large && !sheetOpen && (
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
          ) : (
            <>
              <CanvasArea doc={doc} />
              <Navigator doc={doc} />
            </>
          )}
        </main>
        {doc && large && (
          <aside className="w-[280px] shrink-0 border-l border-line bg-paper">
            <InspectorArea doc={doc} />
          </aside>
        )}
        {doc && !large && sheetOpen && (
          <div className="fixed inset-x-0 bottom-0 z-40 flex h-[52vh] flex-col rounded-t-xl border-t border-line bg-paper shadow-2xl" role="dialog" aria-label={t('insp.title')}>
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
    </div>
  );
}
