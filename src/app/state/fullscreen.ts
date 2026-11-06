/**
 * Pantalla completa (F11, Ver → Pantalla completa): la ventana ocupa toda la pantalla (en el escritorio,
 * la ventana de la aplicación de verdad) y se esconden la barra lateral y el inspector para dejar solo
 * la página. Los paneles no se cierran: su estado queda como estaba y vuelven solos al salir, con F11,
 * con Esc o cuando el sistema sale de la pantalla completa.
 */
import { useStore } from './store';

/** El documento de la página (en las pruebas, uno falso). */
interface FullscreenDoc {
  fullscreenElement: Element | null;
  documentElement: { requestFullscreen?: () => Promise<void> };
  exitFullscreen?: () => Promise<void>;
  addEventListener(type: 'fullscreenchange' | 'keydown', fn: (e: Event) => void, capture?: boolean): void;
  removeEventListener(type: 'fullscreenchange' | 'keydown', fn: (e: Event) => void, capture?: boolean): void;
}

const doc = (): FullscreenDoc | null => (typeof document === 'undefined' ? null : (document as unknown as FullscreenDoc));

export function enterFullscreen(d: FullscreenDoc | null = doc()): void {
  useStore.getState().setFocusMode(true);
  // Si el navegador no deja (una política, un marco), igual queda el modo sin paneles.
  if (d && !d.fullscreenElement) void d.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function exitFullscreen(d: FullscreenDoc | null = doc()): void {
  useStore.getState().setFocusMode(false);
  if (d?.fullscreenElement) void d.exitFullscreen?.().catch(() => undefined);
}

export function toggleFullscreen(d: FullscreenDoc | null = doc()): void {
  if (useStore.getState().focusMode) exitFullscreen(d);
  else enterFullscreen(d);
}

/** Sigue al sistema: si sale de la pantalla completa, vuelven los paneles; Esc sale también sin pantalla completa real. */
export function installFullscreen(d: FullscreenDoc | null = doc()): () => void {
  if (!d) return () => undefined;
  const onChange = (): void => {
    const focus = useStore.getState().focusMode;
    if (!d.fullscreenElement && focus) useStore.getState().setFocusMode(false);
    // Se pidió salir antes de que la pantalla completa terminara de entrar (F11 dos veces seguidas): se sale.
    else if (d.fullscreenElement && !focus) void d.exitFullscreen?.().catch(() => undefined);
  };
  const onKey = (e: Event): void => {
    const k = e as KeyboardEvent;
    // Con pantalla completa de verdad, Esc la quita el navegador (y llega `fullscreenchange`). Un Esc que ya
    // usó otra cosa (un diálogo, un menú, el editor de texto, el asistente) no sale.
    if (k.key !== 'Escape' || k.defaultPrevented || d.fullscreenElement || !useStore.getState().focusMode) return;
    const target = k.target as { closest?: (sel: string) => unknown } | null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
    useStore.getState().setFocusMode(false);
  };
  d.addEventListener('fullscreenchange', onChange);
  d.addEventListener('keydown', onKey);
  return () => {
    d.removeEventListener('fullscreenchange', onChange);
    d.removeEventListener('keydown', onKey);
  };
}
