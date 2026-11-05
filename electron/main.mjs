/**
 * Heritage Studio: entry point of the Electron main process.
 *
 * The same program is two things: the desktop app (a window) and, with `--mcp`, the Model Context
 * Protocol server that AI clients such as Claude Desktop launch over stdio (no window at all).
 * Only the module for the chosen mode is loaded, so the server never touches the window code and
 * the app never touches the server.
 */
import { wantsMcp } from './lib/args.mjs';

await import(wantsMcp(process.argv) ? './mcp.mjs' : './desktop.mjs');
