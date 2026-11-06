/**
 * Images saved next to a planner file (`assets[].path`, relative to the file's folder): when the system
 * hands the app a `.agenda.json` (double click, "Open with…"), the main process reads them and puts their
 * bytes in the file (`data`) before the page opens it, because the page has no access to that folder.
 *
 * The same rules as the engine (`src/core/util/relpath.ts`, kept in step by `tests/electron-assets.test.ts`):
 * a relative path without "..", and, once symbolic links are resolved, still inside the folder.
 *
 * Pure apart from what is injected (the file system), so it is tested without Electron.
 */
import path from 'node:path';

export const RELATIVE_PATH_MAX = 300;
/** The largest image read from next to a planner. */
export const ASSET_FILE_MAX_BYTES = 64 * 1024 * 1024;

/** @param {unknown} p @returns {p is string} */
export function isRelativeAssetPath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > RELATIVE_PATH_MAX) return false;
  if (/[\\:\p{Cc}]/u.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..' && seg.trim() === seg);
}

/**
 * @typedef {{ realpath(p: string): Promise<string>, stat(p: string): Promise<{ isFile(): boolean, size: number }>, readFile(p: string): Promise<Uint8Array> }} FsLike
 */

/**
 * Reads `rel` inside `dir`, or throws.
 * @param {FsLike} fs @param {string} dir @param {string} rel
 */
export async function readInside(fs, dir, rel) {
  if (!isRelativeAssetPath(rel)) throw new Error('not a relative path');
  const base = await fs.realpath(dir);
  const full = await fs.realpath(path.resolve(base, rel));
  if (!full.startsWith(base + path.sep)) throw new Error('outside the folder');
  const info = await fs.stat(full);
  if (!info.isFile()) throw new Error('not a file');
  if (info.size > ASSET_FILE_MAX_BYTES) throw new Error('too large');
  return fs.readFile(full);
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The designs inside a file: a planner, a template (`design`) or a backup (`designs`, `templates[].design`).
 * @param {Record<string, unknown>} raw @returns {Record<string, unknown>[]}
 */
function designsIn(raw) {
  if (raw.kind === 'heritage-backup') {
    const designs = Array.isArray(raw.designs) ? raw.designs.filter(isObject) : [];
    const templates = Array.isArray(raw.templates) ? raw.templates.filter(isObject).map((t) => t.design).filter(isObject) : [];
    return [...designs, ...templates];
  }
  if (raw.kind === 'heritage-template') return isObject(raw.design) ? [raw.design] : [];
  return [raw];
}

/**
 * The file's text with the bytes of its images by path inside (`data`, base64). Text that is not JSON
 * is returned as is (the page reports it); an image that cannot be read is left without data (the
 * page then warns that it is missing).
 * @param {string} text @param {string} dir The folder of the planner file. @param {FsLike} fs
 * @returns {Promise<{ text: string, inlined: number, failed: string[] }>}
 */
export async function inlineAssetPaths(text, dir, fs) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { text, inlined: 0, failed: [] };
  }
  if (!isObject(raw)) return { text, inlined: 0, failed: [] };
  let inlined = 0;
  /** @type {string[]} */
  const failed = [];
  for (const design of designsIn(raw)) {
    if (!Array.isArray(design.assets)) continue;
    for (const asset of design.assets) {
      if (!isObject(asset) || typeof asset.path !== 'string' || (typeof asset.data === 'string' && asset.data !== '')) continue;
      try {
        asset.data = Buffer.from(await readInside(fs, dir, asset.path)).toString('base64');
        inlined++;
      } catch {
        failed.push(asset.path);
      }
    }
  }
  return { text: inlined > 0 ? JSON.stringify(raw) : text, inlined, failed };
}
