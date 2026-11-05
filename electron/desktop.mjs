/**
 * Heritage Studio: Electron main process.
 *
 * The web build in dist/ is served through a privileged custom scheme (app://heritage/), so the
 * app always runs from the same secure origin: fetch, module workers, IndexedDB and localStorage
 * behave as on the website and saved planners persist across launches. The page runs in a fully
 * sandboxed renderer, without a preload script or Node.js.
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, Menu, net, protocol, screen, shell } from 'electron';
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

/**
 * Serves app://heritage/<path> from dist/, never from outside it.
 * @param {Request} request
 */
async function serve(request) {
  const { host, pathname } = new URL(request.url);
  if (host !== HOST) return notFound();
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

/** Whether the page has finished loading once: from then on the startup is over. */
let loaded = false;

const GPU_FAILED_MESSAGE =
  'The graphics process failed to start, even with graphics acceleration turned off.\n' +
  'Update your graphics drivers or, on Linux with Wayland, start the app with --ozone-platform=x11.';

function createWindow() {
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
  });
  win.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) revealer.reveal();
  });
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
  app.on('second-instance', () => {
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
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
