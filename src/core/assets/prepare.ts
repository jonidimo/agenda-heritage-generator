/**
 * Qué se hace con una imagen al subirla a la agenda: un tope de lado y de peso (una foto de celular de
 * 12 megapíxeles no hace falta entera en una agenda de mano), qué formato conviene al volver a
 * guardarla y cómo se llama después. Las decisiones están acá, sin navegador, para poder probarlas.
 */

/** Lado mayor, en píxeles, con que se guarda una imagen: 4000 px cubren una hoja A4 a unos 340 ppp. */
export const ASSET_MAX_SIDE_PX = 4000;

/** Lo más que pesa un archivo de imagen, PDF o SVG que se sube (igual que lo que se lee de una carpeta). */
export const ASSET_MAX_BYTES = 64 * 1024 * 1024;

/** Calidad JPEG al volver a guardar una imagen que no tenía ese formato, o que se achicó. */
export const UPLOAD_JPEG_QUALITY = 0.92;

/** El tamaño que tiene que tener una imagen de `w`×`h` para que su lado mayor no pase de `max`, o `null` si ya entra. */
export function fitWithin(w: number, h: number, max = ASSET_MAX_SIDE_PX): { w: number; h: number } | null {
  const longest = Math.max(w, h);
  if (!(longest > max) || w < 1 || h < 1) return null;
  const scale = max / longest;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Los formatos con los que un navegador convierte lo que sube la persona. `png`: se guarda sin pérdida; `jpeg`: es una foto. */
export function outputFormatFor(sourceMime: string, hasAlpha: boolean): 'png' | 'jpeg' {
  if (hasAlpha) return 'png';
  // Un GIF, o un PNG, es casi siempre un dibujo plano o una captura: pasarlo a JPEG lo mancha. Las fotos (WebP, AVIF, HEIC, JPEG) no.
  return sourceMime === 'image/png' || sourceMime === 'image/gif' || sourceMime === 'image/svg+xml' ? 'png' : 'jpeg';
}

/** El nombre del archivo con la extensión del formato nuevo («foto.webp» → «foto.jpg»). */
export function renameForFormat(name: string, format: 'png' | 'jpeg'): string {
  const ext = format === 'png' ? 'png' : 'jpg';
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '');
  return `${base || 'imagen'}.${ext}`;
}
