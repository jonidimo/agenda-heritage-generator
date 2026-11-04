/**
 * Envoltorio tipado mínimo sobre fontkit. Aísla al núcleo de los tipos de Node
 * (`Buffer`) que usan las declaraciones oficiales y documenta exactamente qué
 * parte de la API usamos: lo mismo que usa pdfkit al incrustar las fuentes, lo
 * que garantiza que la vista previa y el PDF posicionen cada glifo igual.
 */
import * as fontkit from 'fontkit';

export interface FKPathCommand {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  args: number[];
}

export interface FKGlyph {
  id: number;
  advanceWidth: number;
  codePoints: number[];
  path: { commands: FKPathCommand[]; toSVG(): string };
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface FKPosition {
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface FKGlyphRun {
  glyphs: FKGlyph[];
  positions: FKPosition[];
  advanceWidth: number;
}

export interface FKFont {
  postscriptName: string;
  familyName: string;
  subfamilyName: string;
  fullName: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
  italicAngle: number;
  numGlyphs: number;
  availableFeatures: string[];
  characterSet: number[];
  variationAxes: Record<string, { name: string; min: number; default: number; max: number }>;
  layout(text: string, features?: string[]): FKGlyphRun;
  glyphForCodePoint(codePoint: number): FKGlyph;
  hasGlyphForCodePoint(codePoint: number): boolean;
  getGlyph(id: number): FKGlyph;
  getName?(key: string, lang?: string): string | null;
  getVariation?(settings: Record<string, number>): FKFont;
  'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } };
  head?: { macStyle?: { italic?: boolean } };
}

interface FKCollection {
  fonts: FKFont[];
}

/** Abre una fuente (TTF, OTF, WOFF, WOFF2, TTC/DFont → primera cara). */
export function openFont(bytes: Uint8Array): FKFont {
  const created = (fontkit.create as unknown as (data: Uint8Array) => FKFont | FKCollection)(bytes);
  if ('fonts' in created && Array.isArray(created.fonts)) {
    const first = created.fonts[0];
    if (!first) throw new Error('La colección tipográfica está vacía');
    return first;
  }
  return created as FKFont;
}
