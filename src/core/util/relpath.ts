/**
 * Rutas de imágenes guardadas junto al archivo de la agenda (`assets[].path`): siempre relativas a la
 * carpeta del `.agenda.json` y sin salir de ella. Las comprueba el esquema (un archivo con otra cosa la
 * descarta) y las vuelven a comprobar quienes leen el disco (Node y la aplicación de escritorio, que
 * además resuelven enlaces simbólicos): un archivo de agenda no puede hacer leer otros archivos.
 */

export const RELATIVE_PATH_MAX = 300;

/**
 * La misma regla como expresión regular (con la bandera `u`), para el esquema JSON: así la revisión de
 * un archivo dice qué ruta no vale en lugar de descartarla en silencio. Cada segmento: sin «.» al
 * principio (ni «..», ni carpetas o archivos ocultos como `.ssh` o `.env`), sin espacios en los bordes,
 * sin «/», «\\», «:» ni caracteres de control; y el archivo, una imagen, un PDF o una fuente.
 */
export const RELATIVE_PATH_PATTERN = '^(?:(?!\\.)(?!\\s)[^/\\\\:\\p{Cc}]*[^/\\\\:\\p{Cc}\\s]/)*(?!\\.)(?!\\s)[^/\\\\:\\p{Cc}]*\\.(?:[Pp][Nn][Gg]|[Jj][Pp][Ee]?[Gg]|[Ss][Vv][Gg]|[Pp][Dd][Ff]|[Tt][Tt][Ff]|[Oo][Tt][Ff])$';

/**
 * ¿Es una ruta relativa que no sale de su carpeta, a una imagen, un PDF o una fuente? Segmentos separados
 * por «/», no vacíos ni empezados con «.» (ni «..» ni ocultos);
 * sin barra inicial, sin «\» (Windows), sin «:» (unidades y esquemas como `file:` o `http:`) y sin
 * caracteres de control.
 */
export function isRelativeAssetPath(p: string): boolean {
  if (p.length === 0 || p.length > RELATIVE_PATH_MAX) return false;
  if (/[\\:\p{Cc}]/u.test(p)) return false;
  if (!ASSET_EXTENSION.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && !seg.startsWith('.') && seg.trim() === seg);
}

/** Las extensiones de lo que una agenda puede leer de su carpeta: imágenes, PDF y fuentes. */
export const ASSET_EXTENSION = /\.(?:png|jpe?g|svg|pdf|ttf|otf)$/i;

/**
 * ¿Estos bytes son de verdad lo que dice la extensión? (Una agenda no puede hacer leer un archivo
 * cualquiera renombrándolo.) PNG, JPEG, PDF y fuentes por su firma; SVG, un texto que empieza con «<»
 * y tiene un elemento `<svg` al principio.
 */
export function bytesMatchExtension(path: string, b: Uint8Array): boolean {
  const ext = (/\.([a-z]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
  const starts = (...sig: number[]): boolean => sig.every((v, i) => b[i] === v);
  switch (ext) {
    case 'png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpg':
    case 'jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'pdf':
      return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
    case 'ttf':
    case 'otf':
      return starts(0x00, 0x01, 0x00, 0x00) || starts(0x4f, 0x54, 0x54, 0x4f) || starts(0x74, 0x72, 0x75, 0x65);
    case 'svg': {
      const head = new TextDecoder().decode(b.subarray(0, 4096)).replace(/^\uFEFF/, '').trimStart();
      return head.startsWith('<') && /<svg[\s>]/i.test(head);
    }
    default:
      return false;
  }
}
