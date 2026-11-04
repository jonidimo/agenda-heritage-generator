import clsx from 'clsx';
import { BookMarked, CalendarDays, Image as ImageIcon, LayoutList, Palette, Printer, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Canvas } from './components/canvas/Canvas';
import { LibraryDialog, WelcomeDialog } from './components/Dialogs';
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
import { useT, type UiKey } from './i18n/ui';
import { useDocument } from './state/doc';
import { listDesigns, loadDesign } from './state/persist';
import { resources } from './state/resources';
import { useStore, type Panel } from './state/store';

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
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-white/40 px-3 pb-6">
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

export function App() {
  const t = useT();
  const design = useStore((s) => s.design);
  const setDesign = useStore((s) => s.setDesign);
  const showWelcome = useStore((s) => s.showWelcome);
  const showLibrary = useStore((s) => s.showLibrary);
  const setShowWelcome = useStore((s) => s.setShowWelcome);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const bump = useStore((s) => s.bumpResources);
  const [ready, setReady] = useState(false);
  const { doc, error } = useDocument();

  // Arranque: recursos + última agenda abierta (o el asistente).
  useEffect(() => {
    const unsub = resources.subscribe(() => bump(resources.version));
    void (async () => {
      await resources.init();
      const list = await listDesigns();
      const last = list[0] ? await loadDesign(list[0].id) : null;
      if (last) setDesign(last);
      else setShowWelcome(true);
      setReady(true);
    })();
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada cambio de diseño asegura sus fuentes, feriados y recursos.
  useEffect(() => {
    if (design) void resources.ensureFor(design);
  }, [design]);

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
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!ready || !doc ? (
            <div className="desk flex flex-1 items-center justify-center text-[13px] text-ink-soft">{error ?? t('app.loading')}</div>
          ) : (
            <>
              <Canvas doc={doc} />
              <Navigator doc={doc} />
            </>
          )}
        </main>
        {doc && (
          <aside className="hidden w-[280px] shrink-0 border-l border-line bg-paper lg:block">
            <Inspector doc={doc} />
          </aside>
        )}
      </div>
      {showWelcome && <WelcomeDialog />}
      {showLibrary && <LibraryDialog />}
    </div>
  );
}
