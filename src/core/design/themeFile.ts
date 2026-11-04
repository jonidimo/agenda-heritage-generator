/**
 * Tema propio y su archivo `.tema.json`: el estilo completo de una agenda (tema base, comodidad,
 * letras, colores, líneas y ornamentos) con un nombre, y las imágenes de sus ornamentos adentro.
 * Lo arman y lo leen la aplicación y el servidor MCP.
 */
import { newId } from '../util/hash';
import { UserThemeZ, type Design, type UserTheme } from './schema';

export const THEME_FILE_KIND = 'heritage-theme';
export const THEME_FILE_VERSION = 1;

export interface ThemeFile {
  kind: typeof THEME_FILE_KIND;
  version: number;
  theme: UserTheme;
}

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

/** El estilo de una agenda como tema propio (las imágenes van como referencias, sin datos). */
export function themeFromDesign(design: Design, name: string, description = ''): UserTheme {
  const used = new Set(themeAssetIds(design.theme.tokens));
  return UserThemeZ.parse({
    id: newId('tema'),
    name: name.trim().slice(0, 80) || design.name,
    description,
    base: design.theme.id,
    comfort: design.theme.comfort,
    tokens: structuredClone(design.theme.tokens),
    assets: design.assets.filter((a) => used.has(a.id)).map((a) => ({ ...a, data: null })),
  });
}

/** El archivo de un tema, con los datos (base64) de las imágenes que se tengan. */
export function themeFile(theme: UserTheme, assetData: (id: string) => string | null): ThemeFile {
  return { kind: THEME_FILE_KIND, version: THEME_FILE_VERSION, theme: { ...theme, assets: theme.assets.map((a) => ({ ...a, data: assetData(a.id) })) } };
}

/** Lee un archivo de tema ya convertido de JSON; un archivo que no es un tema da error. */
export function parseThemeFile(raw: unknown): UserTheme {
  if ((raw as { kind?: unknown } | null)?.kind !== THEME_FILE_KIND) throw new Error('not-a-theme');
  return UserThemeZ.parse((raw as { theme?: unknown }).theme);
}
