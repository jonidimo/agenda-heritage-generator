/**
 * Archivos: guardar y abrir agendas como `.agenda.json` (con sus imágenes y fuentes adentro),
 * plantillas propias y copias de seguridad de todo. Donde el navegador lo permite (Chrome,
 * Edge, la aplicación de escritorio) se elige dónde guardar y «Guardar» vuelve a escribir el
 * mismo archivo; si no, el archivo se descarga.
 */
import { duplicateForYear } from '@core/design/defaults';
import { droppedUserFonts, parseDesign, UserFontsZ, type Design } from '@core/design/schema';
import { fromBase64, toBase64 } from '@core/resources';
import { newId } from '@core/util/hash';
import type { FontSpec } from '@core/text/fonts';
import { isNewerVersion } from '@core/util/version';
import { chooseAndOpenPlanner, isDesktopShell } from './desktopBridge';
import { download, fileBase } from './exporter';
import {
  exportDesignFile,
  importDesignData,
  listDesigns,
  listTemplates,
  loadDesign,
  saveAsset,
  saveDesign,
  saveTemplate,
  type TemplateRecord,
} from './persist';
import { addUserFont } from './fonts';
import { resources } from './resources';
import { useStore } from './store';
import { tNow } from './tNow';
import { pickFiles } from './uploads';

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandle[]>;
};

const FILE_TYPES = [{ description: 'Heritage Studio', accept: { 'application/json': ['.json'] } }];
/** Archivo elegido para cada agenda en esta sesión («Guardar» lo vuelve a usar). */
const handles = new Map<string, FileHandle>();

const isAbort = (e: unknown): boolean => (e as DOMException | undefined)?.name === 'AbortError';

async function designJson(design: Design): Promise<unknown> {
  return JSON.parse(await (await exportDesignFile(design, resources.assetBytes, resources.userFontBytes)).text());
}

async function writeOrDownload(blob: Blob, suggested: string, key?: string, saveAs = true): Promise<{ status: 'saved' | 'downloaded' | 'cancelled'; name: string }> {
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    let h = !saveAs && key ? handles.get(key) : undefined;
    try {
      if (!h) {
        h = await w.showSaveFilePicker({ suggestedName: suggested, types: FILE_TYPES });
        if (key) handles.set(key, h);
      }
      const out = await h.createWritable();
      await out.write(blob);
      await out.close();
      return { status: 'saved', name: h.name };
    } catch (e) {
      if (isAbort(e)) return { status: 'cancelled', name: '' };
      throw e;
    }
  }
  download(blob, suggested, 'application/json');
  return { status: 'downloaded', name: suggested };
}

/** Guarda la agenda en un archivo (con «Guardar como» siempre se elige uno nuevo). */
export async function saveDesignToFile(design: Design, saveAs: boolean): Promise<{ status: 'saved' | 'downloaded' | 'cancelled'; name: string }> {
  const blob = await exportDesignFile(design, resources.assetBytes, resources.userFontBytes);
  return writeOrDownload(blob, `${fileBase(design)}.agenda.json`, design.id, saveAs);
}

/**
 * Guarda en este equipo las imágenes y fuentes que trae un archivo. Una fuente no pisa a la que este
 * equipo ya tenga con su familia, peso y estilo (otras agendas la usan): se queda la de acá y se avisa.
 * Una que no se puede leer no impide abrir el archivo (sus textos salen con la de reserva). Devuelve los
 * avisos para la persona.
 */
async function adopt(assets: Array<{ id: string; bytes: Uint8Array }>, fonts: Array<{ id: string; bytes: Uint8Array; spec: Partial<FontSpec> }>, dropped = 0): Promise<string[]> {
  for (const a of assets) {
    await saveAsset(a.id, a.bytes);
    resources.putAsset(a.id, a.bytes);
  }
  const notices: string[] = [];
  for (const fo of fonts) {
    try {
      const r = await addUserFont(fo.bytes, fo.spec, { id: fo.id, mode: 'keep' });
      if (r.status === 'kept') notices.push(tNow('file.fontKept', { family: r.family }));
    } catch (err) {
      notices.push(tNow('file.fontUnreadable', { family: fo.spec.family ?? fo.id, error: (err as Error).message }));
    }
  }
  if (dropped > 0) notices.push(tNow('file.fontsDropped', { n: dropped }));
  resources.bump();
  useStore.getState().bumpResources(resources.version);
  return notices;
}

