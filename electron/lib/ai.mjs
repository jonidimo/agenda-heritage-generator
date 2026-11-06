/**
 * The AI assistant on the desktop: API keys stay in the main process, encrypted by the operating system
 * (Electron `safeStorage`: Keychain on macOS, DPAPI on Windows, libsecret/KWallet on Linux), and the
 * page's requests to the provider go out through the main process, which adds the key. The page never
 * sees a key once it is saved, and the main process only sends a key to that provider's own hosts or to
 * an address the person set in the assistant's settings.
 *
 * Pure apart from what is injected (the file system and `safeStorage`), so it is tested without Electron.
 */
import path from 'node:path';

/** @typedef {'anthropic' | 'gemini' | 'openai'} ProviderId */

export const PROVIDER_IDS = /** @type {const} */ (['anthropic', 'gemini', 'openai']);

/**
 * Where each provider's API lives when no address is saved. A key goes to exactly one origin: this one,
 * or the origin of the address saved for that provider (and changing that address forgets the key, so a
 * key typed for one service never travels to another).
 */
export const DEFAULT_ORIGINS = {
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
};

/** What an API key may look like: printable ASCII without spaces (nothing that can break a header). */
export const KEY_PATTERN = /^[\x21-\x7e]+$/;

/** How each provider expects the key. */
export const AUTH = {
  anthropic: { header: 'x-api-key', prefix: '' },
  gemini: { header: 'x-goog-api-key', prefix: '' },
  openai: { header: 'authorization', prefix: 'Bearer ' },
};

/** Headers the page may pass on to a provider; anything else (credentials above all) is dropped. */
const FORWARDED_HEADERS = new Set(['content-type', 'accept', 'anthropic-version', 'anthropic-beta']);

export const MAX_KEY_LENGTH = 512;
export const MAX_URL_LENGTH = 500;

/** @param {unknown} v @returns {v is ProviderId} */
export const isProviderId = (v) => typeof v === 'string' && /** @type {readonly string[]} */ (PROVIDER_IDS).includes(v);

/** @param {string} host */
const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/**
 * The one origin a provider's key may go to: the saved address's (https, or http on this computer), or
 * the provider's own. `null` when the saved address is not acceptable.
 * @param {ProviderId} provider @param {string | undefined} savedBase
 */
export function keyOrigin(provider, savedBase) {
  if (!savedBase) return DEFAULT_ORIGINS[provider];
  let base;
  try {
    base = new URL(savedBase);
  } catch {
    return null;
  }
  if (base.username || base.password) return null;
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && isLocalHost(base.hostname))) return null;
  return base.origin;
}

/**
 * Whether the main process may send `provider`'s key to `url`: only to its one origin (see `keyOrigin`).
 * @param {ProviderId} provider @param {string} url @param {string | undefined} savedBase
 */
export function aiTargetAllowed(provider, url, savedBase) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.username || target.password) return false;
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
  const origin = keyOrigin(provider, savedBase);
  return origin !== null && target.origin === origin;
}

/**
 * The headers to forward: only the provider-protocol ones, never a credential the page tried to set.
 * @param {unknown} headers
 * @returns {Record<string, string>}
 */
export function sanitizeHeaders(headers) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const [k, v] of Object.entries(headers)) {
    const name = k.toLowerCase();
    if (FORWARDED_HEADERS.has(name) && typeof v === 'string' && v.length <= 2000 && !/[\r\n]/.test(v)) out[name] = v;
  }
  return out;
}

/**
 * An address the person typed for a provider: a valid http(s) URL without credentials, or empty.
 * @param {unknown} v
 * @returns {string | null} The clean address, `''` for none, or `null` if it is not valid.
 */
