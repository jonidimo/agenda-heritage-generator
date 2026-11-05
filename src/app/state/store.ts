/**
 * Estado de la aplicación (zustand + immer): diseño con historial para
 * deshacer/rehacer, vista, selección y preferencias de la interfaz. El diseño
 * se guarda solo en IndexedDB (con demora) en cada cambio.
 */
import { parseDesign, type Design } from '@core/design/schema';
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { saveDesign } from './persist';
import { PANEL_LIMITS, prefs, UI_SCALE, type PanelId } from './prefs';
import type { UiLang } from '../i18n/ui';

export type View = 'page' | 'spread' | 'sheet' | 'book';
/** Diseñar la agenda o prepararla para imprimir: cada modo muestra solo lo que le sirve. */
export type Mode = 'design' | 'print';

/** Las vistas de cada modo, en el orden en que se ofrecen: el libro es para diseñar; la hoja impresa, para imprimir. */
export const MODE_VIEWS: Readonly<Record<Mode, readonly View[]>> = {
  design: ['page', 'spread', 'book'],
  print: ['page', 'spread', 'sheet'],
};

/**
 * La vista que corresponde mostrar: la elegida si el modo la ofrece y, de no ser así (o si la agenda
 * es para leer en pantalla y no tiene hojas impresas), la página doble.
 */
export function viewFor(mode: Mode, view: View, screen: boolean): View {
  const ok = MODE_VIEWS[mode].includes(view) && !(view === 'sheet' && screen);
  return ok ? view : 'spread';
}

/** La vista que se está mostrando ahora (la elegida, acomodada al modo y al destino de la agenda). */
export function activeView(s: { mode: Mode; view: View; design: { binding: { target: string } } | null }): View {
  return viewFor(s.mode, s.view, s.design?.binding.target === 'screen');
}

/** Las vistas que se ofrecen en un modo (sin la hoja impresa si la agenda es para pantalla). */
export function viewsOf(mode: Mode, screen: boolean): readonly View[] {
  return MODE_VIEWS[mode].filter((v) => !(v === 'sheet' && screen));
}
export type Panel = 'sections' | 'style' | 'methods' | 'persona' | 'calendar' | 'assets' | 'print';

/** Las pestañas del panel lateral, en el orden en que se muestran (y en el que las eligen Ctrl+1, Ctrl+2…). */
export const PANEL_ORDER: readonly Panel[] = ['style', 'sections', 'methods', 'persona', 'calendar', 'assets', 'print'];

/** Límites y paso del zoom del lienzo (el de la página, no el de la interfaz). */
export const ZOOM = { min: 0.2, max: 6, step: 1.2 } as const;

/** Anchos de los paneles (px): ver `PANEL_LIMITS`. */
export type PanelSizes = Record<PanelId, number>;

export interface Selection {
  pageKey: string;
  pageType: string;
  blockId: string;
  role: string;
}

/** Receta de immer que cambia un diseño (la usan `update`, `preview` y `commit`). */
export type Recipe = (draft: Draft<Design>) => void;

