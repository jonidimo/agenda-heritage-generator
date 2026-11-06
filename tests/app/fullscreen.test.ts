/** Pantalla completa: esconde los paneles sin tocar su estado, y vuelve con F11, Esc o cuando el sistema sale. */
import { beforeEach, describe, expect, it } from 'vitest';
import { enterFullscreen, exitFullscreen, installFullscreen, toggleFullscreen } from '../../src/app/state/fullscreen';
import { useStore } from '../../src/app/state/store';

/** Un documento falso: guarda quién está en pantalla completa y los oyentes. */
function fakeDoc(allow = true) {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  const d = {
    fullscreenElement: null as Element | null,
    requests: 0,
    documentElement: {
      requestFullscreen: async () => {
        d.requests++;
        if (!allow) throw new Error('no permitido');
        d.fullscreenElement = {} as Element;
      },
    },
    exitFullscreen: async () => {
      d.fullscreenElement = null;
    },
    addEventListener: (type: string, fn: (e: Event) => void) => void (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn),
    removeEventListener: (type: string, fn: (e: Event) => void) => void listeners.get(type)?.delete(fn),
    fire: (type: string, e: Partial<KeyboardEvent> = {}) => listeners.get(type)?.forEach((fn) => fn(e as Event)),
  };
  return d;
}

beforeEach(() => useStore.setState({ focusMode: false, sidebarOpen: true }));

describe('pantalla completa', () => {
  it('entrar pide la pantalla completa y esconde los paneles; los paneles siguen «abiertos» para cuando vuelvan', async () => {
    const d = fakeDoc();
    enterFullscreen(d);
    await Promise.resolve();
    expect(d.requests).toBe(1);
    expect(d.fullscreenElement).not.toBeNull();
    expect(useStore.getState()).toMatchObject({ focusMode: true, sidebarOpen: true });
    exitFullscreen(d);
    await Promise.resolve();
    expect(d.fullscreenElement).toBeNull();
    expect(useStore.getState().focusMode).toBe(false);
  });

  it('F11 alterna', () => {
    const d = fakeDoc();
    toggleFullscreen(d);
    expect(useStore.getState().focusMode).toBe(true);
    toggleFullscreen(d);
    expect(useStore.getState().focusMode).toBe(false);
  });

  it('si el sistema sale de la pantalla completa (Esc del navegador), vuelven los paneles', async () => {
    const d = fakeDoc();
    const off = installFullscreen(d);
    enterFullscreen(d);
    await Promise.resolve();
    d.fullscreenElement = null;
    d.fire('fullscreenchange');
    expect(useStore.getState().focusMode).toBe(false);
    off();
  });

  it('si el navegador no deja, queda el modo sin paneles y Esc lo quita', async () => {
    const d = fakeDoc(false);
    const off = installFullscreen(d);
    enterFullscreen(d);
    await Promise.resolve();
    expect(useStore.getState().focusMode).toBe(true);
    d.fire('keydown', { key: 'a' });
    expect(useStore.getState().focusMode).toBe(true);
    d.fire('keydown', { key: 'Escape' });
    expect(useStore.getState().focusMode).toBe(false);
    off();
  });
});
