/**
 * Persistencia local con IndexedDB (idb-keyval): diseños, recursos gráficos y
 * fuentes del usuario. Todo queda en el dispositivo; nada se sube a ningún
 * servidor. Exportar/importar `.agenda.json` permite llevar el trabajo a otra
 * computadora o teléfono.
 */
import { parseDesign, type Design } from '@core/design/schema';
import { fromBase64, toBase64 } from '@core/resources';
import type { FontSpec } from '@core/text/fonts';
import { createStore, del, get, keys, set } from 'idb-keyval';

const designs = createStore('agenda-studio', 'designs');
const assets = createStore('agenda-studio-assets', 'assets');
const fonts = createStore('agenda-studio-fonts', 'fonts');

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

export async function loadDesign(id: string): Promise<Design | null> {
  return safe(async () => {
    const raw = await get<unknown>(id, designs);
    return raw ? parseDesign(raw) : null;
  }, null);
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

/** Archivo `.agenda.json` autocontenido (incluye imágenes y fuentes subidas en base64). */
export async function exportDesignFile(d: Design, assetBytes: ReadonlyMap<string, Uint8Array>, userFonts: ReadonlyMap<string, { bytes: Uint8Array; spec: FontSpec }>): Promise<Blob> {
  const withData = {
    ...d,
    assets: d.assets.map((a) => (a.builtin ? a : { ...a, data: assetBytes.get(a.id) ? toBase64(assetBytes.get(a.id)!) : (a.data ?? null) })),
    userFonts: [...userFonts.entries()].map(([id, f]) => ({ id, spec: f.spec, data: toBase64(f.bytes) })),
  };
  return new Blob([JSON.stringify(withData, null, 2)], { type: 'application/json' });
}

export async function importDesignFile(text: string): Promise<{ design: Design; assets: Array<{ id: string; bytes: Uint8Array }>; fonts: Array<{ id: string; bytes: Uint8Array; spec: Partial<FontSpec> }> }> {
  const raw = JSON.parse(text) as Record<string, unknown> & { userFonts?: Array<{ id: string; spec: Partial<FontSpec>; data: string }> };
  const design = parseDesign(raw);
  const assetsOut: Array<{ id: string; bytes: Uint8Array }> = [];
  for (const a of design.assets) if (a.data) assetsOut.push({ id: a.id, bytes: fromBase64(a.data) });
  const fontsOut = (raw.userFonts ?? []).map((f) => ({ id: f.id, spec: f.spec, bytes: fromBase64(f.data) }));
  // Los bytes quedan en IndexedDB; el diseño no repite el base64.
  const clean = parseDesign({ ...design, assets: design.assets.map((a) => ({ ...a, data: null })) });
  return { design: clean, assets: assetsOut, fonts: fontsOut };
}
