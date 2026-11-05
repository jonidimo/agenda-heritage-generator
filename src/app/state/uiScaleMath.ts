/**
 * Cuentas del tamaño de la interfaz, sin React ni navegador (ver `uiScale.ts`, que lo aplica).
 */

/** Ancho de maquetación desde el que se usa el diseño de escritorio con paneles laterales (`md:` de Tailwind). */
export const DESKTOP_BREAKPOINT = 768;
/** Ancho de maquetación desde el que el panel del elemento es una columna fija y no una hoja inferior. */
export const WIDE_BREAKPOINT = 1024;

/**
 * Zoom que se aplica de verdad. Por encima de 100 % no puede ser tanto como para que la
 * maquetación quede más angosta que el ancho de escritorio (la ventana se vería como un teléfono
 * aunque las media queries digan que no); por debajo de 100 % no hay límite.
 */
export function effectiveUiScale(scale: number, viewportWidth: number): number {
  if (scale <= 1) return scale;
  return Math.max(1, Math.min(scale, viewportWidth / DESKTOP_BREAKPOINT));
}
