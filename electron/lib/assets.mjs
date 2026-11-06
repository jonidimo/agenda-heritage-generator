/**
 * Images saved next to a planner file (`assets[].path`, relative to the file's folder): when the system
 * hands the app a `.agenda.json` (double click, "Open with…"), the main process reads them and puts their
 * bytes in the file (`data`) before the page opens it, because the page has no access to that folder.
 *
 * The same rules as the engine (`src/core/util/relpath.ts`, kept in step by `tests/asset-path.test.ts`):
 * a relative path to an image, PDF or font, with no hidden or ".." segment, still inside the folder once
 * symbolic links are resolved, and whose bytes are what its extension says.
 *
 * Pure apart from what is injected (the file system), so it is tested without Electron.
 */
import path from 'node:path';

export const RELATIVE_PATH_MAX = 300;
/** The largest image read from next to a planner. */
export const ASSET_FILE_MAX_BYTES = 64 * 1024 * 1024;

/** What a planner may read from its folder: images, PDFs and fonts. */
const ASSET_EXTENSION = /\.(?:png|jpe?g|svg|pdf|ttf|otf)$/i;
/** The most image bytes put into one opened file. */
export const INLINE_TOTAL_MAX_BYTES = 128 * 1024 * 1024;

/** @param {unknown} p @returns {p is string} */
export function isRelativeAssetPath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > RELATIVE_PATH_MAX) return false;
  if (/[\\:\p{Cc}]/u.test(p)) return false;
  if (!ASSET_EXTENSION.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && !seg.startsWith('.') && seg.trim() === seg);
}

/**
 * Whether the bytes are what the extension says (a renamed file of any other kind is refused).
 * @param {string} path @param {Uint8Array} b
 */
export function bytesMatchExtension(path, b) {
  const ext = (/\.([a-z]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
  /** @param {number[]} sig */
  const starts = (...sig) => sig.every((v, i) => b[i] === v);
  switch (ext) {
    case 'png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpg':
    case 'jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'pdf':
      return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
    case 'ttf':
    case 'otf':
      return starts(0x00, 0x01, 0x00, 0x00) || starts(0x4f, 0x54, 0x54, 0x4f) || starts(0x74, 0x72, 0x75, 0x65);
    case 'svg': {
      const head = new TextDecoder().decode(b.subarray(0, 4096)).replace(/^\uFEFF/, '').trimStart();
      return head.startsWith('<') && /<svg[\s>]/i.test(head);
    }
    default:
      return false;
  }
}

/**
 * @typedef {{ stat(): Promise<{ isFile(): boolean, size: number }>, read(buf: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>, close(): Promise<void> }} HandleLike
 * @typedef {{ realpath(p: string): Promise<string>, open(p: string, flags: 'r'): Promise<HandleLike> }} FsLike
 */

/**
 * Reads `rel` inside `dir`, or throws: the path is resolved (symbolic links included) and checked, the
 * file is opened once and read through that handle with a size cap, and its bytes must match its extension.
 * @param {FsLike} fs @param {string} dir @param {string} rel
 */
export async function readInside(fs, dir, rel) {
  if (!isRelativeAssetPath(rel)) throw new Error('not a relative path to an image, PDF or font');
  const base = await fs.realpath(dir);
  const full = await fs.realpath(path.resolve(base, rel));
  const inside = base.endsWith(path.sep) ? base : base + path.sep;
  if (!full.startsWith(inside)) throw new Error('outside the folder');
  const handle = await fs.open(full, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('not a file');
    if (info.size > ASSET_FILE_MAX_BYTES) throw new Error('too large');
    const bytes = new Uint8Array(info.size);
    const { bytesRead } = await handle.read(bytes, 0, info.size, 0);
    const got = bytes.subarray(0, bytesRead);
    if (!bytesMatchExtension(rel, got)) throw new Error('not what its extension says');
    return got;
  } finally {
    await handle.close();
  }
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
  let total = 0;
  /** @type {string[]} */
  const failed = [];
  /** The same file used by several images is read once. @type {Map<string, string>} */
  const done = new Map();
  for (const design of designsIn(raw)) {
    if (!Array.isArray(design.assets)) continue;
    for (const asset of design.assets) {
      if (!isObject(asset) || typeof asset.path !== 'string' || (typeof asset.data === 'string' && asset.data !== '')) continue;
      try {
        let data = done.get(asset.path);
        if (data === undefined) {
          const bytes = await readInside(fs, dir, asset.path);
          total += bytes.length;
          if (total > INLINE_TOTAL_MAX_BYTES) throw new Error('too many bytes in all');
          data = Buffer.from(bytes).toString('base64');
          done.set(asset.path, data);
        }
        asset.data = data;
        inlined++;
      } catch {
        failed.push(asset.path);
      }
    }
  }
  return { text: inlined > 0 ? JSON.stringify(raw) : text, inlined, failed };
}
