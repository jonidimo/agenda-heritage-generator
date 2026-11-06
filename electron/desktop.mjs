/**
 * Heritage Studio: Electron main process.
 *
 * The web build in dist/ is served through a privileged custom scheme (app://heritage/), so the
 * app always runs from the same secure origin: fetch, module workers, IndexedDB and localStorage
 * behave as on the website and saved planners persist across launches. The page runs in a fully
 * sandboxed renderer, without a preload script or Node.js.
 */
import { rmSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, Menu, net, protocol, safeStorage, screen, session, shell } from 'electron';
import { AiSettingsStore, AUTH, aiTargetAllowed, cleanBaseUrl, isProviderId, KEY_PATTERN, MAX_KEY_LENGTH, parseChatRequest } from './lib/ai.mjs';
import { agendaFileFromArgv, MAX_OPEN_BYTES } from './lib/args.mjs';
import { inlineAssetPaths } from './lib/assets.mjs';
import { createCloseGuard } from './lib/closing.mjs';
import { DownloadLog, sysRequestAllowed, sysRoute } from './lib/downloads.mjs';
import { createLiveBroker, LIVE_ERRORS, LIVE_INFO_FILE, LIVE_PROTOCOL, liveEndpoint, newToken, writeLiveInfo } from './lib/live.mjs';
import { createRevealer, gpuCrashAction, gpuFallbackRelaunch } from './lib/reveal.mjs';

const APP_NAME = 'Heritage Studio';
const APP_ID = 'io.github.jonidimo.heritagestudio';
const SCHEME = 'app';
const HOST = 'heritage';
const APP_URL = `${SCHEME}://${HOST}/`;
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const isDev = !app.isPackaged;

app.setName(APP_NAME);
// Fixed data folder (IndexedDB, localStorage). `npm run desktop` uses a separate one, so a
// development run never touches real planners or collides with the installed app's
// single-instance lock.
app.setPath('userData', path.join(app.getPath('appData'), isDev ? `${APP_NAME} (dev)` : APP_NAME));
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// Must happen before the `ready` event.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

/** @param {unknown} data @param {number} [status] */
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });

/** What was saved to disk from the page (PDFs), so it can say where and open them. */
const downloads = new DownloadLog();

/**
 * app://heritage/_sys/*: what the sandboxed page cannot do by itself. It learns where a download ended
 * up, and can open that file or show its folder; only paths the app itself saved, never an arbitrary one.
 * @param {Request} request
 */
async function sys(request) {
  const url = new URL(request.url);
  const route = sysRoute(url.pathname);
  if (!route) return notFound();
  if (!sysRequestAllowed(request.headers.get('origin'), request.headers.get('sec-fetch-site'))) return json({ error: 'forbidden' }, 403);
  if (route === 'ai-config') return aiConfig(request);
  if (route === 'ai-chat') return aiChat(request);
  if (route === 'downloads') {
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    const after = Number.parseInt(url.searchParams.get('after') ?? '0', 10) || 0;
    const wait = Number.parseInt(url.searchParams.get('wait') ?? '0', 10) || 0;
    const items = await downloads.wait(after, wait);
    return json({ seq: downloads.lastId, items });
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  /** @type {unknown} */
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body' }, 400);
  }
  const file = body && typeof body === 'object' ? /** @type {{ path?: unknown }} */ (body).path : undefined;
  if (typeof file !== 'string' || !downloads.hasSaved(file)) return json({ error: 'unknown file' }, 403);
  if (!(await stat(file).catch(() => null))) return json({ error: 'missing' }, 404);
  if (route === 'reveal') {
    shell.showItemInFolder(file);
    return json({ ok: true });
  }
  // Only documents are opened: a file renamed to .exe or .bat in "Save as" is shown in its folder, never run.
  if (!/\.(pdf|json)$/i.test(file)) return json({ ok: false, error: 'not a document' }, 403);
  const error = await shell.openPath(file);
  return json({ ok: error === '', error });
}

/* ---------- The AI assistant: keys in the main process, requests through it ---------- */

/** A conversation with images can be a few MB; nothing the assistant sends is bigger than this. */
const AI_MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const AI_TIMEOUT_MS = 120_000;

/** @type {AiSettingsStore | null} */
let aiStore = null;
const ai = () => (aiStore ??= new AiSettingsStore({ file: path.join(app.getPath('userData'), 'ai.json'), fs: fsp, safeStorage }));

