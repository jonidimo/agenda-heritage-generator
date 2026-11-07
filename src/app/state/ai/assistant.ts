/**
 * El estado del asistente de IA de la aplicación: lo que se ve (la píldora, lo que está haciendo, la
 * propuesta con sus avisos, la respuesta, el historial de la sesión) y las acciones (pedir, aplicar,
 * descartar, detener, reintentar).
 *
 * Reglas:
 * - Una propuesta se ve en la página como vista previa y **no cambia la agenda** hasta «Aplicar», que la
 *   confirma como un solo paso de «Deshacer» (con la bandera de siempre).
 * - Si la persona cambia la agenda mientras una propuesta espera, la propuesta queda vieja: ya no se
 *   aplica (pisaría lo que hizo), se ofrece volver a pedirla.
 * - Pedir otra cosa con una propuesta a la vista la **ajusta**: queda como borrador de trabajo, el modelo
 *   lo lee y su próxima propuesta se suma encima; «Aplicar» confirma todo junto en un solo paso.
 * - La conversación es de la sesión: vive en memoria y empieza de nuevo al cambiar de agenda, de
 *   proveedor, de modelo o el permiso de mirar las páginas.
 */
import type { AiProviderId } from '@core/ai/messages';
import { PROVIDER_IDS, PROVIDERS } from '@core/ai/providers';
import { isDesktopShell } from '../desktopBridge';
import type { AiErrorKind } from '@core/ai/errors';
import { trimHistory } from '@core/ai/budget';
import { AiError } from '@core/ai/errors';
import type { AiMessage } from '@core/ai/messages';
import type { Design } from '@core/design/schema';
import type { JsonPatchOp } from '@core/util/jsonPatch';
import type { LayoutNote } from '@core/document/feedback';
import { create } from 'zustand';
import { prefs } from '../prefs';
import { useStore } from '../store';
import { tNow } from '../tNow';
import type { PendingProposal, ProposalDecision, TurnEvent } from './engine';
import { activeProvider, normalizeAiSettings, sessionKey, type AiSettings } from './settings';
import { loadEngine } from './lazy';

export type AssistantStatus = 'idle' | 'working' | 'awaiting' | 'error';

export interface Turn {
  id: number;
  request: string;
  /** Lo que contestó el modelo (o el resumen de lo que propuso). */
  reply: string;
  outcome: 'answer' | 'proposed' | 'refined' | 'applied' | 'discarded' | 'stale' | 'error' | 'cancelled';
}

export interface ShownProposal {
  id: string;
  summary: string;
  /** Lo que dijo el modelo junto con la propuesta. */
  note: string;
  warnings: LayoutNote[];
  omittedWarnings: number;
  ignored: string[];
  /** Las operaciones de la propuesta (las de los ajustes anteriores primero), con su valor. */
  ops: JsonPatchOp[];
  /** Cuántas propuestas se sumaron en esta (1 si no se ajustó). */
  rounds: number;
  baseRevision: number;
  /** La agenda cambió desde que se propuso: ya no se puede aplicar. */
  stale: boolean;
}

interface AssistantState {
  /** La píldora está abierta (con el campo para escribir). */
  open: boolean;
  /** Sube cada vez que algo pide el foco en el campo (Ctrl+J). */
  focusTick: number;
  draft: string;
  status: AssistantStatus;
  /** Qué está haciendo («Leyendo la agenda…»). */
  activity: string | null;
  reply: string | null;
  error: { kind: AiErrorKind; message: string } | null;
  proposal: ShownProposal | null;
  turns: Turn[];
  showHistory: boolean;
  showSettings: boolean;
  settings: AiSettings;

  setOpen(open: boolean): void;
  focus(): void;
  setDraft(text: string): void;
  setShowHistory(v: boolean): void;
  setShowSettings(v: boolean): void;
  updateSettings(recipe: (s: AiSettings) => AiSettings): void;
  send(text?: string): Promise<void>;
  apply(): Promise<void>;
  discard(): Promise<void>;
  showAgain(): void;
  retry(): Promise<void>;
  stop(): void;
  dismiss(): void;
  clear(): void;
}

/* ---------- Lo que no se dibuja: la conversación y lo pendiente ---------- */

let history: AiMessage[] = [];
/**
 * Lo que se ve en la tarjeta: el diseño propuesto (con los ajustes ya sumados) y, si el modelo espera la
 * decisión, su llamada abierta. Sin llamada abierta es un borrador que quedó de un ajuste que terminó en
 * una respuesta: se puede aplicar, descartar o seguir ajustando.
 */
