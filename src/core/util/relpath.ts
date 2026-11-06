/**
 * Rutas de imágenes guardadas junto al archivo de la agenda (`assets[].path`): siempre relativas a la
 * carpeta del `.agenda.json` y sin salir de ella. Las comprueba el esquema (un archivo con otra cosa la
 * descarta) y las vuelven a comprobar quienes leen el disco (Node y la aplicación de escritorio, que
 * además resuelven enlaces simbólicos): un archivo de agenda no puede hacer leer otros archivos.
 */

export const RELATIVE_PATH_MAX = 300;

/**
 * La misma regla como expresión regular (con la bandera `u`), para el esquema JSON: así la revisión de
 * un archivo dice qué ruta no vale en lugar de descartarla en silencio. Cada segmento: ni «.» ni «..»,
 * sin espacios en los bordes, sin «/», «\\», «:» ni caracteres de control.
 */
export const RELATIVE_PATH_PATTERN = '^(?:(?!\\.{1,2}(?:/|$))(?!\\s)[^/\\\\:\\p{Cc}]*[^/\\\\:\\p{Cc}\\s](?:/(?!$)|$))+$';

/**
 * ¿Es una ruta relativa que no sale de su carpeta? Segmentos separados por «/», sin «..», «.» ni vacíos;
 * sin barra inicial, sin «\» (Windows), sin «:» (unidades y esquemas como `file:` o `http:`) y sin
 * caracteres de control.
 */
export function isRelativeAssetPath(p: string): boolean {
  if (p.length === 0 || p.length > RELATIVE_PATH_MAX) return false;
  if (/[\\:\p{Cc}]/u.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..' && seg.trim() === seg);
}