/** @param {Request} request @returns {Promise<unknown>} */
async function readJsonBody(request) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > AI_MAX_REQUEST_BYTES) throw new Error('too large');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * GET: whether there is a key for each provider (never the key) and how keys are protected.
 * PUT `{ keys?: { [provider]: string | null }, baseUrls?: { [provider]: string } }`: saves keys (encrypted)
 * and the addresses the person set; without a keyring, a key is kept in memory only (never written in clear).
 * @param {Request} request
 */
async function aiConfig(request) {
  if (request.method === 'GET') return json(await ai().status());
  if (request.method !== 'PUT') return json({ error: 'method' }, 405);
  /** @type {unknown} */
  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ error: 'body' }, 400);
  }
  const b = body && typeof body === 'object' ? /** @type {{ keys?: unknown, baseUrls?: unknown }} */ (body) : {};
  if (b.baseUrls && typeof b.baseUrls === 'object') {
    for (const [p, v] of Object.entries(b.baseUrls)) {
      const clean = cleanBaseUrl(v);
      if (!isProviderId(p) || clean === null) return json({ error: 'baseUrl' }, 400);
      await ai().setBaseUrl(p, clean);
    }
  }
  if (b.keys && typeof b.keys === 'object') {
    for (const [p, v] of Object.entries(b.keys)) {
      const key = typeof v === 'string' ? v.replace(/\s+/g, '') : v;
      if (!isProviderId(p) || (key !== null && (typeof key !== 'string' || key.length > MAX_KEY_LENGTH || (key !== '' && !KEY_PATTERN.test(key))))) return json({ error: 'key' }, 400);
      await ai().setKey(p, key);
    }
  }
  return json(await ai().status());
}

/**
 * POST `{ provider, url, method, headers, body? }`: sends the page's request to the provider with the
 * saved key, only to that provider's hosts or to the address saved for it, and passes the answer back as
 * it came (status included). Nothing of the request or the answer is logged.
 * @param {Request} request
 */
async function aiChat(request) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  /** @type {unknown} */
  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ error: { message: 'Pedido no válido.' } }, 400);
  }
  const req = parseChatRequest(body);
  if (!req.ok) return json({ error: { message: `Pedido no válido (${req.error}).` } }, 400);
  // `x-heritage-error` tells the page what failed here (not at the provider): it is not the provider's answer.
  if (!aiTargetAllowed(req.provider, req.url, await ai().baseUrl(req.provider))) return json({ error: { message: 'Esa dirección no es la del proveedor ni la que se guardó en los ajustes.' } }, 403, { 'x-heritage-error': 'target' });
  const key = await ai().getKey(req.provider);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.url).hostname);
  if (!key && !local) return json({ error: { message: 'Falta la clave de API.' } }, 401);
  const auth = AUTH[req.provider];
  const headers = { ...req.headers, ...(key ? { [auth.header]: `${auth.prefix}${key}` } : {}) };
  let upstream;
  try {
    // Never follow a redirect: the key would travel to wherever it points.
    // «Detener» in the page cancels the upstream request too (when Electron passes the cancellation on).
    const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]) : AbortSignal.timeout(AI_TIMEOUT_MS);
    upstream = await net.fetch(req.url, { method: req.method, headers, ...(req.payload !== undefined ? { body: req.payload } : {}), redirect: 'error', signal });
  } catch (err) {
    const timeout = /** @type {{ name?: string }} */ (err).name === 'TimeoutError';
    // A fixed text: the network error could repeat request details (a header value is the key).
    return json({ error: { message: timeout ? 'El proveedor no contestó a tiempo.' : 'No se pudo conectar con el proveedor (sin red, la dirección no existe o un certificado no es válido).' } }, timeout ? 504 : 502, { 'x-heritage-error': timeout ? 'timeout' : 'network' });
  }
  const out = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
  const retry = upstream.headers.get('retry-after');
  if (retry) out.set('retry-after', retry);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/**
 * Serves app://heritage/<path> from dist/, never from outside it.
 * @param {Request} request
 */
async function serve(request) {
  const { host, pathname } = new URL(request.url);
  if (host !== HOST) return notFound();
  if (pathname.startsWith('/_sys/')) return sys(request);
  // The PWA service worker is for the website (offline cache); here every file is already local.
  // An empty registerSW.js registers nothing, and sw.js is not served, so nothing can register it.
  if (pathname === '/registerSW.js') return new Response('', { headers: { 'content-type': 'text/javascript' } });
  if (pathname === '/sw.js') return notFound();
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return notFound();
  }
  if (rel === '/') rel = '/index.html';
  const file = path.join(DIST, rel);
  const inside = path.relative(DIST, file);
  if (rel.includes('\0') || !inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return notFound();
  // A real 404 (not a network error) for missing files: the app treats a missing holidays/<country>.json as "no data".
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return notFound();
  return net.fetch(pathToFileURL(file).toString());
}