let current: { design: Design; call: PendingProposal | null } | null = null;
/** La tarjeta de la propuesta que se está ajustando (vuelve si el ajuste no termina en otra propuesta). */
let refiningShown: ShownProposal | null = null;
/**
 * Lo que el modelo tiene que saber antes del próximo pedido: qué pasó con un borrador que ya no tenía una
 * llamada abierta (se aplicó o se descartó). Va delante del próximo pedido de la persona.
 */
let pendingNote: string | null = null;

/** Quita de la página lo que el asistente esté mostrando (una propuesta o un borrador). */
function clearAiPreview(): void {
  if (useStore.getState().previewKey?.startsWith('ai:')) useStore.getState().clearPreview();
}
let abort: AbortController | null = null;
let session = '';
let lastRequest = '';
let nextTurn = 1;
let nextProposal = 1;
/** Sube con «Limpiar» y con cada sesión nueva: lo que termina de una conversación vieja no toca la nueva. */
let epoch = 0;

const previewKeyOf = (id: string): string => `ai:${id}`;

const ACTIVITY: Record<string, Parameters<typeof tNow>[0]> = {
  get_context: 'ai.act.context',
  list_pages: 'ai.act.reading',
  get_design_part: 'ai.act.reading',
  get_schema: 'ai.act.reading',
  get_catalogue: 'ai.act.reading',
  render_page: 'ai.act.looking',
  check_design: 'ai.act.checking',
  propose_change: 'ai.act.proposing',
  reveal: 'ai.act.showing',
  set_view: 'ai.act.showing',
};

function activityOf(e: TurnEvent): string {
  if (e.type === 'thinking') return tNow('ai.thinking');
  const page = e.name === 'render_page' && e.input && typeof e.input === 'object' ? (e.input as { page?: unknown }).page : undefined;
  return tNow(ACTIVITY[e.name] ?? 'ai.act.reading', { n: typeof page === 'number' ? page : '' });
}

/** El único origen al que va la clave de un proveedor con estos ajustes. */
function keyOriginOf(p: AiProviderId, s: AiSettings): string {
  try {
    return new URL(s.perProvider[p].baseUrl || PROVIDERS[p].defaultBase).origin;
  } catch {
    return '';
  }
}

// El motor se descarga recién al usarlo (si no llega, el error pide recargar la ventana).
const engine = loadEngine;

