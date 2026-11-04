/**
 * Barreras de error: si algo falla al dibujar una parte del editor, esa parte dice qué pasó en
 * lugar de dejar la pantalla en blanco. La de toda la aplicación ofrece deshacer, guardar una
 * copia o cerrar la agenda, y la anota para que al volver a abrir la aplicación no se abra sola.
 */
import { Component, type ReactNode } from 'react';
import { useT } from '../i18n/ui';
import { markCrashed } from '../state/crash';
import { saveCurrent } from '../state/fileActions';
import { useStore } from '../state/store';

interface BoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** Si cambia alguno de estos valores (otro diseño, otra página), se vuelve a intentar. */
  resetKeys?: readonly unknown[];
  onError?: (error: Error) => void;
}

interface BoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  override componentDidUpdate(prev: BoundaryProps, prevState: BoundaryState): void {
    // Solo si el error ya se estaba mostrando: el mismo cambio que lo provocó no cuenta.
    if (!this.state.error || !prevState.error) return;
    const a = prev.resetKeys ?? [];
    const b = this.props.resetKeys ?? [];
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) this.setState({ error: null });
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

const BUTTON = 'rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink hover:bg-paper';

function UndoButton() {
  const t = useT();
  const canUndo = useStore((s) => s.past.length > 0);
  if (!canUndo) return null;
  return (
    <button type="button" className={BUTTON} onClick={() => useStore.getState().undo()}>
      {t('crash.undo')}
    </button>
  );
}

/** Una vista (o el panel del elemento) que no se pudo dibujar. */
export function ViewError({ error, message }: { error: Error; message?: string }) {
  const t = useT();
  return (
    <div role="alert" className="m-auto flex max-w-sm flex-col items-center gap-2 p-6 text-center text-[12.5px] text-ink-soft">
      <p className="font-semibold text-ink">{message ?? t('view.error')}</p>
      <p>{t('view.errorHint')}</p>
      <UndoButton />
      <p className="text-[11px] break-all">{error.message}</p>
    </div>
  );
}

/** Pantalla cuando falla toda la aplicación. */
function Recovery({ error, reset }: { error: Error; reset: () => void }) {
  const t = useT();
  const hasDesign = useStore((s) => s.design !== null);
  const canUndo = useStore((s) => s.past.length > 0);
  const notice = useStore((s) => s.notice);
  return (
    <div role="alert" className="desk flex h-full items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-5 text-[13px] text-ink shadow-xl">
        <h1 className="font-display text-[22px] italic">{t('crash.title')}</h1>
        <p className="mt-2 text-ink-soft">{hasDesign ? t('crash.body') : t('crash.bodyNoDesign')}</p>
        {notice && <p className="mt-2 rounded-md bg-[#fbf3e4] px-2 py-1 text-[12px] break-words">{notice}</p>}
        <div className="mt-4 flex flex-col gap-2 text-left">
          {canUndo && (
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                useStore.getState().undo();
                reset();
              }}
            >
              {t('crash.undo')}
            </button>
          )}
          {hasDesign && (
            <button type="button" className={BUTTON} onClick={() => void saveCurrent(true)}>
              {t('crash.save')}
            </button>
          )}
          {hasDesign && (
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                const st = useStore.getState();
                st.closeDesign();
                st.setShowLibrary(true);
                reset();
              }}
            >
              {t('crash.close')}
            </button>
          )}
          <button type="button" className={BUTTON} onClick={reset}>
            {t('app.retry')}
          </button>
          <button type="button" className={BUTTON} onClick={() => location.reload()}>
            {t('crash.reload')}
          </button>
        </div>
        <details className="mt-4 text-[11.5px] text-ink-soft">
          <summary className="cursor-pointer">{t('crash.details')}</summary>
          <pre className="mt-1 whitespace-pre-wrap break-all">{error.message}</pre>
        </details>
      </div>
    </div>
  );
}

/** Barrera de toda la aplicación: anota la agenda abierta para no reabrirla sola al arrancar. */
export function AppBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => <Recovery error={error} reset={reset} />}
      onError={() => {
        const d = useStore.getState().design;
        if (d) markCrashed(d.id);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
