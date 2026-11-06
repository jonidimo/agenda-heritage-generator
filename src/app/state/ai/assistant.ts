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
 * - La conversación es de la sesión: vive en memoria y empieza de nuevo al cambiar de agenda, de
 *   proveedor, de modelo o el permiso de mirar las páginas.
 */
import type { AiErrorKind } from '@core/ai/errors';
import { AiError } from '@core/ai/errors';
import type { AiMessage } from '@core/ai/messages';
import type { Proposal } from '@core/ai/tools';
import type { LayoutNote } from '@core/document/feedback';
import { create } from 'zustand';
import { prefs } from '../prefs';
import { useStore } from '../store';
import { tNow } from '../tNow';
import type { PendingProposal, TurnEvent } from './engine';
import { activeProvider, sessionKey, type AiSettings } from './settings';

export type AssistantStatus = 'idle' | 'working' | 'awaiting' | 'error';

export interface Turn {
  id: number;
  request: string;
  /** Lo que contestó el modelo (o el resumen de lo que propuso). */
  reply: string;
  outcome: 'answer' | 'proposed' | 'applied' | 'discarded' | 'stale' | 'error' | 'cancelled';
}

export interface ShownProposal {
  id: string;
  summary: string;
  /** Lo que dijo el modelo junto con la propuesta. */
  note: string;
  warnings: LayoutNote[];
  omittedWarnings: number;
  ignored: string[];
  ops: Array<{ op: string; path: string }>;
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
let pending: { proposal: Proposal; pending: PendingProposal } | null = null;
let abort: AbortController | null = null;
let session = '';
let lastRequest = '';
let nextTurn = 1;
let nextProposal = 1;

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

const engine = () => import('./engine');

export const useAssistant = create<AssistantState>((set, get) => {
  /** Le cuenta al modelo qué pasó con la propuesta pendiente, y la quita de la página si sigue ahí. */
  const settlePending = async (decision: Parameters<Awaited<ReturnType<typeof engine>>['settle']>[2], shownId = get().proposal?.id): Promise<void> => {
    if (!pending) return;
    // La vista previa se quita en el momento (antes de esperar al motor): la persona ya decidió.
    if (shownId !== undefined && useStore.getState().previewKey === previewKeyOf(shownId)) useStore.getState().clearPreview();
    const settling = pending;
    pending = null;
    const { settle } = await engine();
    history = settle(history, settling.pending, decision);
  };

  const markLast = (outcome: Turn['outcome'], reply?: string): void =>
    set((s) => ({ turns: s.turns.map((t, i) => (i === s.turns.length - 1 ? { ...t, outcome, ...(reply !== undefined ? { reply } : {}) } : t)) }));

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
    settings: prefs.ai.read(),

    setOpen: (open) => set({ open }),
    focus: () => set((s) => ({ open: true, focusTick: s.focusTick + 1 })),
    setDraft: (draft) => set({ draft }),
    setShowHistory: (showHistory) => set({ showHistory }),
    setShowSettings: (showSettings) => set({ showSettings }),
    updateSettings(recipe) {
      const settings = recipe(get().settings);
      prefs.ai.write(settings);
      set({ settings });
    },

    async send(text) {
      const request = (text ?? get().draft).trim();
      if (!request || get().status === 'working') return;
      if (!useStore.getState().design) return;
      // Pedir otra cosa con una propuesta a la vista es dejarla pasar.
      if (pending) {
        await settlePending({ applied: false, reason: 'discarded' });
        markLast('discarded');
      }
      lastRequest = request;
      const ac = new AbortController();
      abort = ac;
      const turnId = nextTurn++;
      set((s) => ({ status: 'working', activity: tNow('ai.thinking'), reply: null, error: null, proposal: null, draft: text === undefined ? '' : s.draft, turns: [...s.turns, { id: turnId, request, reply: '', outcome: 'answer' } satisfies Turn].slice(-20) }));
      const cfg = activeProvider(get().settings);
      try {
        const { turn } = await engine();
        const out = await turn({ ...cfg, vision: get().settings.vision, history, text: request, signal: ac.signal, onEvent: (e) => abort === ac && set({ activity: activityOf(e) }) });
        if (abort !== ac) return;
        abort = null;
        history = out.history;
        if (out.kind === 'answer') {
          set({ status: 'idle', activity: null, reply: out.text || tNow('ai.noAnswer') });
          markLast('answer', out.text);
          return;
        }
        const id = String(nextProposal++);
        const st = useStore.getState();
        pending = { proposal: out.proposal, pending: out.pending };
        st.preview(() => out.proposal.design, previewKeyOf(id));
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
            ops: out.proposal.patch.map((o) => ({ op: o.op, path: o.path })),
            baseRevision: st.revision,
            stale: false,
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
          return;
        }
        set({ status: 'error', activity: null, error: { kind: err.kind, message: err.message } });
        markLast('error', err.message);
      }
    },

    async apply() {
      const shown = get().proposal;
      const st = useStore.getState();
      if (!shown || !pending) return;
      if (shown.stale || st.revision !== shown.baseRevision) {
        set({ proposal: { ...shown, stale: true } });
        return;
      }
      const design = pending.proposal.design;
      // Primero se quita la propuesta: confirmar sube la revisión y no tiene que verse como un cambio ajeno.
      set({ proposal: null, status: 'idle' });
      st.commit(() => design, previewKeyOf(shown.id));
      const after = useStore.getState();
      after.setAiNotice({ text: tNow('ai.applied', { summary: shown.summary }), revision: after.revision });
      await settlePending({ applied: true, revision: after.revision }, shown.id);
      markLast('applied');
    },

    async discard() {
      const shown = get().proposal;
      if (!shown) return;
      const stale = shown.stale;
      set({ proposal: null, status: 'idle' });
      await settlePending({ applied: false, reason: stale ? 'stale' : 'discarded' }, shown.id);
      markLast(stale ? 'stale' : 'discarded');
    },

    showAgain() {
      const shown = get().proposal;
      if (!shown || shown.stale || !pending) return;
      const design = pending.proposal.design;
      useStore.getState().preview(() => design, previewKeyOf(shown.id));
    },

    async retry() {
      if (get().proposal) await get().discard();
      if (lastRequest) await get().send(lastRequest);
    },

    stop() {
      if (abort) {
        abort.abort();
        abort = null;
        set({ status: 'idle', activity: null });
        markLast('cancelled');
      }
    },

    dismiss: () => set({ reply: null, error: null, status: get().status === 'error' ? 'idle' : get().status }),

    clear() {
      get().stop();
      void get().discard();
      history = [];
      set({ turns: [], reply: null, error: null, showHistory: false });
    },
  };
});

/** Empieza una conversación nueva (otra agenda, otro proveedor o modelo, otro permiso de mirar páginas). */
function resetSession(): void {
  const a = useAssistant.getState();
  a.stop();
  if (a.proposal && useStore.getState().previewKey === previewKeyOf(a.proposal.id)) useStore.getState().clearPreview();
  history = [];
  pending = null;
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
