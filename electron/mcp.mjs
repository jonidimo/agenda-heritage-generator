/**
 * Heritage Studio as an MCP server (`heritage-studio --mcp`).
 *
 * AI clients (Claude Desktop, Claude Code…) launch this and talk JSON-RPC over stdio, so the
 * rules here are strict:
 *  - stdout belongs to the protocol. Nothing in this file writes to it; every message for a person
 *    goes to stderr. Electron itself logs only to stderr as well.
 *  - There is no window, no menu, no single-instance lock and no custom protocol: any number of
 *    servers can run at once, next to the desktop app.
 *  - It ends when the client closes stdin (or sends SIGTERM / SIGINT), and on any startup error,
 *    which is reported on stderr with a non-zero exit code.
 *
 * The server itself is the bundle in dist-mcp/ (`npm run build:mcp`), loaded from inside the app
 * package. Fonts, holidays and images come from the app's own dist/ folder.
 */
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { MISSING_DISPLAY_MESSAGE, missingDisplay, windowsMcpMessage } from './lib/args.mjs';

/** Environment variable that points the server to its fonts, holidays and images. */
const PUBLIC_DIR_ENV = 'AGENDA_PUBLIC_DIR';

// Nothing to draw: skip the graphics process, and keep the dock icon from bouncing on macOS.
app.disableHardwareAcceleration();
app.dock?.hide();

// A throwaway data folder, so a server never shares Chromium's profile files with the desktop app
// or with another server. Chromium writes into it while shutting down, after this code has removed
// it, and a killed server never gets to clean up; so leftovers from earlier runs are swept here.
const SCRATCH_PREFIX = 'heritage-studio-mcp-';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
for (const name of readdirSync(tmpdir())) {
  if (!name.startsWith(SCRATCH_PREFIX)) continue;
  const old = path.join(tmpdir(), name);
  try {
    if (Date.now() - statSync(old).mtimeMs > STALE_AFTER_MS) rmSync(old, { recursive: true, force: true });
  } catch {
    /* in use by another server, or already gone */
  }
}
const scratch = mkdtempSync(path.join(tmpdir(), SCRATCH_PREFIX));
app.setPath('userData', scratch);
app.on('quit', () => {
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* swept by a later run */
  }
});

let finished = false;

/** @param {number} code */
function finish(code) {
  if (finished) return;
  finished = true;
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* a temp folder that cannot be removed is not worth failing for */
  }
  app.exit(code);
}

/** @param {unknown} err */
function fail(err) {
  console.error(err instanceof Error ? err.message : String(err));
  finish(1);
}

// The server ends by itself once the client closes its input and the requests in flight are
// answered (see src/mcp/run.ts); a client that is killed or asks politely takes it down at once.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => finish(0));
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

// On Linux Chromium needs a display server to start unless it is told to run headless, and that
// choice is made from the command line, before any of this code runs: it cannot be made here.
// Chromium would stop a moment later with an obscure message, so say what to do instead.
if (missingDisplay(process.argv, process.env, process.platform)) console.error(MISSING_DISPLAY_MESSAGE);

try {
  const bundle = path.join(app.getAppPath(), 'dist-mcp', 'main.mjs');
  if (process.platform === 'win32') throw new Error(windowsMcpMessage(process.execPath, bundle));
  // An installed app is started by the AI client from a folder nobody chose (the install folder,
  // System32…): the working folder has to be named, or planners would be written there.
  if (app.isPackaged && !process.env.AGENDA_MCP_ROOT) {
    throw new Error('Set AGENDA_MCP_ROOT to the folder where planners may be read and written (see docs/desktop.md).');
  }
  const appPath = app.getAppPath();
  process.env[PUBLIC_DIR_ENV] ||= path.join(appPath, 'dist');
  // The server reads the working folder from AGENDA_MCP_ROOT, or else from where it was launched.
  await import(pathToFileURL(bundle).href);
  finish(0);
} catch (err) {
  fail(err);
}
