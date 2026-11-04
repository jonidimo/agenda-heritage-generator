/**
 * Archivos: guardar y abrir agendas como `.agenda.json` (con sus imágenes y fuentes adentro),
 * plantillas propias y copias de seguridad de todo. Donde el navegador lo permite (Chrome,
 * Edge, la aplicación de escritorio) se elige dónde guardar y «Guardar» vuelve a escribir el
 * mismo archivo; si no, el archivo se descarga.
 */
import { duplicateForYear } from '@core/design/defaults';
import { parseDesign, type Design } from '@core/design/schema';
import { newId } from '@core/util/hash';
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
  saveUserFont,
  type TemplateRecord,
} from './persist';
import { resources } from './resources';
import { useStore } from './store';
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

/** Bytes de imágenes y fuentes que trae un archivo: se guardan y quedan disponibles. */
async function adopt(assets: Array<{ id: string; bytes: Uint8Array }>, fonts: Array<{ id: string; bytes: Uint8Array; spec: Parameters<typeof saveUserFont>[2] }>): Promise<void> {
  for (const a of assets) {
    await saveAsset(a.id, a.bytes);
    resources.assetBytes.set(a.id, a.bytes);
  }
  for (const fo of fonts) {
    await saveUserFont(fo.id, fo.bytes, fo.spec);
    const face = resources.fonts.register(fo.bytes, { ...fo.spec, source: 'user', file: fo.id });
    resources.userFontBytes.set(fo.id, { bytes: fo.bytes, spec: { family: face.family, weight: face.weight, style: face.style } });
  }
  resources.bump();
  useStore.getState().bumpResources(resources.version);
}

export type Imported = { kind: 'design'; design: Design } | { kind: 'template'; template: TemplateRecord } | { kind: 'backup'; designs: number; templates: number };

async function importDesignObject(data: unknown): Promise<Design> {
  const { design, assets, fonts } = await importDesignData(data);
  await adopt(assets, fonts);
  await saveDesign(design);
  return design;
}

async function importTemplateObject(raw: { id?: string; name?: string; description?: string; createdAt?: string; design: unknown }): Promise<TemplateRecord> {
  const { design, assets, fonts } = await importDesignData(raw.design);
  await adopt(assets, fonts);
  const tpl: TemplateRecord = { id: typeof raw.id === 'string' ? raw.id : newId('tpl'), name: String(raw.name ?? design.name), description: String(raw.description ?? ''), createdAt: String(raw.createdAt ?? new Date().toISOString()), design };
  await saveTemplate(tpl);
  return tpl;
}

/** Lee un archivo: una agenda, una plantilla o una copia de seguridad completa. */
export async function importText(text: string): Promise<Imported> {
  const raw = JSON.parse(text) as { kind?: string; designs?: unknown[]; templates?: unknown[] } & Record<string, unknown>;
  if (raw.kind === 'heritage-backup') {
    let d = 0;
    let t = 0;
    for (const item of raw.designs ?? []) {
      await importDesignObject(item);
      d++;
    }
    for (const item of raw.templates ?? []) {
      await importTemplateObject(item as { design: unknown });
      t++;
    }
    return { kind: 'backup', designs: d, templates: t };
  }
  if (raw.kind === 'heritage-template') return { kind: 'template', template: await importTemplateObject(raw as { design: unknown }) };
  return { kind: 'design', design: await importDesignObject(raw) };
}

/** Elige un archivo y lo abre (si es una agenda, «Guardar» vuelve a escribir en él). */
export async function openFile(): Promise<Imported | null> {
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

/** Copia de seguridad: todas las agendas y plantillas (con imágenes y fuentes) en un solo archivo. */
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
  const body = { kind: 'heritage-backup', version: 1, createdAt: new Date().toISOString(), designs, templates };
  const date = new Date().toISOString().slice(0, 10);
  const r = await writeOrDownload(new Blob([JSON.stringify(body)], { type: 'application/json' }), `heritage-copia-${date}.json`);
  return { ...r, designs: designs.length, templates: templates.length };
}
