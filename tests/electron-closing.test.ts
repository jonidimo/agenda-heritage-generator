/** Cerrar la ventana esperando a que la página termine de guardar, sin colgarse nunca. Sin Electron. */
import { describe, expect, it } from 'vitest';
import { createCloseGuard, FLUSH_TIMEOUT_MS } from '../electron/lib/closing.mjs';

const event = () => {
  const e = { prevented: 0, preventDefault: () => void e.prevented++ };
  return e;
};

function timers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    setTimer: (cb: () => void): number => (pending.set(next, cb), next++),
    clearTimer: (h: unknown): void => void pending.delete(h as number),
    fireAll: (): void => {
      for (const [id, cb] of [...pending]) {
        pending.delete(id);
        cb();
      }
    },
    count: (): number => pending.size,
  };
}

describe('cerrar la ventana', () => {
  it('se retiene el cierre, se espera el guardado y recién entonces se cierra', async () => {
    const t = timers();
    let release!: () => void;
    const flushing = new Promise<void>((r) => (release = r));
    let destroyed = 0;
    const guard = createCloseGuard({ flush: () => flushing, destroy: () => void destroyed++, ...t });
    const e = event();
    guard.onClose(e);
    expect(e.prevented).toBe(1);
    expect(destroyed).toBe(0);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(destroyed).toBe(1);
    expect(t.count()).toBe(0);
    // El cierre que provoca `destroy` pasa sin retenerse.
    const again = event();
    guard.onClose(again);
    expect(again.prevented).toBe(0);
  });

  it('si la página no responde, se cierra igual al vencer el tiempo', () => {
    const t = timers();
    let destroyed = 0;
    const guard = createCloseGuard({ flush: () => new Promise<void>(() => undefined), destroy: () => void destroyed++, ...t });
    guard.onClose(event());
    expect(destroyed).toBe(0);
    t.fireAll();
    expect(destroyed).toBe(1);
    expect(FLUSH_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('si guardar falla, también se cierra; y varios pedidos de cierre seguidos cierran una sola vez', async () => {
    const t = timers();
    let destroyed = 0;
    const guard = createCloseGuard({ flush: () => Promise.reject(new Error('sin espacio')), destroy: () => void destroyed++, ...t });
    const a = event();
    const b = event();
    guard.onClose(a);
    guard.onClose(b);
    expect(a.prevented + b.prevented).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(destroyed).toBe(1);
  });
});
