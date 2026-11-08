/**
 * What the sandboxed page can ask the main process for the assistant's internet and folder tools:
 * settings (never a key back), the tool list, one tool call, and a check that a service's key works.
 * The tools themselves are the bundle `dist-mcp/tools.mjs` (src/node/starTools.ts), loaded on first use.
 *
 * Pure apart from what is injected (the settings store, the tool loader, the dialogs and the file system), so
 * it is tested without Electron.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { cleanHostList, isSecret, isServiceKey, MAX_FOLDERS } from './toolSettings.mjs';

/**
 * @typedef {import('./toolSettings.mjs').ToolSettingsStore} Store
 * @typedef {{ alias: string, label: string, root: string }} Folder
 * @typedef {{ specs(): unknown[], has(name: string): boolean, call(name: string, input: unknown, ctx: unknown): Promise<unknown>, check(service: string, env: Record<string, string>): Promise<{ ok: boolean, message: string }>, listFolder(ctx: unknown, alias: string, sub?: string): Promise<unknown>, readFile(ctx: unknown, alias: string, rel: string): Promise<unknown> }} Tools
 * @typedef {{
 *   store: Store,
 *   loadTools: () => Promise<Tools>,
 *   chooseDirectory: (title: string) => Promise<string | null>,
 *   openPath: (dir: string) => Promise<string>,
 *   fs: { mkdir(p: string, o: { recursive: true }): Promise<unknown>, stat(p: string): Promise<{ isDirectory(): boolean }>, readdir(p: string): Promise<string[]>, readFile(p: string, enc: 'utf8'): Promise<string>, writeFile(p: string, d: string, o: { mode: number }): Promise<void> },
 * }} Deps
 */

/** The label of a folder the person chose: its name. @param {string} dir */
const labelOf = (dir) => path.basename(dir) || dir;

