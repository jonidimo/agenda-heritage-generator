/**
 * La puntuación que un texto corrido necesita. A una fuente de números, de títulos o de camiseta suele
 * faltarle: entonces esos signos salen de una fuente de reserva (ver `shapeText`), y conviene usarla
 * solo para cifras y títulos cortos. Lo usan el panel de Estilo y el informe de fuentes del servidor MCP.
 */
import type { FontFace, FontRegistry } from './fonts';
import { hasGlyph } from './shape';

export const BASIC_PUNCTUATION: readonly string[] = [',', '.', ';', ':', '(', ')', '-', '?', '!', '¿', '¡'];

/** Los tipos de texto con frases (no las cifras ni el año grande): ahí la puntuación se nota. */
export const PROSE_ROLES: ReadonlySet<string> = new Set(['title', 'heading', 'body', 'label', 'labelStrong', 'quote']);

/** La puntuación básica que le falta a una cara, y la primera de reserva que la tiene toda (o `null`). */
export function punctuationOf(fonts: FontRegistry, face: FontFace, fallbacks: readonly string[]): { missing: string[]; from: string | null } {
  const missing = BASIC_PUNCTUATION.filter((c) => !hasGlyph(face, c.codePointAt(0)!));
  if (missing.length === 0) return { missing, from: null };
  const from = fonts.glyphFallback(face, fallbacks).faces.find((r) => missing.every((c) => hasGlyph(r, c.codePointAt(0)!)));
  return { missing, from: from?.family ?? null };
}