export function cleanBaseUrl(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v !== 'string' || v.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(v.trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * @typedef {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string, getSelectedStorageBackend?: () => string }} SafeStorageLike
 * @typedef {{ readFile(p: string, enc: 'utf8'): Promise<string>, writeFile(p: string, data: string, opts: { mode: number }): Promise<void>, rename(a: string, b: string): Promise<void>, mkdir(p: string, opts: { recursive: true }): Promise<unknown>, rm(p: string, opts: { force: true }): Promise<void> }} FsLike
 * @typedef {{ v: 1, keys: Partial<Record<ProviderId, string>>, baseUrls: Partial<Record<ProviderId, string>> }} AiFile
 */

/** The assistant's keys and saved addresses, in `<userData>/ai.json` (only readable by its owner). */
export class AiSettingsStore {
  /** @param {{ file: string, fs: FsLike, safeStorage: SafeStorageLike }} deps */
  constructor({ file, fs, safeStorage }) {
    this.file = file;
    this.fs = fs;
    this.safeStorage = safeStorage;
    /** @type {AiFile | null} */
    this.cache = null;
    /** Keys that could not be encrypted (no keyring): kept only in memory, never written, gone when the app closes. */
    /** @type {Map<ProviderId, string>} */
    this.volatile = new Map();
  }

  /** @returns {Promise<AiFile>} */
  async load() {
    if (this.cache) return this.cache;
    /** @type {AiFile} */
    let data = { v: 1, keys: {}, baseUrls: {} };
    try {
      const raw = JSON.parse(await this.fs.readFile(this.file, 'utf8'));
      if (raw && typeof raw === 'object' && raw.v === 1) {
        for (const p of PROVIDER_IDS) {
          if (typeof raw.keys?.[p] === 'string') data.keys[p] = raw.keys[p];
          const base = cleanBaseUrl(raw.baseUrls?.[p]);
          if (base) data.baseUrls[p] = base;
        }
      }
    } catch {
      // No file yet, or a damaged one: it starts empty (a damaged key could not be decrypted anyway).
      data = { v: 1, keys: {}, baseUrls: {} };
    }
    this.cache = data;
    return data;
  }

  /** @param {AiFile} data */
  async save(data) {
    this.cache = data;
    await this.fs.mkdir(path.dirname(this.file), { recursive: true });
    // Written next to it and renamed: a crash never leaves half a file.
    const tmp = `${this.file}.${process.pid}.tmp`;
    await this.fs.writeFile(tmp, `${JSON.stringify(data)}\n`, { mode: 0o600 });
    await this.fs.rename(tmp, this.file);
  }

  /** What the page may know: whether there is a key (never the key), the saved addresses and how keys are protected. */
  async status() {
    const data = await this.load();
    const available = this.safeStorage.isEncryptionAvailable();
    const backend = available && typeof this.safeStorage.getSelectedStorageBackend === 'function' ? this.safeStorage.getSelectedStorageBackend() : available ? 'os' : 'none';
    return {
      hasKey: Object.fromEntries(PROVIDER_IDS.map((p) => [p, typeof data.keys[p] === 'string' || this.volatile.has(p)])),
      baseUrls: Object.fromEntries(PROVIDER_IDS.map((p) => [p, data.baseUrls[p] ?? ''])),
      // Linux without a keyring: Electron falls back to a fixed password ("basic_text"), which is not real protection.
      encryption: { available, backend, weak: backend === 'basic_text' },
    };
  }

  /** @param {ProviderId} provider @param {string | null} key A key already checked against `KEY_PATTERN` (or `null`). */
  async setKey(provider, key) {
    const data = await this.load();
    const next = { ...data, keys: { ...data.keys } };
    this.volatile.delete(provider);
    delete next.keys[provider];
    if (key !== null && key.trim() !== '') {
      // Without encryption the key is never written in clear: it lasts while the app is open.
      if (this.safeStorage.isEncryptionAvailable()) next.keys[provider] = this.safeStorage.encryptString(key.trim()).toString('base64');
      else this.volatile.set(provider, key.trim());
    }
    await this.save(next);
  }

  /**
   * Saves the address for a provider. If its origin changes, the provider's key is forgotten: a key is
   * for one service, and the person types the new service's key (the page cannot redirect a saved key).
   * @param {ProviderId} provider @param {string} base An address already checked by `cleanBaseUrl`.
   * @returns {Promise<boolean>} Whether the key was forgotten.
   */
  async setBaseUrl(provider, base) {
    const data = await this.load();
    const next = { ...data, baseUrls: { ...data.baseUrls }, keys: { ...data.keys } };
    const before = keyOrigin(provider, data.baseUrls[provider]);
    if (base === '') delete next.baseUrls[provider];
    else next.baseUrls[provider] = base;
    const forget = keyOrigin(provider, next.baseUrls[provider]) !== before && (typeof next.keys[provider] === 'string' || this.volatile.has(provider));
    if (forget) {
      delete next.keys[provider];
      this.volatile.delete(provider);
    }
    await this.save(next);
    return forget;
  }

  /** @param {ProviderId} provider @returns {Promise<string | null>} */
  async getKey(provider) {
    const kept = this.volatile.get(provider);
    if (kept) return kept;
    const sealed = (await this.load()).keys[provider];
    if (!sealed) return null;
    try {
      return this.safeStorage.decryptString(Buffer.from(sealed, 'base64'));
    } catch {
      // Encrypted on another account or system: unusable, so the person has to enter it again.
      return null;
    }
  }

  /** @param {ProviderId} provider */
  async baseUrl(provider) {
    return (await this.load()).baseUrls[provider];
  }
}

/**
 * Checks a `/_sys/ai/chat` request from the page: which provider, where to and what to send.
 * @param {unknown} body
 * @returns {{ ok: true, provider: ProviderId, url: string, method: 'GET' | 'POST', headers: Record<string, string>, payload?: string } | { ok: false, error: string }}
 */
export function parseChatRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body' };
  const b = /** @type {Record<string, unknown>} */ (body);
  if (!isProviderId(b.provider)) return { ok: false, error: 'provider' };
  if (typeof b.url !== 'string' || b.url.length > 2000) return { ok: false, error: 'url' };
  if (b.method !== 'GET' && b.method !== 'POST') return { ok: false, error: 'method' };
  if (b.body !== undefined && typeof b.body !== 'string') return { ok: false, error: 'payload' };
  return { ok: true, provider: b.provider, url: b.url, method: b.method, headers: sanitizeHeaders(b.headers), ...(typeof b.body === 'string' ? { payload: b.body } : {}) };
}
