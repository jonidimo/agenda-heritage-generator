/**
 * Estado de la aplicación (zustand + immer): diseño con historial para
 * deshacer/rehacer, vista, selección y preferencias de la interfaz. El diseño
 * se guarda solo en IndexedDB (con demora) en cada cambio.
 */
import { parseDesign, type Design } from '@core/design/schema';
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { saveDesign } from './persist';
import type { UiLang } from '../i18n/ui';

export type View = 'page' | 'spread' | 'sheet' | 'book';
export type Panel = 'sections' | 'style' | 'methods' | 'persona' | 'calendar' | 'assets' | 'print';

export interface Selection {
  pageKey: string;
  pageType: string;
  blockId: string;
  role: string;
}

interface StoreState {
  design: Design | null;
  past: Design[];
  future: Design[];
  coalesce: { key: string; at: number } | null;
  view: View;
  panel: Panel;
  pageIndex: number;
  sheetSide: 'front' | 'back';
  zoom: number;
  fit: boolean;
  selection: Selection | null;
  /** Bloques seleccionados en la página de `selection` (incluye el principal, que es el último elegido). */
  selectedIds: string[];
  /** En pantallas angostas: hoja inferior del panel del elemento abierta. */
  inspectorOpen: boolean;
  setInspectorOpen(b: boolean): void;
  /** Selección múltiple (Ctrl/Mayús, recuadro, «seleccionar similares»). */
  setSelection(s: Selection | null, ids?: string[]): void;
  scope: 'type' | 'page';
  uiLang: UiLang;
  /** La persona eligió el idioma de la interfaz (si no, sigue al idioma de la agenda abierta). */
  uiLangChosen: boolean;
  /** Idioma de la interfaz sin marcarlo como elegido (sigue a la agenda). */
  followLang(l: UiLang): void;
  /** La interfaz pasa a este idioma y vuelve a seguir al de la agenda (se elige el idioma al crear una agenda). */
  followAgendaLang(l: UiLang): void;
  resVersion: number;
  showWelcome: boolean;
  showLibrary: boolean;
  /** Diálogo «Guardar como plantilla». */
  showSaveTemplate: boolean;
  setShowSaveTemplate(b: boolean): void;
  sidebarOpen: boolean;
  guides: boolean;
  snap: boolean;
  /** Muestra en la página las zonas tocables del PDF (y un clic las sigue). */
  showLinks: boolean;
  /** Aviso para el usuario (errores de carga, archivos inválidos…). */
  notice: string | null;
  /** Página a la que ir en cuanto exista (p. ej. una página propia recién creada). */
  goToKey: string | null;
  /** Se instaló una versión nueva de la aplicación (hay que recargar para usarla). */
  updateReady: boolean;
  setUpdateReady(b: boolean): void;
  setGoToKey(key: string | null): void;
  setDesign(d: Design, opts?: { keepHistory?: boolean }): void;
  /** Cierra la agenda abierta (p. ej. al borrarla) sin volver a guardarla. */
  closeDesign(): void;
  setNotice(msg: string | null): void;
  update(recipe: (d: Draft<Design>) => void, coalesceKey?: string): void;
  undo(): void;
  redo(): void;
  setView(v: View): void;
  setPanel(p: Panel): void;
  goToPage(i: number): void;
  setSheetSide(s: 'front' | 'back'): void;
  setZoom(z: number, fit?: boolean): void;
  select(s: Selection | null): void;
  setScope(s: 'type' | 'page'): void;
  setUiLang(l: UiLang): void;
  bumpResources(v: number): void;
  setShowWelcome(b: boolean): void;
  setShowLibrary(b: boolean): void;
  setSidebarOpen(b: boolean): void;
  toggleGuides(): void;
  toggleSnap(): void;
  setShowLinks(b: boolean): void;
}

const HISTORY_LIMIT = 150;
const COALESCE_MS = 700;

function langChosen(): boolean {
  try {
    return localStorage.getItem('agenda-studio.uiLang') !== null;
  } catch {
    return false;
  }
}

function initialLang(): UiLang {
  try {
    const saved = localStorage.getItem('agenda-studio.uiLang');
    if (saved === 'es' || saved === 'en' || saved === 'pt' || saved === 'it') return saved;
  } catch {
    /* sin almacenamiento */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es').slice(0, 2);
  return nav === 'en' || nav === 'pt' || nav === 'it' ? nav : 'es';
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Design | null = null;

function scheduleSave(d: Design): void {
  // Otra agenda con cambios sin guardar: se guarda ya, no se pisa.
  if (pendingSave && pendingSave.id !== d.id) void flushSave();
  pendingSave = d;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 500);
}

/** Guarda ya lo pendiente (antes de cambiar de agenda, al ocultar la página o al cerrarla). */
export async function flushSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const d = pendingSave;
  pendingSave = null;
  if (d) await saveDesign(d);
}