export const useAssistant = create<AssistantState>((set, get) => {
  /**
   * Le cuenta al modelo qué pasó con la propuesta pendiente y la quita de la página si sigue ahí. Con
   * `keep` (ajustar) el diseño queda como borrador y se sigue viendo.
   */
  const settlePending = async (decision: ProposalDecision, shownId = get().proposal?.id, keep = false): Promise<void> => {
    if (!current) return;
    // La vista previa se quita en el momento (antes de esperar al motor): la persona ya decidió.
    if (!keep && shownId !== undefined && useStore.getState().previewKey === previewKeyOf(shownId)) useStore.getState().clearPreview();
    const call = current.call;
    current = keep ? { design: current.design, call: null } : null;
    if (!call) {
      // Un borrador sin llamada abierta: el modelo se entera con el próximo pedido.
      if (!keep) pendingNote = decision.applied ? `(The working draft was applied as revision ${decision.revision}.)` : `(The working draft was ${decision.reason === 'stale' ? 'dropped because the planner changed' : 'discarded'}: the tools read the planner again.)`;
      return;
    }
    const started = epoch;
    const { settle } = await engine();
    // Si mientras tanto se limpió la conversación, la respuesta a la propuesta ya no tiene a quién ir.
    if (started !== epoch) return;
    history = settle(history, call, decision);
  };

  const markLast = (outcome: Turn['outcome'], reply?: string): void =>
    set((s) => ({ turns: s.turns.map((t, i) => (i === s.turns.length - 1 ? { ...t, outcome, ...(reply !== undefined ? { reply } : {}) } : t)) }));
  /** Lo que pasó con una propuesta, en el turno que la propuso (no en uno que terminó en una respuesta). */
  const markProposal = (outcome: Turn['outcome']): void => {
    if (get().turns.at(-1)?.outcome === 'proposed') markLast(outcome);
  };
  /** Si el ajuste no terminó en otra propuesta, la de antes vuelve a la tarjeta (sigue en la página). */
  const restoreDraft = (): void => {
    const shown = refiningShown;
    refiningShown = null;
    if (!shown || !current || current.call) return;
    const stale = useStore.getState().revision !== shown.baseRevision;
    set({ proposal: { ...shown, stale }, status: get().status === 'error' ? 'error' : 'awaiting' });
  };

  return {
    open: false,
    focusTick: 0,
    draft: '',
    status: 'idle',
    activity: null,
    reply: null,
    error: null,
    proposal: null,
    turns: [],
    showHistory: false,
    showSettings: false,
    settings: normalizeAiSettings(prefs.ai.read()),

    setOpen: (open) => set({ open }),
    focus: () => set((s) => ({ open: true, focusTick: s.focusTick + 1 })),
    setDraft: (draft) => set({ draft }),
    setShowHistory: (showHistory) => set({ showHistory }),
    setShowSettings: (showSettings) => set({ showSettings }),
    updateSettings(recipe) {
      const before = get().settings;
      const settings = recipe(before);
      prefs.ai.write(settings);
      set({ settings });
      // Una clave es de un servicio: si cambia la dirección a la que va, se olvida (en el escritorio lo hace el proceso principal).
      if (!isDesktopShell()) {
        const moved = PROVIDER_IDS.filter((p) => keyOriginOf(p, before) !== keyOriginOf(p, settings));
        if (moved.length > 0) void import('./keys').then((k) => Promise.all(moved.map((p) => k.setKey(p, null, false))));
      }
    },

    async send(text) {
      const request = (text ?? get().draft).trim();
      if (!request || get().status === 'working') return;
      if (!useStore.getState().design) return;
      const cfg = activeProvider(get().settings);
      // Un servidor local u otro servicio no tiene un modelo «de siempre»: hay que elegir uno.
      if (!cfg.model) {
        set({ status: 'error', reply: null, error: { kind: 'notFound', message: tNow('ai.noModel') } });
        return;
      }
      // Pedir otra cosa con una propuesta a la vista es ajustarla (si sigue valiendo); una vieja se deja pasar.
      const before = get().proposal;
      const refining = current && before && !before.stale ? { design: current.design, shown: before } : null;
      if (refining) {
        await settlePending({ applied: false, reason: 'refining' }, before!.id, true);
        markProposal('refined');
      } else if (current) {
        clearAiPreview();
        await settlePending({ applied: false, reason: before?.stale ? 'stale' : 'discarded' });
        markProposal(before?.stale ? 'stale' : 'discarded');
      }
      refiningShown = refining?.shown ?? null;
      const note = pendingNote;
      pendingNote = null;
      lastRequest = request;
      // La agenda como estaba al pedir (o la que tenía de base la propuesta que se ajusta): si la persona la
      // cambia mientras el modelo trabaja, la propuesta llega vieja.
      const startRevision = refining ? refining.shown.baseRevision : useStore.getState().revision;
      const ac = new AbortController();
      abort = ac;
      const turnId = nextTurn++;
      set((s) => ({ status: 'working', activity: tNow('ai.thinking'), reply: null, error: null, proposal: null, draft: text === undefined ? '' : s.draft, turns: [...s.turns, { id: turnId, request, reply: '', outcome: 'answer' } satisfies Turn].slice(-20) }));
      try {
        const { turn } = await engine();
        const out = await turn({ ...cfg, vision: get().settings.vision, draft: refining?.design ?? null, history, text: note ? `${note}\n\n${request}` : request, signal: ac.signal, onEvent: (e) => abort === ac && set({ activity: activityOf(e) }) });
        if (abort !== ac) return;
        abort = null;
        // En memoria queda lo que entra en un pedido (las páginas vistas hace mucho no se guardan para siempre).
        history = trimHistory(out.history);
        if (out.kind === 'answer') {
          set({ status: 'idle', activity: null, reply: out.text || tNow('ai.noAnswer') });
          markLast('answer', out.text);
          restoreDraft();
          return;
        }
        const id = String(nextProposal++);
        const st = useStore.getState();
        const replaced = refining ? previewKeyOf(refining.shown.id) : null;
        refiningShown = null;
        current = { design: out.proposal.design, call: out.pending };
        const stale = st.revision !== startRevision;
        // Una propuesta armada sobre la agenda de antes desharía lo que la persona cambió: no se muestra sobre la página.
        if (!stale) st.preview(() => out.proposal.design, previewKeyOf(id));
        else if (replaced && st.previewKey === replaced) st.clearPreview();
        set({
          status: 'awaiting',
          activity: null,
          proposal: {
            id,
            summary: out.proposal.summary,
            note: out.text,
            warnings: out.proposal.warnings,
            omittedWarnings: out.proposal.omittedWarnings,
            ignored: out.proposal.ignored,
            ops: [...(refining?.shown.ops ?? []), ...out.proposal.patch],
            rounds: (refining?.shown.rounds ?? 0) + 1,
            baseRevision: startRevision,
            stale,
          },
        });
        markLast('proposed', out.proposal.summary);
      } catch (raw) {
        if (abort !== ac) return;
        abort = null;
        const err = raw instanceof AiError ? raw : new AiError('protocol', raw instanceof Error ? raw.message : String(raw));
        if (err.kind === 'aborted') {
          set({ status: 'idle', activity: null });
          markLast('cancelled');
          restoreDraft();
          return;
        }
        set({ status: 'error', activity: null, error: { kind: err.kind, message: err.message } });
        markLast('error', err.message);
        restoreDraft();
      }
    },

    async apply() {
      const shown = get().proposal;
      const st = useStore.getState();
      if (!shown || !current) return;
      if (shown.stale || st.revision !== shown.baseRevision) {
        set({ proposal: { ...shown, stale: true } });
        return;
      }
      const design = current.design;
      // Primero se quita la propuesta: confirmar sube la revisión y no tiene que verse como un cambio ajeno.
      set({ proposal: null, status: 'idle', error: null });
      st.commit(() => design, previewKeyOf(shown.id));
      const after = useStore.getState();
      after.setAiNotice({ text: tNow('ai.applied', { summary: shown.summary }), revision: after.revision });
      await settlePending({ applied: true, revision: after.revision }, shown.id);
      markProposal('applied');
    },

    async discard() {
      const shown = get().proposal;
      if (!shown) return;
      const stale = shown.stale;
      set({ proposal: null, status: 'idle', error: null });
      await settlePending({ applied: false, reason: stale ? 'stale' : 'discarded' }, shown.id);
      markProposal(stale ? 'stale' : 'discarded');
    },

    showAgain() {
      const shown = get().proposal;
      if (!shown || shown.stale || !current) return;
      const design = current.design;
      useStore.getState().preview(() => design, previewKeyOf(shown.id));
    },

    async retry() {
      // Un ajuste que falló se vuelve a pedir sobre la misma propuesta; una propuesta vieja se deja pasar.
      const shown = get().proposal;
      if (shown && (shown.stale || !get().error)) await get().discard();
      if (lastRequest) await get().send(lastRequest);
    },

    stop() {
      if (abort) {
        abort.abort();
        abort = null;
        set({ status: 'idle', activity: null });
        markLast('cancelled');
        // Detener un ajuste deja a la vista la propuesta que se ajustaba.
        restoreDraft();
      }
    },

    dismiss: () => set({ reply: null, error: null, status: get().status === 'error' ? (get().proposal ? 'awaiting' : 'idle') : get().status }),

    clear() {
      get().stop();
      void get().discard();
      // Un borrador sin tarjeta (o que la tarjeta todavía no mostraba) también se va.
      clearAiPreview();
      current = null;
      refiningShown = null;
      pendingNote = null;
      epoch++;
      history = [];
      set({ turns: [], reply: null, error: null, showHistory: false });
    },
  };
});

