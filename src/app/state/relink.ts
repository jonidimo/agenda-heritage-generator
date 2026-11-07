/**
 * «Buscar la carpeta de las imágenes»: una agenda que guarda sus imágenes por ruta (`assets[].path`, como la que
 * arma un modelo de lenguaje) no puede leerlas sola en la aplicación web. La persona elige la carpeta, cada
 * imagen se busca entre sus archivos y los bytes se guardan en este equipo, como una subida: desde ahí la
 * agenda se abre sola, y al guardarla las lleva adentro.
 */
import { rasterInfo } from '@core/assets/image';
import { ASSET_MAX_BYTES } from '@core/assets/prepare';
import { matchRelinkFiles, type RelinkFile } from '@core/assets/relink';
import { assetInfoFromBytes } from '@core/resources';
import { ASSET_EXTENSION, bytesMatchExtension } from '@core/util/relpath';
import { sha256Hex } from '@core/util/digest';
import { plural } from '../i18n/ui';
import { saveAsset } from './persist';
import { resources } from './resources';
import { useStore } from './store';
import { tNow } from './tNow';

/** Hasta dónde se baja y cuántos archivos se miran: una carpeta enorme no tiene por qué colgar la ventana. */
const MAX_DEPTH = 8;
const MAX_FILES = 5000;

/** Un archivo de la carpeta elegida: se lee solo si hace falta. */
interface FolderFile extends RelinkFile {
  read(): Promise<File>;
}

/** Lo que usamos del selector de carpetas del navegador (Chrome, Edge y la aplicación de escritorio). */
interface DirectoryHandle {
  kind: 'directory';
  values(): AsyncIterable<DirectoryHandle | FileHandleLike>;
  name: string;
}
interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (opts?: { mode?: 'read' }) => Promise<DirectoryHandle> };

const isAbort = (e: unknown): boolean => (e as DOMException | undefined)?.name === 'AbortError';
/** Las imágenes y PDF que una agenda puede pedir por ruta (no las fuentes: acá no se reencuentran). */
const WANTED = ASSET_EXTENSION;

async function walk(dir: DirectoryHandle, prefix: string, depth: number, out: FolderFile[]): Promise<void> {
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'directory') {
      if (depth < MAX_DEPTH) await walk(entry, `${prefix}${entry.name}/`, depth + 1, out);
    } else if (WANTED.test(entry.name)) {
      out.push({ path: `${prefix}${entry.name}`, name: entry.name, read: () => entry.getFile() });
    }
  }
}

/** Pide la carpeta y lista sus archivos; `null` si la persona canceló. */
async function pickFolder(): Promise<FolderFile[] | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (picker) {
    try {
      const root = await picker.call(window, { mode: 'read' });
      const out: FolderFile[] = [];
      await walk(root, '', 0, out);
      return out;
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  // Sin selector de carpetas (Firefox, Safari): el campo de archivos con carpeta entera.
  const files = await pickFolderInput();
  if (files === null) return null;
  return files
    .filter((f) => WANTED.test(f.name))
    .slice(0, MAX_FILES)
    .map((f) => {
      // «carpeta/sub/a.png» → «sub/a.png»: la ruta empieza adentro de la carpeta elegida.
      const rel = f.webkitRelativePath || f.name;
      return { path: rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel, name: f.name, read: () => Promise.resolve(f) };
    });
}

function pickFolderInput(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Cuántas imágenes de la agenda abierta están por ruta y no se pueden leer desde acá. */
export function unlinkedAssets(): Array<{ id: string; name: string; path: string }> {
  const design = useStore.getState().design;
  if (!design) return [];
  return design.assets.flatMap((a) => (a.path && !a.builtin && !resources.assetBytes.has(a.id) ? [{ id: a.id, name: a.name, path: a.path }] : []));
}

/** Pide la carpeta de las imágenes y guarda las que encuentra; avisa cuántas quedaron y cuántas faltan. */
export async function relinkAssets(): Promise<void> {
  const { setNotice } = useStore.getState();
  const wanted = unlinkedAssets();
  if (wanted.length === 0) {
    setNotice(tNow('assets.relinkNone'));
    return;
  }
  const designId = useStore.getState().design?.id;
  let folder: FolderFile[] | null;
  try {
    folder = await pickFolder();
  } catch (e) {
    setNotice(`${tNow('file.error')} ${(e as Error).message}`);
    return;
  }
  if (folder === null) return;
  const { matched, missing } = matchRelinkFiles(wanted, folder);
  const loaded: Array<{ id: string; bytes: Uint8Array; info: Awaited<ReturnType<typeof assetInfoFromBytes>>; hash: string }> = [];
  const failed = new Set<string>(missing);
  const design = useStore.getState().design;
  for (const m of matched) {
    const ref = design?.assets.find((a) => a.id === m.id);
    try {
      if (!ref) continue;
      const file = await m.file.read();
      if (file.size > ASSET_MAX_BYTES) throw new Error('too large');
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Lo que dice la extensión y lo que la agenda espera de ese recurso: una imagen no puede ser otra cosa.
      if (!bytesMatchExtension(m.file.name, bytes) || (ref.kind === 'raster' && !rasterInfo(bytes))) throw new Error('not the expected file');
      loaded.push({ id: m.id, bytes, info: await assetInfoFromBytes(ref, bytes), hash: await sha256Hex(bytes) });
    } catch {
      failed.add(m.id);
    }
  }
  // Mientras se leía, la persona pudo abrir otra agenda: a esa no se le agrega nada.
  if (useStore.getState().design?.id !== designId) return;
  for (const l of loaded) {
    resources.assetBytes.set(l.id, l.bytes);
    resources.assetInfos.set(l.id, l.info);
    resources.assetHashes.set(l.id, l.hash);
    await saveAsset(l.id, l.bytes);
  }
  if (loaded.length > 0) {
    useStore.getState().update((d) => {
      for (const l of loaded) {
        const a = d.assets.find((x) => x.id === l.id);
        if (!a) continue;
        a.width = l.info.width;
        a.height = l.info.height;
        if (l.info.pages) a.pages = l.info.pages;
        // Los bytes ya están en esta agenda: la ruta no apunta a nada que se pueda leer desde acá.
        a.path = null;
      }
    }, 'relink');
    resources.bump();
    useStore.getState().bumpResources(resources.version);
  }
  const left = wanted.filter((a) => failed.has(a.id));
  if (left.length === 0) setNotice(plural(tNow, 'assets.relinked', loaded.length));
  else
    setNotice(
      `${tNow('assets.relinkedSome', { n: loaded.length, missing: left.length, name: left[0]!.name, path: left[0]!.path })}`,
      { label: tNow('assets.relink'), run: () => void relinkAssets() },
    );
}

