/**
 * Nombres de archivo que sirven en Windows, macOS y Linux. Solo letras, cifras y guiones (sin
 * `< > : " / \ | ? *`, que Windows prohíbe, ni `:` de macOS, ni `/` de todos), nunca un nombre que
 * Windows reserva para dispositivos (CON, PRN, AUX, NUL, COM1…9, LPT1…9, aunque lleve extensión), y
 * corto: Linux y macOS admiten 255 bytes por nombre, y con letras no latinas (3 bytes en UTF-8) más
 * la extensión y los agregados («-imprimir.pdf») eso se alcanza rápido.
 */

/** Bytes (UTF-8) que se dejan para la base del nombre: sobra lugar para extensión y agregados. */
export const FILE_BASE_MAX_BYTES = 120;

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** Nombre de archivo a partir del nombre de una agenda o un tema: sin tildes ni símbolos («Mi agenda 2027» → «mi-agenda-2027»). */
export function fileBase(item: { name: string }): string {
  let base = item.name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .normalize('NFC');
  // Recortado por letras enteras (nunca a mitad de un carácter) hasta entrar en el tope de bytes.
  const enc = new TextEncoder();
  if (enc.encode(base).length > FILE_BASE_MAX_BYTES) {
    let out = '';
    for (const ch of base) {
      if (enc.encode(out + ch).length > FILE_BASE_MAX_BYTES) break;
      out += ch;
    }
    base = out.replace(/-+$/, '');
  }
  if (!base) return 'agenda';
  return WINDOWS_RESERVED.test(base) ? `${base}-agenda` : base;
}
