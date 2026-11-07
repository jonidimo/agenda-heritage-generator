/**
 * Persistencia local con IndexedDB (idb-keyval): diseños, recursos gráficos y
 * fuentes del usuario. Todo queda en el dispositivo; nada se sube a ningún
 * servidor. Exportar/importar `.agenda.json` permite llevar el trabajo a otra
 * computadora o teléfono.
 */
import { droppedUserFonts, parseDesign, UserThemeZ, type Design, type UserTheme } from '@core/design/schema';
import { facesForDesign, fromBase64, toBase64 } from '@core/resources';
import type { FontSpec } from '@core/text/fonts';
import { createStore, del, get, keys, set } from 'idb-keyval';

const designs = createStore('agenda-studio', 'designs');
const assets = createStore('agenda-studio-assets', 'assets');
const fonts = createStore('agenda-studio-fonts', 'fonts');
const templates = createStore('agenda-studio-templates', 'templates');
const themes = createStore('agenda-studio-themes', 'themes');

/** Temas propios (estilos completos con nombre), validados al leerlos. */
export async function listThemes(): Promise<UserTheme[]> {
  return safe(async () => {
    const out: UserTheme[] = [];
    for (const k of await keys(themes)) {
      const r = UserThemeZ.safeParse(await get(k, themes));
      if (r.success) out.push(r.data);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

export async function saveTheme(t: UserTheme): Promise<void> {
  await safe(() => set(t.id, t, themes), undefined);
}

export async function deleteTheme(id: string): Promise<void> {
  await safe(() => del(id, themes), undefined);
}

/** Plantilla propia: una agenda guardada como punto de partida para otras (otro año, otra persona). */
export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  design: Design;
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  return safe(async () => {
    const out: TemplateRecord[] = [];
    for (const k of await keys(templates)) {
      const raw = await get<TemplateRecord>(k, templates);
      if (!raw) continue;
      try {
        out.push({ ...raw, design: parseDesign(raw.design) });
      } catch {
        /* una plantilla que no valida no se muestra */
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

export async function saveTemplate(t: TemplateRecord): Promise<void> {
  await safe(() => set(t.id, t, templates), undefined);
}

export async function deleteTemplate(id: string): Promise<void> {
  await safe(() => del(id, templates), undefined);
}

export interface DesignMeta {
  id: string;
  name: string;
  year: number;
  updatedAt: string;
}

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

export async function listDesigns(): Promise<DesignMeta[]> {
  return safe(async () => {
    const ks = await keys(designs);
    const out: DesignMeta[] = [];
    for (const k of ks) {
      const d = await get<Design>(k, designs);
      if (d) out.push({ id: d.id, name: d.name, year: d.calendar.year, updatedAt: d.updatedAt });
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, []);
}

/** Lee una agenda guardada. Si no existe devuelve null; si no se puede validar, lanza un error con el motivo. */
export async function loadDesign(id: string): Promise<Design | null> {
  const raw = await safe(() => get<unknown>(id, designs), undefined);
  return raw ? parseDesign(raw) : null;
}

export async function saveDesign(d: Design): Promise<void> {
  await safe(() => set(d.id, d, designs), undefined);
}

export async function deleteDesign(id: string): Promise<void> {
  await safe(() => del(id, designs), undefined);
}

export async function saveAsset(id: string, bytes: Uint8Array): Promise<void> {
  await safe(() => set(id, bytes, assets), undefined);
}

/**
 * Borra los bytes de imágenes que ninguna agenda guardada usa. Se llama al abrir la
 * aplicación, antes de abrir una agenda (quitar una imagen no la borra al instante:
 * así se puede deshacer y la agenda del año anterior la conserva).
 */
export async function collectUnusedAssets(): Promise<number> {
  return safe(async () => {
    const used = new Set<string>();
    for (const k of await keys(designs)) {
      const d = await get<{ assets?: Array<{ id?: string }> }>(k, designs);
      for (const a of d?.assets ?? []) if (a?.id) used.add(a.id);
    }
    // Las imágenes de las plantillas y de los temas propios también se conservan.
    for (const k of await keys(templates)) {
      const t = await get<{ design?: { assets?: Array<{ id?: string }> } }>(k, templates);
      for (const a of t?.design?.assets ?? []) if (a?.id) used.add(a.id);
    }
    for (const k of await keys(themes)) {
      const t = await get<{ assets?: Array<{ id?: string }> }>(k, themes);
      for (const a of t?.assets ?? []) if (a?.id) used.add(a.id);
    }
    let removed = 0;
    for (const k of await keys(assets)) {
      if (used.has(String(k))) continue;
      await del(k, assets);
      removed++;
    }
    return removed;
  }, 0);
}

export async function deleteAsset(id: string): Promise<void> {
  await safe(() => del(id, assets), undefined);
}

export async function listUserAssets(): Promise<Array<{ id: string; bytes: Uint8Array }>> {
  return safe(async () => {
    const out: Array<{ id: string; bytes: Uint8Array }> = [];
    for (const k of await keys(assets)) {
      const b = await get<Uint8Array>(k, assets);
      if (b) out.push({ id: String(k), bytes: b });
    }
    return out;
  }, []);
}

export async function saveUserFont(id: string, bytes: Uint8Array, spec: Partial<FontSpec>): Promise<void> {
  await safe(() => set(id, { bytes, spec }, fonts), undefined);
}

export async function deleteUserFont(id: string): Promise<void> {
  await safe(() => del(id, fonts), undefined);
}

export async function listUserFonts(): Promise<Array<{ id: string; bytes: Uint8Array; spec: Partial<FontSpec> }>> {
  return safe(async () => {
    const out: Array<{ id: string; bytes: Uint8Array; spec: Partial<FontSpec> }> = [];
    for (const k of await keys(fonts)) {
      const v = await get<{ bytes: Uint8Array; spec: Partial<FontSpec> }>(k, fonts);
      if (v) out.push({ id: String(k), ...v });
    }
    return out;
  }, []);
}

/** Las fuentes subidas que la agenda usa (por familia: en sus tipos de texto, sus textos propios o como reserva). */
export function fontsUsedBy(d: Design, userFonts: ReadonlyMap<string, { bytes: Uint8Array; spec: FontSpec }>): Array<{ id: string; spec: FontSpec; data: string }> {
  const families = new Set(facesForDesign(d).map((f) => f.family));
  return [...userFonts.entries()].filter(([, f]) => families.has(f.spec.family)).map(([id, f]) => ({ id, spec: f.spec, data: toBase64(f.bytes) }));
}

/**
 * Archivo `.agenda.json` autocontenido: sus imágenes y las fuentes subidas que usa, en base64 (las
 * demás fuentes de este equipo no viajan).
 */
export async function exportDesignFile(d: Design, assetBytes: ReadonlyMap<string, Uint8Array>, userFonts: ReadonlyMap<string, { bytes: Uint8Array; spec: FontSpec }>): Promise<Blob> {
  const withData = {
    ...d,
    writtenBy: __APP_VERSION__,
    assets: d.assets.map((a) => (a.builtin ? a : { ...a, data: assetBytes.get(a.id) ? toBase64(assetBytes.get(a.id)!) : (a.data ?? null) })),
    userFonts: fontsUsedBy(d, userFonts),
  };
  return new Blob([JSON.stringify(withData, null, 2)], { type: 'application/json' });
}

export async function importDesignFile(text: string): ReturnType<typeof importDesignData> {
  return importDesignData(JSON.parse(text));
}

/** Como `importDesignFile`, a partir del objeto ya leído (archivos de plantilla y copias de seguridad). */
export async function importDesignData(data: unknown): Promise<{ design: Design; assets: Array<{ id: string; bytes: Uint8Array }>; fonts: Array<{ id: string; bytes: Uint8Array; spec: Partial<FontSpec> }>; droppedFonts: number }> {
  const design = parseDesign(data);
  const assetsOut: Array<{ id: string; bytes: Uint8Array }> = [];
  for (const a of design.assets) if (a.data) assetsOut.push({ id: a.id, bytes: fromBase64(a.data) });
  // Las fuentes ya validadas por el esquema (una que no lo es no entra).
  const fontsOut = (design.userFonts ?? []).map((f) => ({ id: f.id, spec: f.spec, bytes: fromBase64(f.data) }));
  // Los bytes quedan en IndexedDB; el diseño no repite el base64 (ni de las imágenes ni de las fuentes).
  const clean = parseDesign({ ...design, assets: design.assets.map((a) => ({ ...a, data: null })), userFonts: undefined });
  delete clean.userFonts;
  return { design: clean, assets: assetsOut, fonts: fontsOut, droppedFonts: droppedUserFonts(data).length };
}
