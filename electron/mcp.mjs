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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { MISSING_DISPLAY_MESSAGE, missingDisplay } from './lib/args.mjs';

/** Environment variable that points the server to its fonts, holidays and images. */
const PUBLIC_DIR_ENV = 'AGENDA_PUBLIC_DIR';

// Nothing to draw: skip the graphics process, and keep the dock icon from bouncing on macOS.
app.disableHardwareAcceleration();
app.dock?.hide();

// A throwaway data folder, so a server never shares Chromium's profile files with the desktop app
// or with another server (and leaves nothing behind).
const scratch = mkdtempSync(path.join(tmpdir(), 'heritage-studio-mcp-'));
app.setPath('userData', scratch);

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

// A client that goes away takes the server with it.
process.stdin.on('end', () => finish(0));
process.stdin.on('close', () => finish(0));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => finish(0));
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

// On Linux Chromium needs a display server to start unless it is told to run headless, and that
// choice is made from the command line, before any of this code runs: it cannot be made here.
// Chromium would stop a moment later with an obscure message, so say what to do instead.
if (missingDisplay(process.argv, process.env, process.platform)) console.error(MISSING_DISPLAY_MESSAGE);

try {
  const appPath = app.getAppPath();
  process.env[PUBLIC_DIR_ENV] ||= path.join(appPath, 'dist');
  // The server reads the working folder from AGENDA_MCP_ROOT, or else from where it was launched.
  await import(pathToFileURL(path.join(appPath, 'dist-mcp', 'main.mjs')).href);
} catch (err) {
  fail(err);
}
