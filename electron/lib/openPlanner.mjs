/**
 * Reading a planner file chosen by the user (double click, "Open with…", File → Open file…): the file's text
 * with the images saved next to it (`assets[].path`) put inside, because the page has no access to that
 * folder. Everything that touches the system is injected, so it is tested without Electron.
 */
import path from 'node:path';
import { inlineAssetPaths } from './assets.mjs';

/**
 * @typedef {{
 *   stat(file: string): Promise<{ isFile(): boolean, size: number } | null>,
 *   readFile(file: string): Promise<string>,
 *   fs: import('./assets.mjs').FsLike,
 *   maxBytes: number,
 * }} PlannerReader
 */

/**
 * @param {string} file
 * @param {PlannerReader} reader
 * @returns {Promise<{ ok: true, text: string, name: string, inlined: number, failed: string[] } | { ok: false, reason: 'unreadable' | 'too-large' }>}
 */
export async function readPlanner(file, reader) {
  const info = await reader.stat(file);
  if (!info?.isFile()) return { ok: false, reason: 'unreadable' };
  if (info.size > reader.maxBytes) return { ok: false, reason: 'too-large' };
  const { text, inlined, failed } = await inlineAssetPaths(await reader.readFile(file), path.dirname(file), reader.fs);
  return { ok: true, text, name: path.basename(file), inlined, failed };
}
