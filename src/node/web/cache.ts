/**
 * Caché de lo que se pidió a las APIs (búsquedas y fichas de imágenes y fuentes): en memoria y, si hay
 * carpeta, en disco, para que repetir una búsqueda no gaste llamadas (Pixabay pide guardar 24 horas)
 * ni siquiera después de reiniciar. Guarda solo respuestas ya interpretadas y claves de búsqueda ya
 * resumidas con un hash: nunca una clave de API ni una dirección con ella.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Archivos de la caché en disco como mucho (los más viejos se borran). */
export const CACHE_MAX_FILES = 400;

export interface Cache {
  get<T>(space: string, key: string): Promise<T | undefined>;
  set(space: string, key: string, value: unknown): Promise<void>;
}

interface Entry {
  at: number;
  value: unknown;
}

/** Dónde se guarda por defecto: la carpeta de cachés del sistema (o `AGENDA_CACHE_DIR`). `null`: solo en memoria. */
export function defaultCacheDir(env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform = process.platform, home: string = homedir()): string | null {
  if (env.AGENDA_CACHE_DIR !== undefined) return env.AGENDA_CACHE_DIR === '' ? null : env.AGENDA_CACHE_DIR;
  if (platform === 'win32') return env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'HeritageStudio', 'cache') : null;
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'HeritageStudio');
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'heritage-studio');
}

/** El nombre de archivo (y la clave) de una entrada: nunca el texto de la búsqueda tal cual. */
export function cacheName(space: string, key: string): string {
  return `${space.replace(/[^a-z0-9-]/gi, '_')}-${createHash('sha256').update(key).digest('hex').slice(0, 40)}.json`;
}

export function createCache(opts: { dir: string | null; now?: () => number; ttlMs?: number; memoryMax?: number }): Cache {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? CACHE_TTL_MS;
  const memoryMax = opts.memoryMax ?? 300;
  const memory = new Map<string, Entry>();
  let pruned = false;

  const remember = (name: string, entry: Entry): void => {
    memory.delete(name);
    memory.set(name, entry);
    // El más viejo (el primero que se insertó) sale cuando se pasa.
    while (memory.size > memoryMax) memory.delete(memory.keys().next().value as string);
  };

  /** Borra los archivos más viejos si hay demasiados (una vez por proceso, sin esperar). */
  const prune = async (dir: string): Promise<void> => {
    try {
      const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
      if (names.length <= CACHE_MAX_FILES) return;
      const dated = await Promise.all(names.map(async (n) => ({ n, t: (await stat(join(dir, n))).mtimeMs })));
      dated.sort((a, b) => a.t - b.t);
      await Promise.all(dated.slice(0, names.length - CACHE_MAX_FILES).map((d) => unlink(join(dir, d.n)).catch(() => undefined)));
    } catch {
      // la caché es una ayuda: si no se puede limpiar, no pasa nada
    }
  };

  return {
    async get<T>(space: string, key: string): Promise<T | undefined> {
      const name = cacheName(space, key);
      let entry = memory.get(name);
      if (!entry && opts.dir) {
        try {
          const parsed = JSON.parse(await readFile(join(opts.dir, name), 'utf8')) as Partial<Entry>;
          if (typeof parsed.at === 'number' && 'value' in parsed) entry = { at: parsed.at, value: parsed.value };
        } catch {
          // no hay, o está dañado: se pide de nuevo
        }
      }
      if (!entry) return undefined;
      if (now() - entry.at > ttl) {
        memory.delete(name);
        return undefined;
      }
      remember(name, entry);
      return entry.value as T;
    },
    async set(space, key, value) {
      const name = cacheName(space, key);
      const entry: Entry = { at: now(), value };
      remember(name, entry);
      if (!opts.dir) return;
      try {
        await mkdir(opts.dir, { recursive: true, mode: 0o700 });
        // Se escribe a un archivo aparte y se renombra: otro proceso nunca lee uno a medias.
        const temp = join(opts.dir, `${name}.${process.pid}.tmp`);
        await writeFile(temp, JSON.stringify(entry), { mode: 0o600 });
        await rename(temp, join(opts.dir, name));
        if (!pruned) {
          pruned = true;
          void prune(opts.dir);
        }
      } catch {
        // sin disco la caché sigue en memoria
      }
    },
  };
}
