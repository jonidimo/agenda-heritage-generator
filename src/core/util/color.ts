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

/**
 * El gris de un color con la misma luminosidad (pesos de Rec. 709 sobre los valores sRGB), para pasar un
 * dibujo a escala de grises. Un valor que no es `#rgb` o `#rrggbb` se devuelve igual.
 */
export function grayOf(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const h = Math.min(255, Math.max(0, y)).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/** La luminosidad de cada píxel RGBA (pesos de Rec. 709, como `grayOf`), con la transparencia intacta. */
export function grayPixels(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
}
