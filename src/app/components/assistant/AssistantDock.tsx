/**
 * El asistente de IA al pie del lienzo: una píldora discreta que flota sobre la página (no ocupa una
 * fila). Plegada dice «Pedile al asistente…»; al tocarla o con Ctrl+J se abre el campo. Lo que el
 * asistente propone o contesta aparece en una tarjeta encima de la píldora, con «Aplicar» y
 * «Descartar»; el cambio se ve en la página mientras tanto.
 */
import clsx from 'clsx';
import { AlertTriangle, ArrowUp, ChevronDown, ChevronUp, History, Settings2, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { plural, useT, type UiKey } from '../../i18n/ui';
import { useAssistant, type ShownProposal, type Turn } from '../../state/ai/assistant';
import { shortcutHint } from '../../state/shortcutHints';
import { useStore } from '../../state/store';
import { ErrorBoundary } from '../ErrorBoundary';
import { AssistantSettings } from './AssistantSettings';

const ERROR_KEYS: Record<string, UiKey> = {
  auth: 'ai.err.auth',
  rateLimit: 'ai.err.rateLimit',
  badRequest: 'ai.err.badRequest',
  notFound: 'ai.err.notFound',
  server: 'ai.err.server',
  network: 'ai.err.network',
  timeout: 'ai.err.timeout',
  protocol: 'ai.err.protocol',
  refusal: 'ai.err.refusal',
  length: 'ai.err.length',
  rounds: 'ai.err.rounds',
};

/** El asistente, con su propio límite de errores: si algo falla acá, el editor sigue andando. */
export function AssistantDock({ footer }: { footer: boolean }) {
  const t = useT();
  return (
    <ErrorBoundary
      resetKeys={[]}
      fallback={(e) => (
        <div className={clsx('absolute left-1/2 z-20 -translate-x-1/2 rounded-full border border-line bg-paper/90 px-3 py-1.5 text-[12px] text-warn shadow-sm', footer ? 'bottom-12' : 'bottom-4')} role="alert">
          {t('ai.crashed')} {e.message}
        </div>
      )}
    >
      <Dock footer={footer} />
    </ErrorBoundary>
  );
}

function Dock({ footer }: { footer: boolean }) {
  const t = useT();
  const a = useAssistant();
  const hasDesign = useStore((s) => s.design !== null);
  const input = useRef<HTMLInputElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Ctrl+J (o tocar la píldora): el foco va al campo; al plegarla vuelve a donde estaba.
  useEffect(() => {
    if (a.focusTick === 0) return;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== input.current) returnFocus.current = document.activeElement;
    requestAnimationFrame(() => input.current?.focus());
  }, [a.focusTick]);

  // Oculta (menú Ver), la píldora no se dibuja; sus ajustes se pueden abrir igual desde el menú Archivo.
  if (!hasDesign || (!a.settings.pill && !a.open)) return a.showSettings ? createPortal(<AssistantSettings onClose={() => a.setShowSettings(false)} />, document.body) : null;

  const collapse = (): void => {
    a.setOpen(false);
    returnFocus.current?.focus?.();
    returnFocus.current = null;
  };
  const working = a.status === 'working';
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    void a.send();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    // Esc: detiene lo que está haciendo; si no, descarta la propuesta; si no, pliega.
    if (working) a.stop();
    else if (a.proposal) void a.discard();
    else collapse();
  };

  return (
    <div className={clsx('pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4', footer ? 'bottom-12' : 'bottom-4')} data-testid="assistant">
      <div className="relative flex w-full max-w-[560px] flex-col items-center gap-2">
        <Cards />
        {a.open ? (
          <form onSubmit={submit} className="pointer-events-auto flex w-full items-center gap-1 rounded-full border border-line bg-paper/90 py-1 pr-1 pl-3 shadow-md backdrop-blur" role="search" aria-label={t('ai.title')}>
            <Sparkles size={15} className={clsx('shrink-0 text-accent', working && 'animate-pulse motion-reduce:animate-none')} aria-hidden="true" />
            <input
              ref={input}
              value={a.draft}
              onChange={(e) => a.setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={working ? (a.activity ?? t('ai.thinking')) : t('ai.placeholder')}
              aria-label={t('ai.placeholder')}
              maxLength={2000}
              disabled={working}
              className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-ink placeholder:text-ink-soft focus:outline-none disabled:opacity-80"
              data-testid="assistant-input"
            />
            <IconRound label={t('ai.history')} onClick={() => a.setShowHistory(!a.showHistory)} pressed={a.showHistory} disabled={a.turns.length === 0}>
              <History size={14} />
            </IconRound>
            <IconRound label={t('ai.settings')} onClick={() => a.setShowSettings(true)}>
              <Settings2 size={14} />
            </IconRound>
            {working ? (
              <IconRound label={t('ai.stop')} onClick={() => a.stop()} strong>
                <Square size={12} fill="currentColor" />
              </IconRound>
            ) : (
              <IconRound label={t('ai.send')} submit strong disabled={a.draft.trim() === ''}>
                <ArrowUp size={15} />
              </IconRound>
            )}
            <IconRound label={t('ai.collapse')} onClick={collapse}>
              <ChevronDown size={14} />
            </IconRound>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => a.focus()}
            className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full border border-line bg-paper/85 px-3.5 text-[12.5px] text-ink-soft shadow-sm backdrop-blur hover:border-accent/60 hover:text-ink"
            data-testid="assistant-pill"
          >
            <Sparkles size={14} className={clsx('text-accent', working && 'animate-pulse motion-reduce:animate-none')} aria-hidden="true" />
            <span>{working ? (a.activity ?? t('ai.thinking')) : a.proposal ? t('ai.waiting') : t('ai.placeholder')}</span>
            <kbd className="rounded border border-line bg-white/70 px-1 text-[10.5px] font-semibold text-ink-soft">{shortcutHint('ai.focus', t)}</kbd>
          </button>
        )}
        {/* Lo que va pasando, para los lectores de pantalla. */}
        <span className="sr-only" aria-live="polite">
          {working ? a.activity : a.proposal ? a.proposal.summary : (a.reply ?? '')}
        </span>
      </div>
      {a.showSettings && createPortal(<AssistantSettings onClose={() => a.setShowSettings(false)} />, document.body)}
    </div>
  );
}