interface StoreState {
  design: Design | null;
  /**
   * Diseño transitorio mientras se arrastra un control (color, deslizador): lo ve el lienzo y nada
   * más. No entra al historial ni se guarda; se confirma una vez al soltar (`commit`).
   */
  previewDesign: Design | null;
  /** El diseño confirmado sobre el que se armó la vista previa, y el control que la pidió. */
  previewBase: Design | null;
  previewKey: string | null;
  /** Cambios confirmados desde que se abrió el programa: sube con cada `update`, `commit`, `setDesign`, deshacer y rehacer. */
  revision: number;
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
  /** Zona de enlace elegida dentro del elemento seleccionado (clave de zona, ver `areaKey`); vacía si es el elemento entero. */
  linkArea: string;
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
  /** Diálogo «Acerca de Heritage Studio». */
  showAbout: boolean;
  setShowAbout(b: boolean): void;
  /** Buscador (Ctrl+F / Ctrl+K) y diálogo de atajos de teclado (F1). */
  searchOpen: boolean;
  setSearchOpen(b: boolean): void;
  showShortcuts: boolean;
  setShowShortcuts(b: boolean): void;
  /** Diálogo con los elementos ocultos de la página actual. */
  showHidden: boolean;
  setShowHidden(b: boolean): void;
  /** Cada pedido nuevo (número creciente) hace correr la verificación previa del panel del elemento. */
  preflightRequest: number;
  requestPreflight(): void;
  /** Pedido de editar el texto de un elemento en su lugar (F2): la página que lo tiene lo atiende y lo limpia. */
  /** Lo último que se guardó como PDF en esta computadora (solo la aplicación de escritorio sabe la ruta). */
  lastExport: { name: string; path: string } | null;
  setLastExport(e: { name: string; path: string } | null): void;
  textEditRequest: { pageKey: string; blockId: string } | null;
  requestTextEdit(r: { pageKey: string; blockId: string } | null): void;
  sidebarOpen: boolean;
  guides: boolean;
  snap: boolean;
  /** Muestra en la página las zonas tocables del PDF (y un clic las sigue). */
  showLinks: boolean;
  /** Historial de saltos (claves de página): ver `state/navigation`. */
  navBack: string[];
  navForward: string[];
  setNav(back: string[], forward: string[]): void;
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
  update(recipe: Recipe, coalesceKey?: string): void;
  /** Muestra `recipe` sin confirmarlo (como mucho una vez por cuadro lo llama quien arrastra). */
  preview(recipe: Recipe, key: string): void;
  /** Descarta la vista previa (se cancela el arrastre). */
  clearPreview(): void;
  /**
   * Confirma lo que se estaba arrastrando como UN paso de historial. Si la vista previa es de este
   * mismo control y partió del diseño actual, se adopta tal cual (el documento ya está armado);
   * si no, se aplica `recipe` como un `update`.
   */
  commit(recipe: Recipe, key: string): void;
  undo(): void;
  redo(): void;
  setView(v: View): void;
  mode: Mode;
  /** Cambia de modo: la vista y la pestaña se acomodan a lo que ofrece (al imprimir se abre «Impresión»). */
  setMode(mode: Mode): void;
  setPanel(p: Panel): void;
  goToPage(i: number): void;
  setSheetSide(s: 'front' | 'back'): void;
  setZoom(z: number, fit?: boolean): void;
  /** Acerca o aleja el lienzo multiplicando el zoom actual (con el ajuste a la ventana, parte de 1). */
  zoomBy(factor: number): void;
  /** Ajusta la página al área de trabajo. */
  zoomFit(): void;
  /** Tamaño de la interfaz (1 = 100 %), independiente del zoom del lienzo. */
  uiScale: number;
  setUiScale(scale: number): void;
  /** Mostrar el asistente de «Nueva agenda» al abrir el programa. */
  welcomeOnStart: boolean;
  setWelcomeOnStart(show: boolean): void;
  /** Al elegir un elemento que solo tiene filetes, el panel de Estilo muestra el estilo de esa línea. */
  autoReveal: boolean;
  setAutoReveal(on: boolean): void;
  /** Tamaños de los paneles: se ven al instante y se guardan al soltar el divisor. */
  panelSizes: PanelSizes;
  setPanelSize(panel: PanelId, size: number): void;
  commitPanelSizes(): void;
  select(s: Selection | null): void;
  setLinkArea(area: string): void;
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

function initialLang(): UiLang {
  const saved = prefs.uiLang.read();
  if (saved) return saved;
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es').slice(0, 2);
  return nav === 'en' || nav === 'pt' || nav === 'it' ? nav : 'es';
}

const clampTo = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

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

const NO_PREVIEW = { previewDesign: null, previewBase: null, previewKey: null } as const;

/** Estado tras confirmar un diseño: historial (con los cambios seguidos de un mismo control fusionados en un paso) y revisión nueva. */
function confirmed(s: StoreState, next: Design, coalesceKey?: string): Partial<StoreState> {
  const design = s.design;
  if (!design) return {};
  const now = Date.now();
  const merge = coalesceKey !== undefined && s.coalesce?.key === coalesceKey && now - s.coalesce.at < COALESCE_MS;
  return {
    design: next,
    ...NO_PREVIEW,
    revision: s.revision + 1,
    past: merge ? s.past : [...s.past.slice(-HISTORY_LIMIT + 1), design],
    future: [],
    coalesce: coalesceKey !== undefined ? { key: coalesceKey, at: now } : null,
  };
}

/** Aplica una receta; devuelve el diseño nuevo, o el mismo si no cambió nada (y entonces no hay paso de historial). */
export function applyRecipe(design: Design, recipe: Recipe): Design {
  const changed = produce(design, recipe);
  return changed === design ? design : produce(changed, (draft) => void (draft.updatedAt = new Date().toISOString()));
}

export const useStore = create<StoreState>((set, get) => ({
  design: null,
  previewDesign: null,
  previewBase: null,
  previewKey: null,
  revision: 0,
  past: [],
  future: [],
  coalesce: null,
  view: 'spread',
  mode: prefs.mode.read(),
  panel: prefs.mode.read() === 'print' ? 'print' : 'style',
  pageIndex: 0,
  sheetSide: 'front',
  zoom: 1,
  fit: true,
  selection: null,
  linkArea: '',
  selectedIds: [],
  inspectorOpen: false,
  scope: 'type',
  uiLang: initialLang(),
  uiLangChosen: prefs.uiLang.isSet(),
  uiScale: prefs.uiScale.read(),
  welcomeOnStart: prefs.welcomeOnStart.read(),
  autoReveal: prefs.autoReveal.read(),
  panelSizes: { left: prefs.panel.left.read(), right: prefs.panel.right.read(), thumbs: prefs.panel.thumbs.read() },
  resVersion: 0,
  showWelcome: false,
  showLibrary: false,
  showSaveTemplate: false,
  showAbout: false,
  searchOpen: false,
  showShortcuts: false,
  showHidden: false,
  preflightRequest: 0,
  textEditRequest: null,
  lastExport: null,
  sidebarOpen: true,
  guides: false,
  snap: true,
  showLinks: false,
  navBack: [],
  navForward: [],
  notice: null,
  goToKey: null,
  updateReady: false,

  setDesign(input, opts) {
    // Toda agenda que entra al editor pasa por el esquema: completa los campos que agregan las
    // versiones nuevas y acomoda valores viejos (así ninguna página falla por un dato faltante).
    const d = parseDesign(input);
    set((s) => ({
      design: d,
      ...NO_PREVIEW,
      revision: s.revision + 1,
      past: opts?.keepHistory ? s.past : [],
      future: opts?.keepHistory ? s.future : [],
      coalesce: null,
      selection: null,
      selectedIds: [],
      pageIndex: opts?.keepHistory ? s.pageIndex : 0,
      // Otra agenda: su historial de navegación empieza de cero.
      navBack: opts?.keepHistory ? s.navBack : [],
      navForward: opts?.keepHistory ? s.navForward : [],
    }));
    scheduleSave(d);
  },

  closeDesign() {
    const d = get().design;
    if (d) cancelSave(d.id);
    set((s) => ({ design: null, ...NO_PREVIEW, revision: s.revision + 1, past: [], future: [], coalesce: null, selection: null, selectedIds: [], pageIndex: 0, navBack: [], navForward: [] }));
  },

  setNotice: (notice) => set({ notice }),
  setGoToKey: (goToKey) => set({ goToKey }),
  setUpdateReady: (updateReady) => set({ updateReady }),

  update(recipe, coalesceKey) {
    const { design } = get();
    if (!design) return;
    const next = applyRecipe(design, recipe);
    if (next === design) return;
    set((s) => confirmed(s, next, coalesceKey));
    scheduleSave(next);
  },

  preview(recipe, key) {
    const { design } = get();
    if (!design) return;
    const next = applyRecipe(design, recipe);
    set({ previewDesign: next === design ? null : next, previewBase: design, previewKey: key });
  },

  clearPreview: () => set(NO_PREVIEW),

  commit(recipe, key) {
    const { design, previewDesign, previewBase, previewKey } = get();
    if (!design) return;
    if (previewDesign && previewBase === design && previewKey === key) {
      set((s) => confirmed(s, previewDesign, key));
      scheduleSave(previewDesign);
    } else {
      set(NO_PREVIEW);
      get().update(recipe, key);
    }
  },

  undo() {
    const { design, past, future } = get();
    const prev = past[past.length - 1];
    if (!design || !prev) return;
    set((s) => ({ design: prev, ...NO_PREVIEW, revision: s.revision + 1, past: past.slice(0, -1), future: [design, ...future], coalesce: null }));
    scheduleSave(prev);
  },

  redo() {
    const { design, past, future } = get();
    const next = future[0];
    if (!design || !next) return;
    set((s) => ({ design: next, ...NO_PREVIEW, revision: s.revision + 1, past: [...past, design], future: future.slice(1), coalesce: null }));
    scheduleSave(next);
  },

  setView: (view) => set({ view, selection: null, selectedIds: [] }),
  setMode(mode) {
    prefs.mode.write(mode);
    const { view, panel } = get();
    set({
      mode,
      // La vista que el modo nuevo no ofrece se cambia (lo elegido se limpia solo si la vista cambia).
      ...(MODE_VIEWS[mode].includes(view) ? {} : { view: 'spread' as const, selection: null, selectedIds: [] }),
      panel: mode === 'print' ? 'print' : panel === 'print' ? 'style' : panel,
    });
  },
  // Las opciones de impresión viven en el modo «Impresión»: pedirlas desde el diseño lo cambia.
  setPanel: (panel) => (panel === 'print' && get().mode !== 'print' ? get().setMode('print') : set({ panel })),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setLastExport: (lastExport) => set({ lastExport }),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  setShowHidden: (showHidden) => set({ showHidden }),
  requestPreflight: () => set((s) => ({ preflightRequest: s.preflightRequest + 1 })),
  requestTextEdit: (textEditRequest) => set({ textEditRequest }),
  goToPage: (i) => set({ pageIndex: Math.max(0, i), selection: null, selectedIds: [] }),
  setSheetSide: (sheetSide) => set({ sheetSide }),
  setZoom: (zoom, fit = false) => set({ zoom: clampTo(zoom, ZOOM.min, ZOOM.max), fit }),
  zoomBy: (factor) => get().setZoom((get().fit ? 1 : get().zoom) * factor),
  zoomFit: () => get().setZoom(1, true),
  setUiScale(uiScale) {
    const v = clampTo(uiScale, UI_SCALE.min, UI_SCALE.max);
    prefs.uiScale.write(v);
    set({ uiScale: v });
  },
  setAutoReveal(autoReveal) {
    prefs.autoReveal.write(autoReveal);
    set({ autoReveal });
  },
  setWelcomeOnStart(welcomeOnStart) {
    prefs.welcomeOnStart.write(welcomeOnStart);
    set({ welcomeOnStart });
  },
  setPanelSize: (panel, size) => set((s) => ({ panelSizes: { ...s.panelSizes, [panel]: clampTo(size, PANEL_LIMITS[panel].min, PANEL_LIMITS[panel].max) } })),
  commitPanelSizes() {
    const { left, right, thumbs } = get().panelSizes;
    prefs.panel.left.write(left);
    prefs.panel.right.write(right);
    prefs.panel.thumbs.write(thumbs);
  },
  select: (selection) => set({ selection, selectedIds: selection ? [selection.blockId] : [], linkArea: '' }),
  setSelection: (selection, ids) => set({ selection, selectedIds: selection ? [...new Set([...(ids ?? []), selection.blockId])] : [], linkArea: '' }),
  setLinkArea: (linkArea) => set({ linkArea }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setScope: (scope) => set({ scope }),
  setUiLang(uiLang) {
    prefs.uiLang.write(uiLang);
    set({ uiLang, uiLangChosen: true });
  },
  followLang: (uiLang) => set({ uiLang }),
  followAgendaLang(uiLang) {
    prefs.uiLang.clear();
    set({ uiLang, uiLangChosen: false });
  },
  bumpResources: (resVersion) => set({ resVersion }),
  setShowWelcome: (showWelcome) => set({ showWelcome }),
  setShowLibrary: (showLibrary) => set({ showLibrary }),
  setShowSaveTemplate: (showSaveTemplate) => set({ showSaveTemplate }),
  setShowAbout: (showAbout) => set({ showAbout }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleGuides: () => set((s) => ({ guides: !s.guides })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  setShowLinks: (showLinks) => set({ showLinks }),
  setNav: (navBack, navForward) => set({ navBack, navForward }),
}));