/** Lo que se abrió; una agenda trae los avisos para la persona (se muestran después de abrirla). */
export type Imported =
  | { kind: 'design'; design: Design; notices: string[]; unread: number }
  | { kind: 'template'; template: TemplateRecord; notices: string[] }
  | { kind: 'backup'; designs: number; templates: number; notices: string[] };

async function importDesignObject(data: unknown): Promise<{ design: Design; notices: string[]; unread: number }> {
  const { design, assets, fonts, droppedFonts } = await importDesignData(data);
  // Una agenda que se abre de un archivo no hereda el archivo donde se guardó antes otra con la misma id («Guardar» no pisa ese).
  handles.delete(design.id);
  const adopted = await adopt(assets, fonts, droppedFonts);
  await saveDesign(design);
  const notices: string[] = [];
  // Guardado por una versión más nueva: lo que esta no entiende se descartó al abrirlo y se perdería al guardarlo (va primero).
  if (isNewerVersion(design.writtenBy, __APP_VERSION__)) notices.push(tNow('file.newerVersion', { name: design.name, version: design.writtenBy, current: __APP_VERSION__ }));
  // Imágenes guardadas junto al archivo (por ruta): desde acá no se puede leer esa carpeta.
  const unread = design.assets.filter((a) => a.path && !assets.some((x) => x.id === a.id));
  if (unread.length > 0) notices.push(tNow(unread.length === 1 ? 'file.pathAssetsOne' : 'file.pathAssets', { name: unread[0]!.name, path: unread[0]!.path ?? '', n: unread.length }));
  return { design, notices: [...notices, ...adopted], unread: unread.length };
}

async function importTemplateObject(raw: { id?: string; name?: string; description?: string; createdAt?: string; design: unknown }): Promise<{ template: TemplateRecord; notices: string[] }> {
  const { design, assets, fonts, droppedFonts } = await importDesignData(raw.design);
  const notices = await adopt(assets, fonts, droppedFonts);
  const tpl: TemplateRecord = { id: typeof raw.id === 'string' ? raw.id : newId('tpl'), name: String(raw.name ?? design.name), description: String(raw.description ?? ''), createdAt: String(raw.createdAt ?? new Date().toISOString()), design };
  await saveTemplate(tpl);
  return { template: tpl, notices };
}

/** Lee un archivo: una agenda, una plantilla o una copia de seguridad completa. */
export async function importText(text: string): Promise<Imported> {
  const raw = JSON.parse(text) as { kind?: string; designs?: unknown[]; templates?: unknown[]; userFonts?: unknown } & Record<string, unknown>;
  if (raw.kind === 'heritage-backup') {
    // Primero las fuentes de este equipo que viajan en la copia (también las que ninguna agenda usa).
    const all = UserFontsZ.safeParse(raw.userFonts ?? []);
    const fonts = all.success ? all.data.map((f) => ({ id: f.id, spec: f.spec, bytes: fromBase64(f.data) })) : [];
    const notices = await adopt([], fonts, droppedUserFonts(raw).length);
    let d = 0;
    let t = 0;
    for (const item of raw.designs ?? []) {
      notices.push(...(await importDesignObject(item)).notices);
      d++;
    }
    for (const item of raw.templates ?? []) {
      notices.push(...(await importTemplateObject(item as { design: unknown })).notices);
      t++;
    }
    return { kind: 'backup', designs: d, templates: t, notices: [...new Set(notices)] };
  }
  if (raw.kind === 'heritage-template') return { kind: 'template', ...(await importTemplateObject(raw as { design: unknown })) };
  return { kind: 'design', ...(await importDesignObject(raw)) };
}

