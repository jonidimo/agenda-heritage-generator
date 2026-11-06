/**
 * The live link: lets an AI client (the MCP server) work on the planner that is open in the desktop
 * app, instead of on a file. It is plain Node (no Electron), so the app, the MCP server and the tests
 * share this one file.
 *
 *   MCP server ──(NDJSON over a local socket / named pipe)──▶ broker (app main process)
 *                                                               └─▶ the page, through `executeJavaScript`
 *
 * Rules:
 *  - The socket is local-only (a Unix socket with mode 0600, or a Windows named pipe), and every
 *    connection must say hello with a token that only exists in a 0600 file in the app's data folder
 *    (`live.json`), made anew at every start. Nothing listens on the network.
 *  - Frames are one JSON object per line, capped in size. A broken or oversized frame closes the connection.
 *  - The broker never interprets the methods: it forwards the ones it knows to a handler and returns
 *    the answer. The page decides what each one does (and whether the user allowed it).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const LIVE_PROTOCOL = 1;
/** Largest frame (one JSON line): a planner with its images embedded can be tens of megabytes. */
export const MAX_FRAME_BYTES = 64 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 30_000;
export const CONNECT_TIMEOUT_MS = 3_000;
/** Before saying hello a connection may send little, for a short time; and only so many may be open. */
export const HELLO_DEADLINE_MS = 5_000;
export const HELLO_MAX_BYTES = 4096;
export const MAX_CONNECTIONS = 8;
/** Responses carry whole planners with their images (base64): the client accepts more than the app does of a request. */
export const MAX_RESPONSE_BYTES = 256 * 1024 * 1024;
export const LIVE_INFO_FILE = 'live.json';
/** Environment variable that points to a `live.json` (to use another app instance, or in tests). */
export const LIVE_LINK_ENV = 'AGENDA_APP_LINK';
/** Longest socket path that fits on macOS (104) and Linux (108) with some margin. */
const MAX_SOCKET_PATH = 100;

/** What a client can ask the page for. Anything else is refused by the broker. */
export const LIVE_METHODS = Object.freeze(['design.info', 'design.get', 'design.patch', 'view.reveal', 'library.list', 'design.open', 'design.load']);

/** JSON-RPC-style error codes. */
export const LIVE_ERRORS = Object.freeze({
  /** The page refused or failed. */
  app: -32000,
  unauthorized: -32001,
  timeout: -32002,
  unavailable: -32003,
  badRequest: -32600,
  unknownMethod: -32601,
});

/** @typedef {{ id: number | string, method: string, params?: unknown }} LiveRequest */
/** @typedef {{ id: number | string | null, result?: unknown, error?: { code: number, message: string } }} LiveResponse */
/** @typedef {(method: string, params: unknown) => Promise<unknown>} LiveHandler */

/* ---------- Where things are ---------- */

/**
 * Electron's `appData` folder without Electron (the MCP server may run as plain Node).
 * @param {Record<string, string | undefined>} env
 * @param {NodeJS.Platform} platform
 * @param {string} home
 */
export function appDataDir(env, platform, home) {
  if (platform === 'win32') return env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support');
  return env.XDG_CONFIG_HOME || path.posix.join(home, '.config');
}

/**
 * The data folders the desktop app may be using, most likely first: the installed app, then a development run.
 * @param {Record<string, string | undefined>} env
 * @param {NodeJS.Platform} platform
 * @param {string} home
 */
export function dataDirs(env, platform, home) {
  const base = appDataDir(env, platform, home);
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  return [join(base, 'Heritage Studio'), join(base, 'Heritage Studio (dev)')];
}

const shortHash = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Where the broker listens: a socket file in the data folder, or (if that path would be too long for a
 * socket) one in the temp folder named by a hash of it. On Windows, a named pipe.
 * @param {string} dataDir
 * @param {NodeJS.Platform} platform
 * @param {string} [tmp]
 */
export function liveEndpoint(dataDir, platform, tmp = os.tmpdir()) {
  if (platform === 'win32') return `\\\\.\\pipe\\heritage-studio-${shortHash(dataDir)}`;
  const inside = path.posix.join(dataDir, 'live.sock');
  return Buffer.byteLength(inside) <= MAX_SOCKET_PATH ? inside : path.posix.join(tmp, `heritage-studio-${shortHash(dataDir)}.sock`);
}

/** A fresh token (256 bits). */
export const newToken = () => randomBytes(32).toString('base64url');