export class StarBridge {
  /** @param {Deps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {Promise<Tools> | null} */
    this.tools = null;
  }

  loadTools() {
    this.tools ??= this.deps.loadTools().catch((err) => {
      // A failed load is tried again next time.
      this.tools = null;
      throw err;
    });
    return this.tools;
  }

  /** The folders the assistant may read besides the planner's own, with the aliases the model uses. @returns {Promise<Folder[]>} */
  async folders() {
    const { folders } = await this.deps.store.load();
    // El alias sale de la ruta: quitar una carpeta no renumera las otras ni cambia a qué carpeta apunta un alias viejo.
    return folders.map((root) => ({ alias: `carpeta-${createHash('sha1').update(root).digest('hex').slice(0, 6)}`, label: labelOf(root), root }));
  }

  async config() {
    return this.deps.store.status();
  }

  /**
   * PUT body: `{ enabled?, trustedHosts?, imageHosts?, keys?: { NAME: string | null } }`. Returns the new status, or an error code.
   * @param {unknown} body
   */
  async updateConfig(body) {
    if (!body || typeof body !== 'object') return { error: 'body' };
    const b = /** @type {Record<string, unknown>} */ (body);
    /** @type {{ enabled?: boolean, trustedHosts?: string, imageHosts?: string }} */
    const change = {};
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') return { error: 'enabled' };
      change.enabled = b.enabled;
    }
    for (const k of /** @type {const} */ (['trustedHosts', 'imageHosts'])) {
      if (b[k] === undefined) continue;
      const clean = cleanHostList(b[k]);
      if (clean === null) return { error: k };
      change[k] = clean;
    }
    /** @type {Array<[import('./toolSettings.mjs').ServiceKey, string | null]>} */
    const keys = [];
    if (b.keys !== undefined) {
      if (!b.keys || typeof b.keys !== 'object') return { error: 'keys' };
      for (const [name, v] of Object.entries(b.keys)) {
        const value = typeof v === 'string' ? v.replace(/\s+/g, '') : v;
        if (!isServiceKey(name) || (value !== null && value !== '' && !isSecret(value))) return { error: 'key' };
        keys.push([name, value === '' ? null : /** @type {string | null} */ (value)]);
      }
    }
    await this.deps.store.update(change);
    for (const [name, value] of keys) await this.deps.store.setKey(name, value);
    return { status: await this.config() };
  }

  /**
   * POST `{ action, folder? }`: the things that need a dialog or the file manager.
   * @param {unknown} body
   */
  async action(body) {
    const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
    const { store } = this.deps;
    switch (b.action) {
      case 'choose-root': {
        const dir = await this.deps.chooseDirectory('root');
        if (!dir) return { cancelled: true, status: await this.config() };
        await store.setRoot(dir);
        return { status: await this.config() };
      }
      case 'reset-root':
        await store.setRoot(null);
        return { status: await this.config() };
      case 'add-folder': {
        if ((await store.load()).folders.length >= MAX_FOLDERS) return { error: 'too-many' };
        const dir = await this.deps.chooseDirectory('read');
        if (!dir) return { cancelled: true, status: await this.config() };
        await store.addFolder(dir);
        return { status: await this.config() };
      }
      case 'remove-folder':
        if (typeof b.folder !== 'string') return { error: 'folder' };
        await store.removeFolder(b.folder);
        return { status: await this.config() };
      case 'open-root': {
        const root = await store.rootDir();
        await this.deps.fs.mkdir(root, { recursive: true });
        const error = await this.deps.openPath(root);
        return { ok: error === '', error };
      }
      case 'open-project': {
        const agenda = parseAgenda(b.agenda);
        if (!agenda) return { error: 'agenda' };
        const dir = await store.projectDir(agenda.id, agenda.name, this.deps.fs);
        const error = dir ? await this.deps.openPath(dir) : 'missing';
        return { ok: error === '', error, dir };
      }
      default:
        return { error: 'action' };
    }
  }

  /** The tools the model gets, or none when the person turned them off. */
  async list() {
    const { enabled } = await this.deps.store.load();
    if (!enabled) return { enabled: false, tools: [] };
    return { enabled: true, tools: (await this.loadTools()).specs() };
  }

  /**
   * POST `{ name, input, agenda?: { id, name } }`.
   * @param {unknown} body
   * @param {AbortSignal} [signal]
   */
  async call(body, signal) {
    const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
    if (typeof b.name !== 'string' || b.name.length > 80) return { error: 'name' };
    const { store } = this.deps;
    if (!(await store.load()).enabled) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'La persona desactivó las herramientas de internet y carpetas en Ajustes.' }) }], isError: true };
    const tools = await this.loadTools();
    if (!tools.has(b.name)) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `No existe la herramienta «${b.name}».` }) }], isError: true };
    return tools.call(b.name, b.input, await this.context(b.agenda, signal));
  }

  /**
   * What a tool call knows: the saved keys, the open agenda's folder (made the first time something needs it) and the folders that may be read.
   * @param {unknown} rawAgenda @param {AbortSignal} [signal] @param {boolean} [create] Make the agenda's folder if it does not exist (not when only listing).
   */
  async context(rawAgenda, signal, create = true) {
    const { store } = this.deps;
    const agenda = parseAgenda(rawAgenda);
    const folders = await this.folders();
    /** @type {Promise<string | null> | null} */
    let project = null;
    return {
      env: await store.toolEnv(),
      // The folder of the open agenda: made the first time something needs it, and only once per call.
      projectDir: () => (project ??= agenda ? (create ? store.projectDir(agenda.id, agenda.name, this.deps.fs) : store.existingProjectDir(agenda.id, this.deps.fs)).catch(() => null) : Promise.resolve(null)),
      folders,
      signal,
      chooseFolder: async () => {
        const dir = await this.deps.chooseDirectory('read');
        if (!dir) return null;
        await store.addFolder(dir);
        const now = await this.folders();
        return now.find((f) => f.root === dir) ?? null;
      },
    };
  }

  /**
   * POST `{ folder, subfolder?, file?, agenda }`: the images of a folder with thumbnails, or one image's bytes.
   * @param {unknown} body
   */
  async browse(body) {
    const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
    if (typeof b.folder !== 'string' || b.folder.length > 40) return { error: 'folder' };
    if (b.subfolder !== undefined && (typeof b.subfolder !== 'string' || b.subfolder.length > 200)) return { error: 'subfolder' };
    const tools = await this.loadTools();
    const ctx = await this.context(b.agenda, undefined, false);
    try {
      if (typeof b.file === 'string') return await tools.readFile(ctx, b.folder, b.file.slice(0, 400));
      return await tools.listFolder(ctx, b.folder, /** @type {string | undefined} */ (b.subfolder));
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** @param {unknown} service */
  async check(service) {
    if (typeof service !== 'string' || service.length > 210) return { ok: false, message: 'Servicio desconocido.' };
    const tools = await this.loadTools();
    return tools.check(service, await this.deps.store.toolEnv());
  }
}

/** @param {unknown} v @returns {{ id: string, name: string } | null} */
function parseAgenda(v) {
  if (!v || typeof v !== 'object') return null;
  const { id, name } = /** @type {{ id?: unknown, name?: unknown }} */ (v);
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && typeof name === 'string' ? { id, name: name.slice(0, 200) } : null;
}
