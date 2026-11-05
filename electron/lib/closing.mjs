/**
 * Closing the window without losing the last change.
 *
 * The page saves every edit to its library a moment after it is made, and again when it is hidden or
 * unloaded; but a write that is still in flight when the window is destroyed can be lost. So closing
 * is held back once: the page is asked to finish its pending save (it exposes `__heritageFlush`) and the
 * window is closed when that is done, or after a timeout so a stuck page can never keep the app open.
 *
 * Pure, with injected timers, so it is tested without Electron.
 */

/** Longest the window waits for the page to finish saving. */
export const FLUSH_TIMEOUT_MS = 3000;

/**
 * @param {object} options
 * @param {() => Promise<unknown>} options.flush Asks the page to finish its pending save.
 * @param {() => void} options.destroy Really closes the window.
 * @param {number} [options.timeoutMs]
 * @param {(callback: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 * @returns {{ onClose: (event: { preventDefault(): void }) => void }}
 */
export function createCloseGuard({ flush, destroy, timeoutMs = FLUSH_TIMEOUT_MS, setTimer = setTimeout, clearTimer = (handle) => clearTimeout(/** @type {NodeJS.Timeout} */ (handle)) }) {
  /** @type {'open' | 'flushing' | 'done'} */
  let state = 'open';
  return {
    onClose(event) {
      // The second `close` (the one `destroy` causes) goes through.
      if (state === 'done') return;
      event.preventDefault();
      if (state === 'flushing') return;
      state = 'flushing';
      let finished = false;
      /** @type {unknown} */
      let timer = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer !== null) clearTimer(timer);
        state = 'done';
        destroy();
      };
      timer = setTimer(finish, timeoutMs);
      // A page that fails to answer (crashed, not loaded yet) must not keep the window open.
      void Promise.resolve()
        .then(flush)
        .catch(() => undefined)
        .then(finish);
    },
  };
}
