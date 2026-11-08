/**
 * Settings of the assistant's internet and folder tools on the desktop: the services' API keys (encrypted by
 * the operating system with Electron `safeStorage`, never sent back to the page), the hosts the person
 * declared, the folder where every agenda gets its own subfolder, and the extra folders the assistant may read.
 *
 * Pure apart from what is injected (file system, `safeStorage`, the documents folder), so it is tested without Electron.
 */
import path from 'node:path';

/** The keys the services use, by the name of the environment variable the MCP server reads them from. */
export const SERVICE_KEYS = /** @type {const} */ (['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY', 'DEVIANTART_CLIENT_ID', 'DEVIANTART_CLIENT_SECRET', 'GOOGLE_FONTS_API_KEY']);

export const MAX_SECRET_LENGTH = 300;
export const MAX_HOSTS_LENGTH = 2000;
export const MAX_FOLDERS = 20;
export const ROOT_FOLDER_NAME = 'Heritage Studio';
/**
 * «Documents» for the root folder. Where the system has no documents folder configured, Electron answers with the
 * home folder itself: then it is `Documents` inside it (made when needed), never the home folder's top level.
 * @param {string} documents What Electron says. @param {string} home The home folder.
 */
export function documentsFolder(documents, home) {
  return path.resolve(documents) === path.resolve(home) ? path.join(home, 'Documents') : documents;
}

/** The file in each agenda's folder that says whose it is, so a moved folder is found again. */
export const PROJECT_MARKER = '.heritage-project.json';

/** @typedef {typeof SERVICE_KEYS[number]} ServiceKey */
/**
 * @typedef {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string, getSelectedStorageBackend?: () => string }} SafeStorageLike
 * @typedef {{ readFile(p: string, enc: 'utf8'): Promise<string>, writeFile(p: string, data: string, opts: { mode: number }): Promise<void>, rename(a: string, b: string): Promise<void>, mkdir(p: string, opts: { recursive: true }): Promise<unknown>, stat(p: string): Promise<{ isDirectory(): boolean }>, readdir(p: string): Promise<string[]> }} FsLike
 * @typedef {{ v: 1, enabled: boolean, root: string | null, folders: string[], trustedHosts: string, imageHosts: string, keys: Partial<Record<ServiceKey, string>>, projects: Record<string, string> }} ToolsFile
 */

/** @param {unknown} v @returns {v is ServiceKey} */
export const isServiceKey = (v) => typeof v === 'string' && /** @type {readonly string[]} */ (SERVICE_KEYS).includes(v);

/** A key is printable ASCII without spaces. */
const SECRET_PATTERN = /^[\x21-\x7e]+$/;

/** @param {unknown} v @returns {v is string} */
export const isSecret = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_SECRET_LENGTH && SECRET_PATTERN.test(v);