function IconRound(props: { label: string; children: React.ReactNode; onClick?: () => void; submit?: boolean; strong?: boolean; disabled?: boolean; pressed?: boolean }) {
  return (
    <button
      type={props.submit ? 'submit' : 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      className={clsx(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-40',
        props.strong ? 'bg-accent text-white hover:bg-accent/90' : 'text-ink-soft hover:bg-black/5 hover:text-ink',
        props.pressed && 'bg-black/5 text-ink',
      )}
    >
      {props.children}
    </button>
  );
}

const cardCls = 'pointer-events-auto w-full rounded-xl border border-line bg-paper/95 p-3 text-[12.5px] text-ink shadow-lg backdrop-blur';

/** La tarjeta de encima de la píldora: el historial, la propuesta, la respuesta o el error. */
function Cards() {
  const a = useAssistant();
  return (
    <>
      {a.showHistory && a.turns.length > 0 && <HistoryCard turns={a.turns} />}
      {a.proposal ? <ProposalCard p={a.proposal} /> : a.error ? <ErrorCard /> : a.reply ? <ReplyCard text={a.reply} /> : null}
    </>
  );
}

function ProposalCard({ p }: { p: ShownProposal }) {
  const t = useT();
  const a = useAssistant();
  const previewKey = useStore((s) => s.previewKey);
  const onPage = previewKey === `ai:${p.id}`;
  return (
    <section className={cardCls} aria-label={t('ai.proposal')} data-testid="ai-proposal">
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{p.summary}</p>
          {p.note && p.note !== p.summary && <p className="mt-0.5 text-ink-soft">{p.note}</p>}
        </div>
      </div>
      {(p.warnings.length > 0 || p.ignored.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-1" data-testid="ai-warnings">
          {p.warnings.slice(0, 6).map((w, i) => (
            <li key={`w${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] text-warn" title={w.message}>
              <AlertTriangle size={11} aria-hidden="true" />
              <span className="truncate">
                {w.page > 0 ? `${t('nav.page', { n: w.page })}: ` : ''}
                {w.message}
              </span>
            </li>
          ))}
          {p.warnings.length + p.omittedWarnings > 6 && <li className="text-[11px] text-ink-soft">+{p.warnings.length + p.omittedWarnings - 6}</li>}
          {p.ignored.length > 0 && <li className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-ink-soft" title={p.ignored.join(', ')}>{t('ai.ignored', { keys: p.ignored.slice(0, 3).join(', ') })}</li>}
        </ul>
      )}
      <details className="mt-2 text-[11.5px] text-ink-soft">
        <summary className="cursor-pointer select-none">{plural(t, 'ai.changes', p.ops.length)}</summary>
        <ul className="mt-1 max-h-32 overflow-auto font-mono text-[10.5px]">
          {p.ops.map((o, i) => (
            <li key={i}>
              {o.op} {o.path}
            </li>
          ))}
        </ul>
      </details>
      {p.stale ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-warn">{t('ai.stale')}</p>
          <button type="button" className="rounded-md bg-accent px-2.5 py-1 font-semibold text-white" onClick={() => void a.retry()}>
            {t('ai.retry')}
          </button>
          <button type="button" className="rounded-md px-2 py-1 hover:bg-black/5" onClick={() => void a.discard()}>
            {t('ai.discard')}
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-end gap-2">
          {!onPage && (
            <button type="button" className="mr-auto rounded-md px-2 py-1 text-ink-soft hover:bg-black/5" onClick={() => a.showAgain()}>
              {t('ai.showAgain')}
            </button>
          )}
          <button type="button" className="rounded-md px-2.5 py-1 hover:bg-black/5" onClick={() => void a.discard()} data-testid="ai-discard">
            {t('ai.discard')}
          </button>
          <button type="button" className="rounded-md bg-accent px-3 py-1 font-semibold text-white hover:bg-accent/90" onClick={() => void a.apply()} data-testid="ai-apply">
            {t('ai.apply')}
          </button>
        </div>
      )}
    </section>
  );
}

function ReplyCard({ text }: { text: string }) {
  const t = useT();
  const dismiss = useAssistant((s) => s.dismiss);
  return (
    <section className={clsx(cardCls, 'flex items-start gap-2')} aria-label={t('ai.reply')} data-testid="ai-reply">
      <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words whitespace-pre-line">{text}</p>
      <button type="button" className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label={t('common.close')} onClick={dismiss}>
        <X size={14} />
      </button>
    </section>
  );
}

function ErrorCard() {
  const t = useT();
  const a = useAssistant();
  if (!a.error) return null;
  const key = ERROR_KEYS[a.error.kind] ?? 'ai.err.protocol';
  const needsSettings = a.error.kind === 'auth' || a.error.kind === 'notFound' || a.error.kind === 'network';
  return (
    <section className={cardCls} role="alert" data-testid="ai-error">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(key)}</p>
          {a.error.message && <p className="mt-0.5 break-words text-[11.5px] text-ink-soft">{a.error.message}</p>}
        </div>
        <button type="button" className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label={t('common.close')} onClick={a.dismiss}>
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="rounded-md px-2 py-1 hover:bg-black/5" onClick={() => void navigator.clipboard?.writeText(`${a.error!.kind}: ${a.error!.message}`).catch(() => undefined)}>
          {t('ai.copyDiagnostic')}
        </button>
        {needsSettings && (
          <button type="button" className="rounded-md px-2 py-1 hover:bg-black/5" onClick={() => a.setShowSettings(true)}>
            {t('ai.settings')}
          </button>
        )}
        <button type="button" className="rounded-md bg-accent px-2.5 py-1 font-semibold text-white" onClick={() => void a.retry()}>
          {t('ai.retry')}
        </button>
      </div>
    </section>
  );
}

const OUTCOME_KEYS: Record<Turn['outcome'], UiKey> = {
  answer: 'ai.outcome.answer',
  proposed: 'ai.outcome.proposed',
  applied: 'ai.outcome.applied',
  discarded: 'ai.outcome.discarded',
  stale: 'ai.outcome.stale',
  error: 'ai.outcome.error',
  cancelled: 'ai.outcome.cancelled',
};

function HistoryCard({ turns }: { turns: Turn[] }) {
  const t = useT();
  const a = useAssistant();
  return (
    <section className={clsx(cardCls, 'max-h-56 overflow-auto')} aria-label={t('ai.history')} data-testid="ai-history">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold tracking-[0.08em] text-ink-soft uppercase">{t('ai.history')}</h3>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-black/5" onClick={() => a.clear()}>
            {t('ai.clear')}
          </button>
          <button type="button" className="rounded p-0.5 hover:bg-black/5" aria-label={t('common.close')} onClick={() => a.setShowHistory(false)}>
            <ChevronUp size={14} />
          </button>
        </div>
      </div>
      <ol className="space-y-1.5">
        {turns.map((turn) => (
          <li key={turn.id}>
            <p className="font-semibold">{turn.request}</p>
            <p className="text-[11.5px] text-ink-soft">
              {t(OUTCOME_KEYS[turn.outcome])}
              {turn.reply ? ` · ${turn.reply}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
