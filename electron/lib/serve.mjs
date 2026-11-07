/**
 * Serving the built app (`dist/`) under app://heritage/: which file a request path names (never one
 * outside dist/) and the content type to send it with.
 *
 * The type is stated explicitly instead of left to the platform's MIME database: a module script
 * (`import()` of a chunk) or a WebAssembly file with the wrong type does not load, and some Linux
 * systems lack a mapping. Pure functions, tested without Electron.
 */
import path from 'node:path';

/** @type {Readonly<Record<string, string>>} */
export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

/** The content type of a file by its extension, or `undefined` to leave the one the platform gives. @param {string} file */
export function contentTypeOf(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()];
}

/**
 * The file in `dist` a request path names (`/` is index.html), or `null` if the path is malformed or
 * leaves `dist`.
 * @param {string} dist absolute path of the built app
 * @param {string} pathname the URL path, still percent-encoded
 * @returns {string | null}
 */
export function resolveAppPath(dist, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '/') rel = '/index.html';
  const file = path.join(dist, rel);
  const inside = path.relative(dist, file);
  if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return null;
  return file;
}