/** @param {string} a @param {string} b */
function sameToken(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---------- Files ---------- */

/** @typedef {{ protocol: number, endpoint: string, token: string, pid: number, version: string }} LiveInfo */

/**
 * Writes `live.json` (mode 0600, atomically) for clients to find the broker.
 * @param {string} dataDir
 * @param {LiveInfo} info
 */
export async function writeLiveInfo(dataDir, info) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, LIVE_INFO_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(info)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}

/** @param {string} dataDir */
export async function removeLiveInfo(dataDir) {
  await rm(path.join(dataDir, LIVE_INFO_FILE), { force: true });
}

/**
 * Reads a `live.json`; `null` if there is none or it is not valid.
 *
 * Whether the app that wrote it is still running is NOT decided here: from a sandbox, a container or a
 * Flatpak the host's process ids are not visible (`process.kill(pid, 0)` fails with ESRCH even though
 * the app is open), so only a connection can tell. A file left by an app that crashed is harmless: its
 * endpoint does not answer and the connection fails at once (see `findLiveApps` and the MCP's opener).
 * @param {string} file
 * @returns {Promise<LiveInfo | null>}
 */
export async function readLiveInfo(file) {
  let raw;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { protocol, endpoint, token, pid, version } = /** @type {Record<string, unknown>} */ (raw);
  if (typeof protocol !== 'number' || typeof endpoint !== 'string' || endpoint === '' || typeof token !== 'string' || token === '' || typeof pid !== 'number') return null;
  return { protocol, endpoint, token, pid, version: typeof version === 'string' ? version : '' };
}

/**
 * Every `live.json` that could belong to a running app, in the order they should be tried: the file
 * named by `AGENDA_APP_LINK`, or the ones in the usual data folders. More than one can exist (a stale
 * file in one folder, the running app in another), so the caller tries to connect to each.
 * @param {{ env?: Record<string, string | undefined>, platform?: NodeJS.Platform, home?: string }} [where]
 * @returns {Promise<LiveInfo[]>}
 */
export async function findLiveApps(where = {}) {
  const env = where.env ?? process.env;
  const platform = where.platform ?? process.platform;
  const home = where.home ?? os.homedir();
  const files = env[LIVE_LINK_ENV] ? [env[LIVE_LINK_ENV]] : dataDirs(env, platform, home).map((dir) => path.join(dir, LIVE_INFO_FILE));
  /** @type {LiveInfo[]} */
  const out = [];
  for (const file of files) {
    const info = await readLiveInfo(file);
    if (info) out.push(info);
  }
  return out;
}

/**
 * The first `live.json` found (see `findLiveApps`), or `null`.
 * @param {{ env?: Record<string, string | undefined>, platform?: NodeJS.Platform, home?: string }} [where]
 */
export async function findLiveApp(where = {}) {
  return (await findLiveApps(where))[0] ?? null;
}

/* ---------- Frames ---------- */

/** One frame as a line. */
export const encodeFrame = (/** @type {unknown} */ value) => `${JSON.stringify(value)}\n`;

/**
 * Splits a byte stream into JSON frames (one per line; `\n` or `\r\n`; empty lines are ignored).
 * A frame that is not JSON, or a line longer than `maxBytes`, is reported through `onError` and
 * the parser stops: the caller closes the connection.
 * @param {{ onFrame: (frame: unknown) => void, onError: (kind: 'json' | 'too-large') => void, maxBytes?: number }} handlers
 */
export function createFrameParser({ onFrame, onError, maxBytes = MAX_FRAME_BYTES }) {
  /** @type {Buffer[]} */
  let parts = [];
  let size = 0;
  let stopped = false;
  let limit = maxBytes;
  /** @param {Buffer} line */
  const emit = (line) => {
    const text = line.toString('utf8').trim();
    if (text === '') return;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      stopped = true;
      onError('json');
      return;
    }
    onFrame(value);
  };
  return {
    /** @param {number} bytes */
    setMax(bytes) {
      limit = bytes;
    },
    /** @param {Buffer | string} chunk */
    push(chunk) {
      if (stopped) return;
      let data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      while (data.length > 0 && !stopped) {
        const at = data.indexOf(0x0a);
        if (at < 0) {
          parts.push(data);
          size += data.length;
          if (size > limit) {
            stopped = true;
            parts = [];
            onError('too-large');
          }
          return;
        }
        const line = Buffer.concat([...parts, data.subarray(0, at)]);
        parts = [];
        size = 0;
        data = data.subarray(at + 1);
        if (line.length > limit) {
          stopped = true;
          onError('too-large');
          return;
        }
        emit(line);
      }
    },
  };
}

/* ---------- Broker core (no sockets) ---------- */

