/**
 * Ventana de la aplicación de escritorio: se muestra aunque `ready-to-show` nunca llegue (la pila
 * gráfica falla, p. ej. EGL en Wayland con NVIDIA) y un fallo del proceso gráfico durante el
 * arranque se resuelve relanzando una vez sin GPU. Funciones puras, sin Electron.
 */
import { describe, expect, it } from 'vitest';
import { createRevealer, GPU_FALLBACK_FLAG, gpuCrashAction, gpuFallbackRelaunch, REVEAL_TIMEOUT_MS } from '../electron/lib/reveal.mjs';

/** Temporizador manual: guarda lo pedido y se dispara a mano. */
function fakeTimers() {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    setTimer: (callback: () => void, ms: number): number => {
      pending.set(next, { callback, ms });
      return next++;
    },
    clearTimer: (handle: unknown): void => void pending.delete(handle as number),
    fireAll: (): void => {
      for (const [id, t] of [...pending]) {
        pending.delete(id);
        t.callback();
      }
    },
  };
}

describe('revelador de la ventana', () => {
  it('muestra la ventana cuando vence el temporizador si nada más ocurre', () => {
    const timers = fakeTimers();
    let shown = 0;
    createRevealer({ show: () => shown++, ...timers });
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([REVEAL_TIMEOUT_MS]);
    expect(shown).toBe(0);
    timers.fireAll();
    expect(shown).toBe(1);
  });

  it('muestra una sola vez y cancela el temporizador cuando llega un evento antes', () => {
    const timers = fakeTimers();
    let shown = 0;
    const revealer = createRevealer({ show: () => shown++, ...timers });
    revealer.reveal();
    revealer.reveal();
    expect(shown).toBe(1);
    expect(timers.pending.size).toBe(0);
    timers.fireAll();
    expect(shown).toBe(1);
  });

  it('no muestra nada si la ventana se cerró antes', () => {
    const timers = fakeTimers();
    let shown = 0;
    const revealer = createRevealer({ show: () => shown++, ...timers });
    revealer.dispose();
    revealer.reveal();
    timers.fireAll();
    expect(shown).toBe(0);
    expect(timers.pending.size).toBe(0);
  });

  it('respeta un tiempo de espera propio', () => {
    const timers = fakeTimers();
    createRevealer({ show: () => undefined, timeoutMs: 250, ...timers });
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([250]);
  });

  it('con los temporizadores reales también muestra', async () => {
    let shown = 0;
    createRevealer({ show: () => shown++, timeoutMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(shown).toBe(1);
  });
});

describe('fallo del proceso gráfico', () => {
  const argv = ['/opt/Heritage Studio/heritage-studio', '--some-flag'];
  const crash = { type: 'GPU', reason: 'crashed' };

  it('durante el arranque, relanza una vez sin GPU', () => {
    expect(gpuCrashAction({ argv, details: crash, loaded: false })).toBe('relaunch');
    for (const reason of ['abnormal-exit', 'launch-failed', 'oom', 'integrity-failure']) expect(gpuCrashAction({ argv, details: { type: 'GPU', reason }, loaded: false })).toBe('relaunch');
  });

  it('si la instancia relanzada también falla, solo avisa', () => {
    expect(gpuCrashAction({ argv: [...argv, GPU_FALLBACK_FLAG], details: crash, loaded: false })).toBe('warn');
  });

  it('ignora lo que no es un fallo del arranque', () => {
    expect(gpuCrashAction({ argv, details: crash, loaded: true })).toBe('ignore');
    expect(gpuCrashAction({ argv, details: { type: 'GPU', reason: 'clean-exit' }, loaded: false })).toBe('ignore');
    expect(gpuCrashAction({ argv, details: { type: 'GPU', reason: 'killed' }, loaded: false })).toBe('ignore');
    expect(gpuCrashAction({ argv, details: { type: 'Utility', reason: 'crashed' }, loaded: false })).toBe('ignore');
    expect(gpuCrashAction({ argv: [...argv, GPU_FALLBACK_FLAG], details: { type: 'Zygote', reason: 'crashed' }, loaded: false })).toBe('ignore');
  });

  it('el relanzamiento conserva los argumentos y agrega los suyos una sola vez', () => {
    expect(gpuFallbackRelaunch(argv, {})).toEqual({ args: ['--some-flag', '--disable-gpu', GPU_FALLBACK_FLAG] });
    // Con los marcadores ya presentes no se duplican.
    expect(gpuFallbackRelaunch([...argv, '--disable-gpu', GPU_FALLBACK_FLAG], {}).args).toEqual(['--some-flag', '--disable-gpu', GPU_FALLBACK_FLAG]);
  });

  it('dentro de un AppImage se relanza el archivo .AppImage y no el montaje temporal', () => {
    expect(gpuFallbackRelaunch(argv, { APPIMAGE: '/home/yo/heritage-studio.AppImage' })).toEqual({
      args: ['--some-flag', '--disable-gpu', GPU_FALLBACK_FLAG],
      execPath: '/home/yo/heritage-studio.AppImage',
    });
    expect(gpuFallbackRelaunch(argv, { APPIMAGE: '' })).not.toHaveProperty('execPath');
  });
});
