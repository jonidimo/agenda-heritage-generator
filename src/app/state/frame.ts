/**
 * Entrega valores como mucho una vez por cuadro de animación: un control que se arrastra dispara
 * decenas de eventos por segundo, pero la pantalla solo puede mostrar uno por cuadro; el resto
 * se descarta y siempre llega el último.
 */

/** Cómo se pide el próximo cuadro (en el navegador, `requestAnimationFrame`; en las pruebas, uno falso). */
export interface FrameClock {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export const browserClock: FrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export interface FrameThrottle<T> {
  /** Anota el valor; se entregará en el próximo cuadro (el último que se haya anotado hasta entonces). */
  push(value: T): void;
  /** Entrega ya lo pendiente, si hay algo. */
  flush(): void;
  /** Descarta lo pendiente. */
  cancel(): void;
}

export function frameThrottle<T>(deliver: (value: T) => void, clock: FrameClock = browserClock): FrameThrottle<T> {
  let pending: { value: T } | null = null;
  let handle: number | null = null;
  const release = (): void => {
    if (handle !== null) clock.cancel(handle);
    handle = null;
  };
  const flush = (): void => {
    release();
    const next = pending;
    pending = null;
    if (next) deliver(next.value);
  };
  return {
    push(value) {
      pending = { value };
      handle ??= clock.request(flush);
    },
    flush,
    cancel() {
      release();
      pending = null;
    },
  };
}