/**
 * The rules of one connection: say hello first, then ask. Pure, so it is tested without sockets.
 * `accept` is called once per connection with a function that sends a response.
 * @param {{ token: string, handler: LiveHandler, timeoutMs?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} options
 */
export function createBrokerCore({ token, handler, timeoutMs = REQUEST_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return {
    /**
     * @param {(response: LiveResponse) => void} send
     * @param {() => void} close Closes this connection.
     */
    accept(send, close) {
      let authenticated = false;
      let closed = false;
      /** @param {LiveResponse} response */
      const reply = (response) => {
        if (!closed) send(response);
      };
      return {
        /** @param {unknown} frame */
        onFrame(frame) {
          if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
            reply({ id: null, error: { code: LIVE_ERRORS.badRequest, message: 'invalid request' } });
            return close();
          }
          const { id, method, params } = /** @type {Record<string, unknown>} */ (frame);
          if ((typeof id !== 'number' && typeof id !== 'string') || typeof method !== 'string') {
            reply({ id: null, error: { code: LIVE_ERRORS.badRequest, message: 'invalid request' } });
            return close();
          }
          if (method === 'hello') {
            const p = params && typeof params === 'object' ? /** @type {Record<string, unknown>} */ (params) : {};
            if (typeof p.token !== 'string' || !sameToken(p.token, token)) {
              reply({ id, error: { code: LIVE_ERRORS.unauthorized, message: 'unauthorized' } });
              return close();
            }
            if (p.protocol !== LIVE_PROTOCOL) {
              reply({ id, error: { code: LIVE_ERRORS.badRequest, message: `protocol ${LIVE_PROTOCOL} expected` } });
              return close();
            }
            authenticated = true;
            return reply({ id, result: { protocol: LIVE_PROTOCOL } });
          }
          if (!authenticated) {
            reply({ id, error: { code: LIVE_ERRORS.unauthorized, message: 'say hello first' } });
            return close();
          }
          if (method === 'ping') return reply({ id, result: 'pong' });
          if (!LIVE_METHODS.includes(method)) return reply({ id, error: { code: LIVE_ERRORS.unknownMethod, message: `unknown method ${method}` } });
          /** @type {ReturnType<typeof setTimeout> | undefined} */
          let timer;
          const timedOut = new Promise((_, reject) => {
            timer = setTimer(() => reject(Object.assign(new Error('the app did not answer in time'), { code: LIVE_ERRORS.timeout })), timeoutMs);
          });
          // `handler` may throw synchronously or reject; both end as an error response.
          Promise.race([Promise.resolve().then(() => handler(method, params)), timedOut]).then(
            (result) => reply({ id, result: result === undefined ? null : result }),
            (err) => reply({ id, error: { code: typeof err?.code === 'number' ? err.code : LIVE_ERRORS.app, message: err instanceof Error ? err.message : String(err) } }),
          ).finally(() => clearTimer(timer));
        },
        onClose() {
          closed = true;
        },
      };
    },
  };
}

/* ---------- Broker (sockets) ---------- */

/**
 * Listens on `endpoint` and serves the connections that know the token. Resolves once it is listening.
 * @param {{ endpoint: string, token: string, handler: LiveHandler, timeoutMs?: number, maxFrameBytes?: number }} options
 * @returns {Promise<{ close: () => Promise<void>, connections: () => number }>}
 */
