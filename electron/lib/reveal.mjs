/**
 * Showing the main window, and what to do when the graphics process fails.
 *
 * The window is created hidden (`show: false`) so the user never sees a blank frame, and it is
 * normally shown on `ready-to-show`. That event comes from the compositor: when the graphics
 * stack cannot start (for example EGL failing on Wayland with some NVIDIA drivers) it never
 * arrives, and the app keeps running with no window at all. So the window is shown by whichever
 * comes first: `ready-to-show`, the page finishing (or failing) to load, or a timer.
 *
 * Pure functions with injected timers, so they are tested without Electron.
 */

/** How long to wait for the first frame before showing the window anyway. */
export const REVEAL_TIMEOUT_MS = 3000;

/** Marks the instance that was relaunched with the GPU off, so it is relaunched only once. */
export const GPU_FALLBACK_FLAG = '--gpu-fallback';

/** Chromium switch that turns graphics acceleration off. */
const DISABLE_GPU_FLAG = '--disable-gpu';

/** Ways a process ends that are not a failure (the app closing it, or the system). */
const BENIGN_EXITS = new Set(['clean-exit', 'killed']);

/**
 * @typedef {object} Revealer
 * @property {() => void} reveal Shows the window, once; later calls do nothing.
 * @property {() => void} dispose Cancels the timer (the window was closed first).
 */

/**
 * @param {object} options
 * @param {() => void} options.show Shows the window.
 * @param {number} [options.timeoutMs]
 * @param {(callback: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 * @returns {Revealer}
 */
export function createRevealer({ show, timeoutMs = REVEAL_TIMEOUT_MS, setTimer = setTimeout, clearTimer = (handle) => clearTimeout(/** @type {NodeJS.Timeout} */ (handle)) }) {
  let done = false;
  /** @type {unknown} */
  let timer = null;
  const stop = () => {
    done = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const reveal = () => {
    if (done) return;
    stop();
    show();
  };
  timer = setTimer(reveal, timeoutMs);
  return { reveal, dispose: stop };
}

/**
 * @typedef {'ignore' | 'relaunch' | 'warn'} GpuAction
 */

/**
 * What to do when a child process of the app is gone.
 *
 * - Not the graphics process, or it was closed normally: nothing.
 * - The window is already loaded: nothing. During a session Chromium restarts the graphics
 *   process by itself, and falls back to software drawing if it keeps failing; restarting the
 *   whole app would only lose the user's place.
 * - It failed while starting: restart once with the GPU off. If that instance fails too, warn.
 *
 * @param {object} input
 * @param {readonly string[]} input.argv The command line of this instance (`process.argv`).
 * @param {{ type: string, reason: string }} input.details As received from `child-process-gone`.
 * @param {boolean} input.loaded Whether the window has already loaded its page.
 * @returns {GpuAction}
 */
export function gpuCrashAction({ argv, details, loaded }) {
  if (details.type !== 'GPU' || BENIGN_EXITS.has(details.reason) || loaded) return 'ignore';
  return argv.includes(GPU_FALLBACK_FLAG) ? 'warn' : 'relaunch';
}

/**
 * Options for `app.relaunch`: the current command line (without the executable) plus the flags
 * that turn the GPU off and mark the instance.
 *
 * Inside an AppImage the running executable lives in a temporary mount that disappears when the
 * process exits, so the relaunch must start the `.AppImage` file itself; its runtime tells us
 * where it is in `APPIMAGE`.
 *
 * @param {readonly string[]} argv `process.argv`
 * @param {Readonly<Record<string, string | undefined>>} env `process.env`
 * @returns {{ args: string[], execPath?: string }}
 */
export function gpuFallbackRelaunch(argv, env) {
  const rest = argv.slice(1).filter((arg) => arg !== DISABLE_GPU_FLAG && arg !== GPU_FALLBACK_FLAG);
  const args = [...rest, DISABLE_GPU_FLAG, GPU_FALLBACK_FLAG];
  return env.APPIMAGE ? { args, execPath: env.APPIMAGE } : { args };
}
