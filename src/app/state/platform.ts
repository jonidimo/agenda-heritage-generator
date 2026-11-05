/**
 * Dónde guarda sus datos la aplicación de escritorio, para mostrarlo en «Acerca de». La página
 * corre sin acceso al sistema (sin Node ni preload), así que la plataforma sale del agente de
 * usuario; las carpetas son las que fija `electron/desktop.mjs` (`userData`).
 */

export type DesktopPlatform = 'windows' | 'mac' | 'linux';

/** Carpeta de datos de la aplicación de escritorio en cada sistema (agendas, imágenes, fuentes y ajustes). */
export const DATA_FOLDERS: Readonly<Record<DesktopPlatform, string>> = {
  windows: '%APPDATA%\\Heritage Studio',
  mac: '~/Library/Application Support/Heritage Studio',
  linux: '~/.config/Heritage Studio',
};

/** ¿Es la aplicación de escritorio (Electron) y no un navegador? */
export function isDesktopApp(userAgent: string): boolean {
  return /\bElectron\//.test(userAgent);
}

/** El sistema operativo del agente de usuario, o `null` si no es uno de escritorio (un teléfono, p. ej.). */
export function detectPlatform(userAgent: string): DesktopPlatform | null {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return null;
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  if (/Linux|X11/i.test(userAgent)) return 'linux';
  return null;
}

/** Carpeta de datos de la aplicación de escritorio en este equipo (`null` en un navegador). */
export function dataFolderFor(userAgent: string): string | null {
  if (!isDesktopApp(userAgent)) return null;
  const platform = detectPlatform(userAgent);
  return platform ? DATA_FOLDERS[platform] : null;
}