export async function createLiveBroker({ endpoint, token, handler, timeoutMs, maxFrameBytes }) {
  const core = createBrokerCore({ token, handler, ...(timeoutMs ? { timeoutMs } : {}) });
  /** @type {Set<net.Socket>} */
  const sockets = new Set();
  const server = net.createServer((socket) => {
    if (sockets.size >= MAX_CONNECTIONS) return void socket.destroy();
    sockets.add(socket);
    socket.setNoDelay(true);
    // Whoever does not say hello soon is cut off; until then only a small frame is accepted.
    const deadline = setTimeout(() => socket.destroy(), HELLO_DEADLINE_MS);
    socket.once('close', () => clearTimeout(deadline));
    /** @type {ReturnType<typeof createFrameParser> | null} */
    let parser = null;
    const conn = core.accept(
      (response) => {
        if (response.result && typeof response.result === 'object' && /** @type {{ protocol?: unknown }} */ (response.result).protocol === LIVE_PROTOCOL) {
          clearTimeout(deadline);
          parser?.setMax(maxFrameBytes ?? MAX_FRAME_BYTES);
        }
        if (!socket.destroyed) socket.write(encodeFrame(response));
      },
      // End after the pending write, so the client reads the error that explains why.
      () => socket.end(),
    );
    parser = createFrameParser({
      onFrame: (frame) => conn.onFrame(frame),
      onError: () => {
        socket.destroy();
      },
      maxBytes: HELLO_MAX_BYTES,
    });
    socket.on('data', (chunk) => parser?.push(chunk));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      conn.onClose();
      sockets.delete(socket);
    });
  });

  /** @param {boolean} retry */
  const listen = (retry) =>
    new Promise((resolve, reject) => {
      server.once('error', async (/** @type {NodeJS.ErrnoException} */ err) => {
        if (err.code === 'EADDRINUSE' && retry && !endpoint.startsWith('\\\\')) {
          // A socket file left by a crash: if nobody answers on it, it is stale and is replaced.
          const alive = await new Promise((done) => {
            const probe = net.connect(endpoint);
            probe.once('connect', () => (probe.destroy(), done(true)));
            probe.once('error', () => done(false));
          });
          if (!alive) {
            await rm(endpoint, { force: true });
            return listen(false).then(resolve, reject);
          }
        }
        reject(err);
      });
      server.listen(endpoint, () => resolve(undefined));
    });
  await listen(true);
  // Only the owner may connect (a no-op on Windows pipes, which are protected by the token).
  if (!endpoint.startsWith('\\\\')) await chmod(endpoint, 0o600);

  return {
    connections: () => sockets.size,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      if (!endpoint.startsWith('\\\\')) await rm(endpoint, { force: true });
    },
  };
}

/* ---------- Client ---------- */

/** The page (or the app) answered with an error. */
export class LiveError extends Error {
  /** @param {string} message @param {number} code */
  constructor(message, code) {
    super(message);
    this.name = 'LiveError';
    this.code = code;
  }
}

/**
 * Connects to a running app and says hello. Rejects if nobody listens, the token is wrong or the
 * protocol differs.
 * @param {{ endpoint: string, token: string, connectTimeoutMs?: number, requestTimeoutMs?: number, maxFrameBytes?: number }} options
 */
export async function connectLive({ endpoint, token, connectTimeoutMs = CONNECT_TIMEOUT_MS, requestTimeoutMs = REQUEST_TIMEOUT_MS, maxFrameBytes }) {
  const socket = net.connect(endpoint);
  socket.setNoDelay(true);
  /** @type {Map<number | string, { resolve: (v: unknown) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
  const pending = new Map();
  let nextId = 1;
  let ended = false;
  /** @param {Error} err */
  const failAll = (err) => {
    ended = true;
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };
  const parser = createFrameParser({
    onFrame: (frame) => {
      const { id, result, error } = /** @type {LiveResponse} */ (frame);
      const p = id === null || id === undefined ? undefined : pending.get(id);
      if (!p || id === null || id === undefined) return;
      pending.delete(id);
      clearTimeout(p.timer);
      if (error) p.reject(new LiveError(error.message, error.code));
      else p.resolve(result);
    },
    onError: () => {
      failAll(new LiveError('the app sent something that is not valid', LIVE_ERRORS.badRequest));
      socket.destroy();
    },
    maxBytes: maxFrameBytes ?? MAX_RESPONSE_BYTES,
  });
  socket.on('data', (chunk) => parser.push(chunk));
  socket.on('error', (err) => failAll(new LiveError(`cannot reach the app: ${err.message}`, LIVE_ERRORS.unavailable)));
  socket.on('close', () => failAll(new LiveError('the app closed the connection', LIVE_ERRORS.unavailable)));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => (socket.destroy(), reject(new LiveError('the app did not answer', LIVE_ERRORS.timeout))), connectTimeoutMs);
    socket.once('connect', () => (clearTimeout(timer), resolve(undefined)));
    socket.once('error', (err) => (clearTimeout(timer), reject(new LiveError(`cannot reach the app: ${err.message}`, LIVE_ERRORS.unavailable))));
  });

  /**
   * @param {string} method @param {unknown} [params] @param {number} [timeoutMs]
   * @returns {Promise<unknown>}
   */
  const request = (method, params, timeoutMs = requestTimeoutMs) =>
    new Promise((resolve, reject) => {
      if (ended || socket.destroyed) return reject(new LiveError('the connection to the app is closed', LIVE_ERRORS.unavailable));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new LiveError('the app did not answer in time', LIVE_ERRORS.timeout));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.write(encodeFrame({ id, method, params }));
    });

  try {
    await request('hello', { token, protocol: LIVE_PROTOCOL });
  } catch (err) {
    socket.destroy();
    throw err;
  }
  // The link never keeps its process alive: a server that is done must be able to exit.
  socket.unref();
  return { request, close: () => socket.destroy() };
}
