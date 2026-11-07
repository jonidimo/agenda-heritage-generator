/**
 * Lo que la aplicación de escritorio sabe y la página no: dónde quedó un PDF que se guardó, y abrirlo
 * o mostrar su carpeta. El proceso principal lo cuenta por `app://heritage/_sys/*` (ver
 * `electron/lib/downloads.mjs`); en un navegador no hay nada de esto y las funciones dicen que no.
 */

export type SavedState = 'completed' | 'cancelled' | 'interrupted' | 'progressing';

export interface SavedFile {
  id: number;
  name: string;
  /** Dónde se guardó (solo si terminó bien). */
  path: string | null;
  state: SavedState;
  at: number;
}

/** ¿Es la aplicación de escritorio? (La página se sirve desde `app://heritage/`.) */
export const isDesktopShell = (): boolean => typeof location !== 'undefined' && location.protocol === 'app:';

async function json<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, init);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Un identificador de lo último que se guardó: lo que termine después es lo que se pide. `null` si no hay escritorio. */
export async function downloadMark(): Promise<number | null> {
  if (!isDesktopShell()) return null;
  const r = await json<{ seq: number }>('/_sys/downloads?after=0&wait=0');
  return r ? r.seq : null;
}

/** La primera descarga que termine después de `mark` (con su ruta), esperando como mucho `waitMs`. */
export async function awaitDownload(mark: number, waitMs: number): Promise<SavedFile | null> {
  const r = await json<{ items: SavedFile[] }>(`/_sys/downloads?after=${mark}&wait=${Math.round(waitMs)}`);
  return r?.items[0] ?? null;
}

async function post(route: 'reveal' | 'open', path: string): Promise<boolean> {
  const r = await json<{ ok: boolean }>(`/_sys/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) });
  return r?.ok === true;
}

/**
 * «Abrir archivo…» en el escritorio: el sistema pide el archivo y el proceso principal lo abre como al hacer doble
 * clic, leyendo las imágenes que están junto a él (la página no puede ver esa carpeta). Devuelve `false` si se
 * canceló o no se pudo.
 */
export async function chooseAndOpenPlanner(): Promise<boolean> {
  const r = await json<{ ok: boolean; cancelled: boolean }>('/_sys/open-planner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  return r?.ok === true && !r.cancelled;
}

/** Muestra el archivo en su carpeta (solo uno que la aplicación guardó). */
export const revealFile = (path: string): Promise<boolean> => post('reveal', path);

/** Abre el archivo con el programa del sistema (solo uno que la aplicación guardó). */
export const openFile = (path: string): Promise<boolean> => post('open', path);