/** Descarta lo pendiente de una agenda (al borrarla, para que no reaparezca). */
export function cancelSave(id: string): void {
  if (pendingSave?.id !== id) return;
  pendingSave = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
}

export const useStore = create<StoreState>((set, get) => ({
  design: null,
  past: [],
  future: [],
  coalesce: null,
  view: 'spread',
  panel: 'sections',
  pageIndex: 0,
  sheetSide: 'front',
  zoom: 1,
  fit: true,
  selection: null,
  selectedIds: [],
  inspectorOpen: false,
  scope: 'type',
  uiLang: initialLang(),
  uiLangChosen: langChosen(),
  resVersion: 0,
  showWelcome: false,
  showLibrary: false,
  showSaveTemplate: false,
  sidebarOpen: true,
  guides: false,
  snap: true,
  showLinks: false,
  notice: null,
  goToKey: null,
  updateReady: false,

  setDesign(input, opts) {
    // Toda agenda que entra al editor pasa por el esquema: completa los campos que agregan las
    // versiones nuevas y acomoda valores viejos (así ninguna página falla por un dato faltante).
    const d = parseDesign(input);
    set((s) => ({
      design: d,
      past: opts?.keepHistory ? s.past : [],
      future: opts?.keepHistory ? s.future : [],
      coalesce: null,
      selection: null,
      selectedIds: [],
      pageIndex: opts?.keepHistory ? s.pageIndex : 0,
    }));
    scheduleSave(d);
  },

  closeDesign() {
    const d = get().design;
    if (d) cancelSave(d.id);
    set({ design: null, past: [], future: [], coalesce: null, selection: null, selectedIds: [], pageIndex: 0 });
  },

  setNotice: (notice) => set({ notice }),
  setGoToKey: (goToKey) => set({ goToKey }),
  setUpdateReady: (updateReady) => set({ updateReady }),

  update(recipe, coalesceKey) {
    const { design, past, coalesce } = get();
    if (!design) return;
    const next = produce(design, (draft) => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });
    if (next === design) return;
    const now = Date.now();
    const merge = coalesceKey !== undefined && coalesce?.key === coalesceKey && now - coalesce.at < COALESCE_MS;
    set({
      design: next,
      past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), design],
      future: [],
      coalesce: coalesceKey !== undefined ? { key: coalesceKey, at: now } : null,
    });
    scheduleSave(next);
  },

  undo() {
    const { design, past, future } = get();
    const prev = past[past.length - 1];
    if (!design || !prev) return;
    set({ design: prev, past: past.slice(0, -1), future: [design, ...future], coalesce: null });
    scheduleSave(prev);
  },

  redo() {
    const { design, past, future } = get();
    const next = future[0];
    if (!design || !next) return;
    set({ design: next, past: [...past, design], future: future.slice(1), coalesce: null });
    scheduleSave(next);
  },

  setView: (view) => set({ view, selection: null, selectedIds: [] }),
  setPanel: (panel) => set({ panel }),
  goToPage: (i) => set({ pageIndex: Math.max(0, i), selection: null, selectedIds: [] }),
  setSheetSide: (sheetSide) => set({ sheetSide }),
  setZoom: (zoom, fit = false) => set({ zoom: Math.min(6, Math.max(0.2, zoom)), fit }),
  select: (selection) => set({ selection, selectedIds: selection ? [selection.blockId] : [] }),
  setSelection: (selection, ids) => set({ selection, selectedIds: selection ? [...new Set([...(ids ?? []), selection.blockId])] : [] }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setScope: (scope) => set({ scope }),
  setUiLang(uiLang) {
    try {
      localStorage.setItem('agenda-studio.uiLang', uiLang);
    } catch {
      /* sin almacenamiento */
    }
    set({ uiLang, uiLangChosen: true });
  },
  followLang: (uiLang) => set({ uiLang }),
  followAgendaLang(uiLang) {
    try {
      localStorage.removeItem('agenda-studio.uiLang');
    } catch {
      /* sin almacenamiento */
    }
    set({ uiLang, uiLangChosen: false });
  },
  bumpResources: (resVersion) => set({ resVersion }),
  setShowWelcome: (showWelcome) => set({ showWelcome }),
  setShowLibrary: (showLibrary) => set({ showLibrary }),
  setShowSaveTemplate: (showSaveTemplate) => set({ showSaveTemplate }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleGuides: () => set((s) => ({ guides: !s.guides })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  setShowLinks: (showLinks) => set({ showLinks }),
}));
