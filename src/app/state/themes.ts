/**
 * Temas propios: guardar el estilo completo de la agenda abierta (tema base, comodidad, letras,
 * colores, líneas y ornamentos) con un nombre, aplicarlo a otra agenda, y exportarlo o importarlo
 * como archivo `.tema.json` (con las imágenes de los ornamentos adentro).
 */
import { UserThemeZ, type AssetRef, type Design, type UserTheme } from '@core/design/schema';
import { THEMES, themeFaces, resolveTheme } from '@core/design/themes';
import { assetInfoFromBytes, fromBase64, toBase64 } from '@core/resources';
import { newId } from '@core/util/hash';
import { download, fileBase } from './exporter';
import { saveAsset, saveTheme } from './persist';
import { resources } from './resources';
import { useStore } from './store';
import { pickFiles } from './uploads';

const FILE_KIND = 'heritage-theme';

/** Imágenes que usan los ornamentos de unos ajustes (`asset:<id>`). */
export function themeAssetIds(tokens: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      const m = /^asset:(.+)$/.exec(v);
      if (m) ids.add(m[1]!);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(tokens);
  return [...ids];
}

/** Guarda el estilo de la agenda como tema propio. */
export async function saveCurrentAsTheme(design: Design, name: string, description = ''): Promise<UserTheme> {
  const used = new Set(themeAssetIds(design.theme.tokens));
  const theme = UserThemeZ.parse({
    id: newId('tema'),
    name: name.trim().slice(0, 80) || design.name,
    description,
    base: design.theme.id,
    comfort: design.theme.comfort,
    tokens: structuredClone(design.theme.tokens),
    assets: design.assets.filter((a) => used.has(a.id)).map((a) => ({ ...a, data: null })),
  });
  await saveTheme(theme);
  return theme;
}

/** Aplica un tema propio a la agenda abierta (en un paso de deshacer). */
export function applyUserTheme(theme: UserTheme): void {
  const st = useStore.getState();
  st.update((d) => {
    d.theme.id = THEMES[theme.base] ? theme.base : 'heritage';
    d.theme.comfort = theme.comfort;
    d.theme.tokens = structuredClone(theme.tokens);
    for (const a of theme.assets) if (!d.assets.some((x) => x.id === a.id)) d.assets.push({ ...a, data: null });
  });
  // Las letras del tema se cargan para la vista previa y el PDF.
  const resolved = resolveTheme(THEMES[theme.base] ? theme.base : 'heritage', theme.tokens, theme.comfort);
  for (const f of new Set(themeFaces(resolved).map((x) => x.family))) void resources.ensureFamily(f);
}

/** Exporta un tema propio como archivo, con las imágenes de sus ornamentos. */
export function exportThemeFile(theme: UserTheme): void {
  const assets = theme.assets.map((a) => {
    const bytes = resources.assetBytes.get(a.id);
    return { ...a, data: bytes ? toBase64(bytes) : null };
  });
  const file = { kind: FILE_KIND, version: 1, theme: { ...theme, assets } };
  download(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${fileBase(theme)}.tema.json`, 'application/json');
}

/** Importa un archivo `.tema.json`: lo valida, guarda sus imágenes y lo agrega a los temas propios. */
export async function importThemeFile(): Promise<UserTheme | null> {
  const [file] = await pickFiles('.json,application/json', false);
  if (!file) return null;
  const raw = JSON.parse(await file.text()) as { kind?: unknown; theme?: unknown };
  if (raw.kind !== FILE_KIND) throw new Error('not-a-theme');
  const parsed = UserThemeZ.parse(raw.theme);
  // Ids nuevos: un tema importado nunca pisa uno existente.
  const theme: UserTheme = { ...parsed, id: newId('tema'), assets: [] };
  const assets: AssetRef[] = [];
  for (const a of parsed.assets) {
    if (!a.data) continue;
    const bytes = fromBase64(a.data);
    const info = await assetInfoFromBytes({ ...a, data: null }, bytes);
    resources.assetBytes.set(a.id, bytes);
    resources.assetInfos.set(a.id, info);
    await saveAsset(a.id, bytes);
    assets.push({ ...a, data: null });
  }
  theme.assets = assets;
  await saveTheme(theme);
  resources.bump();
  useStore.getState().bumpResources(resources.version);
  return theme;
}
