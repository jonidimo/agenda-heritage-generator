/**
 * What the app has saved to disk, so the page can show where a PDF went and offer "Open folder".
 *
 * The page runs in a sandboxed renderer with no access to the file system, and a download started
 * with a blob URL ends in Electron's native "Save as" dialog: the page never learns the path. The
 * main process watches the downloads (`will-download`), records each one here when it ends, and the
 * page asks for them through `app://heritage/_sys/*`. Only a path recorded here can be opened or
 * shown in its folder: the page can never ask for an arbitrary file.
 *
 * Pure, with injected timers, so it is tested without Electron.
 */

/** Longest a page may wait for a download to end. */
export const MAX_WAIT_MS = 120_000;

/** How many finished downloads are remembered. */
export const MAX_KEPT = 20;

/**
 * @typedef {'progressing' | 'completed' | 'cancelled' | 'interrupted'} DownloadState
 * @typedef {object} DownloadItem
 * @property {number} id
 * @property {string} name
 * @property {string | null} path Where it was saved (only when completed).
 * @property {DownloadState} state
 * @property {number} at When it started (ms since the epoch).
 */

export class DownloadLog {
  /**
   * @param {object} [options]
   * @param {() => number} [options.now]
   * @param {(callback: () => void, ms: number) => unknown} [options.setTimer]
   * @param {(handle: unknown) => void} [options.clearTimer]
   */
  constructor({ now = Date.now, setTimer = setTimeout, clearTimer = (handle) => clearTimeout(/** @type {NodeJS.Timeout} */ (handle)) } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    /** @type {DownloadItem[]} */
    this.items = [];
    this.lastId = 0;
    /** @type {Set<() => void>} */
    this.waiters = new Set();
  }

  /**
   * A download started.
   * @param {string} name
   * @returns {number} Its id.
   */
  start(name) {
    const id = ++this.lastId;
    this.items.push({ id, name, path: null, state: 'progressing', at: this.now() });
    this.#trim();
    return id;
  }

  /**
   * A download ended.
   * @param {number} id
   * @param {Exclude<DownloadState, 'progressing'>} state
   * @param {string | null} path
   */
  finish(id, state, path) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return;
    item.state = state;
    item.path = state === 'completed' ? path : null;
    this.#trim();
    for (const wake of [...this.waiters]) wake();
  }

  /** The downloads that ended after `afterId`, oldest first. @param {number} afterId */
  endedAfter(afterId) {
    return this.items.filter((x) => x.id > afterId && x.state !== 'progressing');
  }

  /**
   * Resolves with the downloads that ended after `afterId` as soon as there is one, or with none when
   * `waitMs` runs out.
   * @param {number} afterId
   * @param {number} waitMs
   * @returns {Promise<DownloadItem[]>}
   */
  wait(afterId, waitMs) {
    const ready = this.endedAfter(afterId);
    const ms = Math.max(0, Math.min(MAX_WAIT_MS, Number.isFinite(waitMs) ? waitMs : 0));
    if (ready.length > 0 || ms === 0) return Promise.resolve(ready);
    return new Promise((resolve) => {
      /** @type {unknown} */
      let timer = null;
      const settle = () => {
        this.waiters.delete(check);
        if (timer !== null) this.clearTimer(timer);
        resolve(this.endedAfter(afterId));
      };
      const check = () => {
        if (this.endedAfter(afterId).length > 0) settle();
      };
      this.waiters.add(check);
      timer = this.setTimer(settle, ms);
    });
  }

  /**
   * Whether `path` is exactly where a completed download was saved.
   * @param {string} path
   */
  hasSaved(path) {
    return typeof path === 'string' && this.items.some((x) => x.state === 'completed' && x.path === path);
  }

  #trim() {
    const ended = this.items.filter((x) => x.state !== 'progressing');
    if (ended.length <= MAX_KEPT) return;
    const drop = new Set(ended.slice(0, ended.length - MAX_KEPT).map((x) => x.id));
    this.items = this.items.filter((x) => !drop.has(x.id));
  }
}

/** The origin of the app's own page. */
export const APP_ORIGIN = 'app://heritage';

/**
 * Whether a request to a `_sys` route may be served. Requests for a custom scheme reach the main
 * process without `Origin`, `Referer` or `Sec-Fetch-*` headers, so the page itself cannot be told
 * apart from a request that has none: what protects the routes is that nothing but the app's own page
 * runs on this scheme (every other navigation is blocked) and that only paths the app saved can be
 * opened. If a request does say where it comes from, it must be from the app's own origin.
 * @param {string | null} origin The `Origin` header.
 * @param {string | null} site The `Sec-Fetch-Site` header.
 */
export function sysRequestAllowed(origin, site) {
  if (origin !== null && origin !== APP_ORIGIN) return false;
  return site === null || site === 'same-origin' || site === 'none';
}

/**
 * The route of a `_sys` URL, or `null` when it is not one of them.
 * @param {string} pathname
 * @returns {'downloads' | 'reveal' | 'open' | 'open-planner' | 'ai-config' | 'ai-chat' | null}
 */
export function sysRoute(pathname) {
  switch (pathname) {
    case '/_sys/ai/config':
      return 'ai-config';
    case '/_sys/ai/chat':
      return 'ai-chat';
    case '/_sys/downloads':
      return 'downloads';
    case '/_sys/reveal':
      return 'reveal';
    case '/_sys/open':
      return 'open';
    case '/_sys/open-planner':
      return 'open-planner';
    default:
      return null;
  }
}
