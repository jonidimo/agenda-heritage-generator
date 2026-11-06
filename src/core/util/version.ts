/**
 * Versiones de la aplicación («2.4.0»): para saber si un archivo lo guardó una versión más nueva que
 * la que lo abre (y avisar que guardar puede perder lo que esta no entiende).
 */

/** Los números de una versión `mayor.menor.parche` (un sufijo como `-beta.1` se ignora); `null` si no lo es. */
export function versionParts(v: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** ¿`written` es una versión posterior a `current`? Una versión que no se entiende no es posterior. */
export function isNewerVersion(written: string, current: string): boolean {
  const a = versionParts(written);
  const b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}