/** @param {string} url */
function isAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === `${SCHEME}:` && u.host === HOST;
  } catch {
    return false;
  }
}

/** @param {string} url */
function openIfWeb(url) {
  try {
    const { protocol: p } = new URL(url);
    if (p === 'http:' || p === 'https:') void shell.openExternal(url);
  } catch {
    /* not a URL */
  }
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];
  if (mac) template.push({ role: 'appMenu' });
  template.push({
    label: 'Edit',
    submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  });
  if (isDev) template.push({ label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] });
  if (mac) template.push({ role: 'windowMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** A planner file asked for before the page was ready (double click, "Open with…", macOS open-file). */
let pendingOpen = agendaFileFromArgv(process.argv);

/**
 * Opens a planner file in the page. The page exposes `__heritageOpen(text, name)`; the text travels as a
 * JSON string literal, so nothing in the file can run as code.
 * @param {string} file
 */
async function openPlannerFile(file) {
  const win = mainWindow;
  if (!win || win.isDestroyed() || !loaded) {
    pendingOpen = file;
    return;
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size > MAX_OPEN_BYTES) {
    dialog.showErrorBox(APP_NAME, `Could not open ${file}.`);
    return;
  }
  // Images saved next to the file (by relative path) travel inside it: the page cannot read that folder.
  const { text } = await inlineAssetPaths(await readFile(file, 'utf8'), path.dirname(file), { realpath: fsp.realpath, open: fsp.open });
  app.addRecentDocument(file);
  await win.webContents.executeJavaScript(`window.__heritageOpen && window.__heritageOpen(${JSON.stringify(text)}, ${JSON.stringify(path.basename(file))})`);
  if (win.isMinimized()) win.restore();
  win.focus();
}

/** Opens a file; a failure (unreadable file, page reloading) is told to the user, never left unhandled. @param {string} file */
function safeOpen(file) {
  openPlannerFile(file).catch(() => dialog.showErrorBox(APP_NAME, `Could not open ${file}.`));
}

// macOS delivers the file through this event (also before the app is ready).
app.on('open-file', (event, file) => {
  event.preventDefault();
  safeOpen(file);
});

/**
 * The live link with an AI client (see lib/live.mjs): the MCP server connects to a local socket and its
 * requests are answered by the page, which owns the open planner and the user's permission.
 * @param {string} method
 * @param {unknown} params
 */
async function liveHandler(method, params) {
  const win = mainWindow;
  const unavailable = () => Object.assign(new Error('The app window is not ready.'), { code: LIVE_ERRORS.unavailable });
  if (!win || win.isDestroyed() || win.webContents.isDestroyed() || !loaded) throw unavailable();
  // The request travels as a JSON string literal: nothing in it can run as code.
  const answer = await win.webContents.executeJavaScript(`window.__heritageLive ? window.__heritageLive(${JSON.stringify({ method, params })}) : null`);
  if (!answer || typeof answer !== 'object') throw unavailable();
  if (answer.ok) return answer.result;
  throw Object.assign(new Error(String(answer.message)), { code: typeof answer.code === 'number' ? answer.code : LIVE_ERRORS.app });
}

/** @type {{ close: () => Promise<void> } | null} */
let liveBroker = null;
const liveEndpointPath = () => liveEndpoint(app.getPath('userData'), process.platform);

async function startLive() {
  const dataDir = app.getPath('userData');
  const endpoint = liveEndpointPath();
  const token = newToken();
  try {
    liveBroker = await createLiveBroker({ endpoint, token, handler: liveHandler });
    await writeLiveInfo(dataDir, { protocol: LIVE_PROTOCOL, endpoint, token, pid: process.pid, version: app.getVersion() });
  } catch (err) {
    // The link is an extra: the app works without it.
    console.error(`Live link unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.on('will-quit', () => {
  // A second launch (it quits at once) must not remove the files of the instance that is running.
  if (!liveBroker) return;
  void liveBroker.close();
  // Synchronous too, since the process may exit before the asynchronous close finishes.
  try {
    rmSync(path.join(app.getPath('userData'), LIVE_INFO_FILE), { force: true });
    if (!liveEndpointPath().startsWith('\\\\')) rmSync(liveEndpointPath(), { force: true });
  } catch {
    /* already gone */
  }
});

/** The app is quitting (not just one window closing). */
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});

/** Whether the page has finished loading once: from then on the startup is over. */
let loaded = false;

const GPU_FAILED_MESSAGE =
  'The graphics process failed to start, even with graphics acceleration turned off.\n' +
  'Update your graphics drivers or, on Linux with Wayland, start the app with --ozone-platform=x11.';

function createWindow() {
  // A new window has not loaded its page yet (macOS reopens windows without quitting).
  loaded = false;
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1400, area.width),
    height: Math.min(900, area.height),
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#f7f5ef',
    autoHideMenuBar: true,
    show: false,
    // Windows and macOS take the icon from the executable / app bundle.
    ...(process.platform === 'linux' ? { icon: path.join(DIST, 'icons', 'icon-512.png') } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Without this, on Linux Electron downloads spelling dictionaries from Google: the app
      // stays fully offline instead.
      spellcheck: false,
    },
  });
  mainWindow = win;
  // `ready-to-show` depends on the graphics stack and may never arrive (see lib/reveal.mjs), so
  // the window is shown by whichever comes first: that event, the page loading, or a timer.
  const revealer = createRevealer({
    show: () => {
      if (!win.isDestroyed()) win.show();
    },
  });
  win.once('ready-to-show', revealer.reveal);
  win.webContents.once('did-finish-load', () => {
    loaded = true;
    revealer.reveal();
    if (pendingOpen) {
      const file = pendingOpen;
      pendingOpen = null;
      safeOpen(file);
    }
  });
  win.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) revealer.reveal();
  });
  // Closing waits (briefly) for the page to finish saving its last change.
  const closing = createCloseGuard({
    flush: () => (win.webContents.isDestroyed() ? Promise.resolve() : win.webContents.executeJavaScript('window.__heritageFlush ? window.__heritageFlush() : null')),
    destroy: () => {
      if (!win.isDestroyed()) win.destroy();
      // Holding the close back also held back a quit (Cmd+Q): pick it up again.
      if (quitting) app.quit();
    },
  });
  win.on('close', (event) => closing.onClose(event));
  win.on('closed', () => {
    revealer.dispose();
    mainWindow = null;
  });
  void win.loadURL(APP_URL);
}

let gpuWarned = false;

/**
 * The graphics process failed while the app was starting: restart once with the GPU off, and
 * if that instance fails too, say so. Failures during a session are left to Chromium.
 * @param {Electron.Details} details
 */
function onChildProcessGone(details) {
  const action = gpuCrashAction({ argv: process.argv, details, loaded });
  if (action === 'relaunch') {
    // Released first so the new instance does not race against this one for the lock.
    app.releaseSingleInstanceLock();
    app.relaunch(gpuFallbackRelaunch(process.argv, process.env));
    app.exit(0);
  } else if (action === 'warn' && !gpuWarned) {
    gpuWarned = true;
    dialog.showErrorBox(APP_NAME, GPU_FAILED_MESSAGE);
  }
}

// Every page stays on the app origin: web links open in the system browser, nothing else opens.
// Downloads (<a download> with blob: URLs) keep Electron's default: a native "Save as" dialog.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-frame-navigate', (details) => {
    if (isAppUrl(details.url)) return;
    details.preventDefault();
    if (details.isMainFrame) openIfWeb(details.url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    openIfWeb(url);
    return { action: 'deny' };
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const given = agendaFileFromArgv(argv);
    // A relative path means relative to where the second instance was started.
    const file = given ? path.resolve(workingDirectory || process.cwd(), given) : null;
    if (file) safeOpen(file);
    if (!mainWindow) {
      // macOS keeps running without windows; before startup finishes, the first window is on its way.
      if (protocol.isProtocolHandled(SCHEME)) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on('child-process-gone', (_event, details) => onChildProcessGone(details));

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.whenReady().then(async () => {
    if (!(await stat(path.join(DIST, 'index.html')).catch(() => null))) {
      dialog.showErrorBox(APP_NAME, `The web app was not found in ${DIST}.\nRun "npm run build" first.`);
      app.quit();
      return;
    }
    protocol.handle(SCHEME, serve);
    // Each PDF the page saves: where it ended up is what "Open folder" needs.
    session.defaultSession.on('will-download', (_event, item) => {
      if (!item.getURL().startsWith(`blob:${APP_URL}`)) return;
      const id = downloads.start(item.getFilename());
      item.once('done', (_done, state) => {
        const ended = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
        downloads.finish(id, ended, ended === 'completed' ? item.getSavePath() : null);
      });
    });
    buildMenu();
    createWindow();
    void startLive();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
