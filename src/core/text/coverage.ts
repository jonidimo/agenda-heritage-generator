/**
 * Informe de una fuente antes de proponerla: si tiene las letras y los signos del castellano (ñ, tildes,
 * «¿» y «¡»), los de las otras lenguas de la aplicación, cifras y puntuación; y si conviene usarla solo
 * para títulos. Lo usa `import_font` del servidor MCP.
 */
import type { FKFont } from './fontkit';

const chars = (s: string): string[] => [...s];

/** Lo que una fuente tiene que traer para el castellano: sin esto, sus títulos saldrían con letras de otra fuente. */
export const SPANISH_REQUIRED = chars('ñÑáéíóúüÁÉÍÓÚÜ¿¡');
/** Letras sin las que no hay texto. */
export const BASIC_LATIN = chars('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
export const DIGITS = chars('0123456789');
/** Puntuación de un texto corrido. */
export const PUNCTUATION = chars(',.;:()-?!"\'«»“”‘’–—…%/&@€°');
/** Las letras de las otras lenguas de la aplicación (portugués, francés, alemán, italiano). */
export const EUROPEAN = chars('àâãäçèêëìîïòôõöùûÿßœæÀÂÃÄÇÈÊËÌÎÏÒÔÕÖÙÛŸŒÆ');

export type FontFit = 'complete' | 'incomplete' | 'unsuitable';

export interface FontAssessment {
  glyphs: number;
  /** Lo que falta, por grupo (vacío si no falta nada). */
  missing: { basic: string[]; spanish: string[]; digits: string[]; punctuation: string[]; european: string[] };
  /**
   * `complete`: tiene todo lo del castellano, las cifras y la puntuación. `incomplete`: sirve para
   * castellano pero le faltan cifras, puntuación u otras lenguas. `unsuitable`: le falta alguna letra
   * del castellano (la ñ, una tilde, «¿» o «¡») o del alfabeto.
   */
  fit: FontFit;
  /** Por qué conviene usarla solo para títulos (vacío: sirve para todo). */
  titleOnly: string[];
  /** Los tipos de texto donde conviene usarla. */
  roles: string[];
}

const ALL_ROLES = ['display', 'title', 'label', 'labelStrong', 'heading', 'body', 'number', 'quote'];

/**
 * `category` es la de la familia en el servicio (display, handwriting…) y `weights` cuántos pesos tiene la
 * familia: dos datos que la fuente sola no dice.
 */
export function assessFont(font: FKFont, hints: { category?: string | undefined; weights?: number | undefined } = {}): FontAssessment {
  const lacks = (set: readonly string[]): string[] => set.filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)!));
  const missing = { basic: lacks(BASIC_LATIN), spanish: lacks(SPANISH_REQUIRED), digits: lacks(DIGITS), punctuation: lacks(PUNCTUATION), european: lacks(EUROPEAN) };
  const fit: FontFit = missing.basic.length > 0 || missing.spanish.length > 0 ? 'unsuitable' : missing.digits.length > 0 || missing.punctuation.length > 0 || missing.european.length > 0 ? 'incomplete' : 'complete';
  const titleOnly: string[] = [];
  const category = (hints.category ?? '').toLowerCase();
  if (category === 'display') titleOnly.push('es una fuente de exhibición (display): pensada para títulos grandes, cansa en textos largos');
  if (category === 'handwriting') titleOnly.push('es de estilo manuscrito: legible en títulos y frases cortas, menos en párrafos');
  if (missing.digits.length > 0) titleOnly.push(`no tiene todas las cifras (faltan ${missing.digits.join(' ')})`);
  if (missing.punctuation.length > 0) titleOnly.push(`le faltan signos de puntuación (${missing.punctuation.join(' ')}); salen de la fuente de reserva`);
  if (hints.weights !== undefined && hints.weights <= 1) titleOnly.push('tiene un solo peso (sin negrita ni cursiva propias)');
  if (font.numGlyphs < 150) titleOnly.push(`tiene pocos glifos (${font.numGlyphs})`);
  return { glyphs: font.numGlyphs, missing, fit, titleOnly, roles: titleOnly.length > 0 ? ['display', 'title'] : ALL_ROLES };
}