/** Elige un archivo y lo abre (si es una agenda, «Guardar» vuelve a escribir en él). */
export async function openFile(): Promise<Imported | null> {
  // En el escritorio lo abre el proceso principal (con las imágenes que están junto al archivo): la agenda llega por `__heritageOpen`.
  if (isDesktopShell()) {
    const result = await chooseAndOpenPlanner();
    if (result === 'too-large') useStore.getState().setNotice(tNow('file.openTooLarge'));
    else if (result === 'unreadable') useStore.getState().setNotice(tNow('file.openUnreadable'));
    return null;
  }
  const w = window as PickerWindow;
  let file: File | undefined;
  let handle: FileHandle | undefined;
  if (w.showOpenFilePicker) {
    try {
      [handle] = await w.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
      file = await handle?.getFile();
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  } else [file] = await pickFiles('.json,application/json', false);
  if (!file) return null;
  const result = await importText(await file.text());
  if (result.kind === 'design' && handle) handles.set(result.design.id, handle);
  return result;
}

/** Guarda la agenda como plantilla propia (opcionalmente sin datos personales). */
export async function saveAsTemplate(design: Design, name: string, description: string, stripPersonal: boolean): Promise<TemplateRecord> {
  const base = stripPersonal
    ? {
        ...design,
        persona: { ...design.persona, name: '', dedication: '' },
        personalDates: [],
        // Correos y teléfonos de los enlaces a mano son datos personales.
        links: { ...design.links, blocks: design.links.blocks.filter((l) => !(l.mode === 'url' && /^(mailto|tel):/i.test(l.url.trim()))) },
      }
    : design;
  const tpl: TemplateRecord = { id: newId('tpl'), name: name.trim() || design.name, description: description.trim(), createdAt: new Date().toISOString(), design: parseDesign({ ...base, id: newId('agenda') }) };
  await saveTemplate(tpl);
  return tpl;
}

/** Nueva agenda a partir de una plantilla propia: año, idioma, país y nombre nuevos. */
export function designFromTemplate(tpl: Design, o: { year: number; locale: string; country: string | null; name: string }): Design {
  const d = duplicateForYear(tpl, o.year);
  return parseDesign({ ...d, locale: o.locale, holidays: { ...d.holidays, country: o.country }, persona: { ...d.persona, ...(o.name.trim() ? { name: o.name.trim() } : {}) } });
}

/** Descarga una plantilla como archivo para compartirla o guardarla. */
export async function exportTemplateFile(tpl: TemplateRecord): Promise<void> {
  const body = { kind: 'heritage-template', version: 1, id: tpl.id, name: tpl.name, description: tpl.description, createdAt: tpl.createdAt, design: await designJson(tpl.design) };
  const slug = tpl.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'plantilla';
  await writeOrDownload(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }), `${slug}.plantilla.json`);
}

/** Copia de seguridad: todas las agendas y plantillas (con imágenes y fuentes) y todas las fuentes subidas, en un solo archivo. */
export async function exportBackup(): Promise<{ status: 'saved' | 'downloaded' | 'cancelled'; name: string; designs: number; templates: number }> {
  const designs: unknown[] = [];
  for (const m of await listDesigns()) {
    try {
      const d = await loadDesign(m.id);
      if (d) designs.push(await designJson(d));
    } catch {
      /* una agenda que no valida no frena la copia */
    }
  }
  const tpls = await listTemplates();
  const templates = await Promise.all(tpls.map(async (t) => ({ id: t.id, name: t.name, description: t.description, createdAt: t.createdAt, design: await designJson(t.design) })));
  // Todas las fuentes subidas a este equipo, aunque ninguna agenda las use ahora: la copia es de todo.
  const userFonts = [...resources.userFontBytes.entries()].map(([id, f]) => ({ id, spec: f.spec, data: toBase64(f.bytes) }));
  const body = { kind: 'heritage-backup', version: 1, createdAt: new Date().toISOString(), designs, templates, userFonts };
  const date = new Date().toISOString().slice(0, 10);
  const r = await writeOrDownload(new Blob([JSON.stringify(body)], { type: 'application/json' }), `heritage-copia-${date}.json`);
  return { ...r, designs: designs.length, templates: templates.length };
}
