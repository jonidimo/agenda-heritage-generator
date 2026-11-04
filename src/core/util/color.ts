/**
 * Colores seguros. Todo color que llega desde un archivo (tema, elementos propios, SVG
 * importado) se normaliza a `#rrggbb`: así nunca se puede colar texto en un atributo de la
 * vista previa ni un valor que el PDF no entienda.
 */

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
};

/**
 * Patrón (esquema JSON) de lo que acepta `normalizeColor`: #rgb o #rrggbb, o un nombre conocido,
 * sin importar mayúsculas ni espacios alrededor.
 */
export const COLOR_PATTERN = (() => {
  const anyCase = (w: string): string => [...w].map((c) => `[${c}${c.toUpperCase()}]`).join('');
  return `^\\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|${Object.keys(NAMED).map(anyCase).join('|')})\\s*$`;
})();

/** `#rrggbb` si el valor es un color hexadecimal (3 o 6 cifras) o un nombre conocido; si no, null. */
export function normalizeColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return NAMED[s] ?? null;
}

export function safeColor(v: unknown, fallback: string): string {
  return normalizeColor(v) ?? fallback;
}