/** Host lists are text with names separated by commas, spaces or new lines: clean and bounded. @param {unknown} v @returns {string | null} */
export function cleanHostList(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v !== 'string' || v.length > MAX_HOSTS_LENGTH) return null;
  const items = v.split(/[\s,;]+/).filter(Boolean);
  if (items.some((i) => i.length > 200 || /[\p{Cc}"'<>\\]/u.test(i))) return null;
  return items.join(',');
}

/** A folder name for an agenda: no characters a file system rejects, no leading dots, bounded. @param {string} name */
export function folderName(name) {
  const clean = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
    .trim();
  // Names Windows reserves.
  return clean && !/^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? clean : 'Agenda';
}

/** @returns {ToolsFile} */
const empty = () => ({ v: 1, enabled: true, root: null, folders: [], trustedHosts: '', imageHosts: '', keys: {}, projects: {} });

export class ToolSettingsStore {
  /** @param {{ file: string, documentsDir: string, fs: FsLike, safeStorage: SafeStorageLike }} deps */
  constructor({ file, documentsDir, fs, safeStorage }) {
    this.file = file;
    this.documentsDir = documentsDir;
    this.fs = fs;
    this.safeStorage = safeStorage;
    /** @type {ToolsFile | null} */
    this.cache = null;
    /** Keys that could not be encrypted (no keyring): kept in memory only. */
    /** @type {Map<ServiceKey, string>} */
    this.volatile = new Map();
  }

  /** @returns {Promise<ToolsFile>} */
  async load() {
    if (this.cache) return this.cache;
    const data = empty();
    try {
      const raw = JSON.parse(await this.fs.readFile(this.file, 'utf8'));
      if (raw && typeof raw === 'object' && raw.v === 1) {
        if (typeof raw.enabled === 'boolean') data.enabled = raw.enabled;
        if (typeof raw.root === 'string' && path.isAbsolute(raw.root)) data.root = raw.root;
        if (Array.isArray(raw.folders)) data.folders = raw.folders.filter((/** @type {unknown} */ f) => typeof f === 'string' && path.isAbsolute(f)).slice(0, MAX_FOLDERS);
        data.trustedHosts = cleanHostList(raw.trustedHosts) ?? '';
        data.imageHosts = cleanHostList(raw.imageHosts) ?? '';
        for (const k of SERVICE_KEYS) if (typeof raw.keys?.[k] === 'string') data.keys[k] = raw.keys[k];
        if (raw.projects && typeof raw.projects === 'object') {
          for (const [id, dir] of Object.entries(raw.projects)) if (typeof dir === 'string' && path.isAbsolute(dir) && id.length <= 200) data.projects[id] = dir;
        }
      }
    } catch {
      // Nothing saved yet, or a damaged file: starts with the defaults.
    }
    this.cache = data;
    return data;
  }

  /** @param {ToolsFile} data */
  async save(data) {
    this.cache = data;
    await this.fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await this.fs.writeFile(tmp, `${JSON.stringify(data)}\n`, { mode: 0o600 });
    await this.fs.rename(tmp, this.file);
  }

  /** The folder every agenda's own folder goes in: the one the person chose, or `Documents/Heritage Studio`. */
  async rootDir() {
    return (await this.load()).root ?? path.join(this.documentsDir, ROOT_FOLDER_NAME);
  }

  /** What the page may know: never a key, only whether there is one. */
  async status() {
    const data = await this.load();
    const available = this.safeStorage.isEncryptionAvailable();
    const backend = available && typeof this.safeStorage.getSelectedStorageBackend === 'function' ? this.safeStorage.getSelectedStorageBackend() : available ? 'os' : 'none';
    return {
      enabled: data.enabled,
      root: await this.rootDir(),
      rootIsDefault: data.root === null,
      folders: data.folders,
      trustedHosts: data.trustedHosts,
      imageHosts: data.imageHosts,
      hasKey: Object.fromEntries(SERVICE_KEYS.map((k) => [k, typeof data.keys[k] === 'string' || this.volatile.has(k)])),
      encryption: { available, backend, weak: backend === 'basic_text' },
    };
  }

  /** @param {{ enabled?: boolean, trustedHosts?: string, imageHosts?: string }} change */
  async update(change) {
    const data = await this.load();
    const next = { ...data };
    if (typeof change.enabled === 'boolean') next.enabled = change.enabled;
    if (change.trustedHosts !== undefined) next.trustedHosts = change.trustedHosts;
    if (change.imageHosts !== undefined) next.imageHosts = change.imageHosts;
    await this.save(next);
  }

  /** @param {ServiceKey} name @param {string | null} value A value already checked with `isSecret` (or `null` to remove it). */
  async setKey(name, value) {
    const data = await this.load();
    const next = { ...data, keys: { ...data.keys } };
    this.volatile.delete(name);
    delete next.keys[name];
    if (value !== null && value !== '') {
      if (this.safeStorage.isEncryptionAvailable()) next.keys[name] = this.safeStorage.encryptString(value).toString('base64');
      else this.volatile.set(name, value);
    }
    await this.save(next);
  }

  /** @param {ServiceKey} name @returns {Promise<string | null>} */
  async getKey(name) {
    const kept = this.volatile.get(name);
    if (kept) return kept;
    const sealed = (await this.load()).keys[name];
    if (!sealed) return null;
    try {
      return this.safeStorage.decryptString(Buffer.from(sealed, 'base64'));
    } catch {
      return null;
    }
  }

  /** The environment the tools run with: the saved keys and hosts under the names the MCP server uses. @returns {Promise<Record<string, string>>} */
  async toolEnv() {
    const data = await this.load();
    /** @type {Record<string, string>} */
    const env = {};
    for (const k of SERVICE_KEYS) {
      const v = await this.getKey(k);
      if (v) env[k] = v;
    }
    if (data.trustedHosts) env.AGENDA_TRUSTED_HOSTS = data.trustedHosts;
    if (data.imageHosts) env.AGENDA_IMAGE_HOSTS = data.imageHosts;
    return env;
  }

  /**
   * Sets the folder where each agenda's folder goes. It has to be an absolute path to an existing folder (or
   * `null` for the default, `Documents/Heritage Studio`). Folders already made stay where they are.
   * @param {string | null} dir
   */
  async setRoot(dir) {
    if (dir !== null) {
      if (!path.isAbsolute(dir)) throw new Error('relative');
      const info = await this.fs.stat(dir).catch(() => null);
      if (!info?.isDirectory()) throw new Error('missing');
    }
    await this.save({ ...(await this.load()), root: dir });
  }

  /** @param {string} dir An existing absolute folder. */
  async addFolder(dir) {
    const data = await this.load();
    if (data.folders.includes(dir)) return;
    if (data.folders.length >= MAX_FOLDERS) throw new Error('too-many');
    await this.save({ ...data, folders: [...data.folders, dir] });
  }

  /** @param {string} dir */
  async removeFolder(dir) {
    const data = await this.load();
    await this.save({ ...data, folders: data.folders.filter((f) => f !== dir) });
  }

  /**
   * The folder of an agenda. Each one carries a small marker file with the agenda's id, so a folder that was
   * moved or renamed is found again (in the root, or next to where it was) instead of making a second one;
   * if it was deleted, a new one is made. Made when first needed, never on the desktop.
   * @param {string} id @param {string} name
   * @param {{ mkdir(p: string, o: { recursive: true }): Promise<unknown>, stat(p: string): Promise<{ isDirectory(): boolean }>, readdir(p: string): Promise<string[]>, readFile(p: string, enc: 'utf8'): Promise<string>, writeFile(p: string, d: string, o: { mode: number }): Promise<void> }} fs
   * @param {boolean} create Whether to make the folder when there is none (listing a folder must not make one).
   * @returns {Promise<string | null>}
   */
  async resolveProject(id, name, fs, create) {
    const data = await this.load();
    const known = data.projects[id];
    const isDir = async (/** @type {string} */ p) => (await fs.stat(p).catch(() => null))?.isDirectory() === true;
    const remember = async (/** @type {string} */ dir) => {
      if (data.projects[id] !== dir) await this.save({ ...(await this.load()), projects: { ...(await this.load()).projects, [id]: dir } });
      await fs.writeFile(path.join(dir, PROJECT_MARKER), `${JSON.stringify({ v: 1, id })}\n`, { mode: 0o644 }).catch(() => undefined);
      return dir;
    };
    if (known && (await isDir(known))) return known;
    const root = await this.rootDir();
    // Moved or renamed: look for the marker in the root and in the folder where it used to be.
    const places = [...new Set([root, ...(known ? [path.dirname(known)] : [])])];
    for (const place of places) {
      for (const entry of (await fs.readdir(place).catch(() => /** @type {string[]} */ ([]))).slice(0, 500)) {
        const dir = path.join(place, entry);
        const marker = await fs.readFile(path.join(dir, PROJECT_MARKER), 'utf8').then((t) => JSON.parse(t)).catch(() => null);
        if (marker && marker.id === id) return remember(dir);
      }
    }
    if (!create) return null;
    const base = folderName(name);
    const taken = new Set(Object.values(data.projects));
    let dir = path.join(root, base);
    for (let n = 2; n < 1000 && (taken.has(dir) || (await isDir(dir))); n++) dir = path.join(root, `${base} (${n})`);
    await fs.mkdir(dir, { recursive: true });
    return remember(dir);
  }

  /**
   * The folder of an agenda (made if there is none).
   * @param {string} id @param {string} name
   * @param {Parameters<ToolSettingsStore['resolveProject']>[2]} [fs]
   * @returns {Promise<string>}
   */
  async projectDir(id, name, fs = this.fs) {
    return /** @type {string} */ (await this.resolveProject(id, name, fs, true));
  }

  /**
   * The folder of an agenda if it already exists (moved or renamed ones are found), else `null`; it never makes one.
   * @param {string} id
   * @param {Parameters<ToolSettingsStore['resolveProject']>[2]} [fs]
   */
  existingProjectDir(id, fs = this.fs) {
    return this.resolveProject(id, '', fs, false);
  }
}