/** Empieza una conversación nueva (otra agenda, otro proveedor o modelo, otro permiso de mirar páginas). */
function resetSession(): void {
  const a = useAssistant.getState();
  a.stop();
  clearAiPreview();
  epoch++;
  history = [];
  current = null;
  refiningShown = null;
  pendingNote = null;
  useAssistant.setState({ proposal: null, reply: null, error: null, status: 'idle', turns: [] });
}

/** Engancha el asistente al editor: propuestas que quedan viejas y sesiones que empiezan de nuevo. */
export function installAssistant(): () => void {
  session = sessionKey(useAssistant.getState().settings);
  let designId = useStore.getState().design?.id ?? null;
  const offStore = useStore.subscribe((s) => {
    const id = s.design?.id ?? null;
    if (id !== designId) {
      designId = id;
      resetSession();
      return;
    }
    const shown = useAssistant.getState().proposal;
    if (shown && !shown.stale && s.revision !== shown.baseRevision) useAssistant.setState({ proposal: { ...shown, stale: true } });
  });
  const offSettings = useAssistant.subscribe((a) => {
    const next = sessionKey(a.settings);
    if (next !== session) {
      session = next;
      resetSession();
    }
  });
  return () => {
    offStore();
    offSettings();
  };
}

/** Ctrl+J: muestra la píldora (aunque esté oculta en Ver) y pone el foco en el campo. */
export const focusAssistant = (): void => useAssistant.getState().focus();
