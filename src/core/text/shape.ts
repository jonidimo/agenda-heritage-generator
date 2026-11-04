import { ptToMm } from '../util/geometry';
import type { FontFace } from './fonts';

/** Rasgos OpenType que se piden siempre. El mismo arreglo se le pasa a pdfkit. */
export const BASE_FEATURES: readonly string[] = ['kern', 'liga'];
export const TABULAR_FEATURES: readonly string[] = ['kern', 'liga', 'tnum'];

export interface ShapedGlyph {
  id: number;
  /** Posición del origen del glifo respecto del origen de la corrida (mm, Y hacia abajo). */
  x: number;
  y: number;
}

export interface ShapedRun {
  face: string;
  text: string;
  sizePt: number;
  /** Cuerpo en mm. */
  size: number;
  /** Espaciado extra después de cada glifo, en mm (equivale al operador PDF `Tc`). */
  tracking: number;
  features: readonly string[];
  glyphs: ShapedGlyph[];
  /** Ancho visible: avance total sin el espaciado del último glifo. */
  width: number;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  /** mm por unidad de diseño de la fuente. */
  unit: number;
  /** Puntos de código sin glifo en la fuente (para la verificación previa). */
  missing: number[];
}

export interface ShapeOptions {
  /** Espaciado entre letras en em (0.05 = 5 % del cuerpo). */
  tracking?: number;
  features?: readonly string[];
}

const cache = new Map<string, ShapedRun>();
const CACHE_LIMIT = 20_000;

/**
 * Conforma una línea de texto con fontkit exactamente como lo hará pdfkit:
 * misma llamada `font.layout(texto, rasgos)` sobre la cadena completa (pdfkit
 * no la parte en palabras cuando recibe rasgos explícitos) y mismo modelo de
 * espaciado (`Tc` después de cada glifo).
 */
export function shapeText(face: FontFace, rawText: string, sizePt: number, opts: ShapeOptions = {}): ShapedRun {
  const text = rawText.normalize('NFC').replace(/[\r\n]+/g, ' ');
  const features = opts.features ?? BASE_FEATURES;
  const trackingEm = opts.tracking ?? 0;
  const key = `${face.key}\u0001${sizePt}\u0001${trackingEm}\u0001${features.join(',')}\u0001${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const font = face.font;
  const size = ptToMm(sizePt);
  const unit = size / font.unitsPerEm;
  const tracking = trackingEm * size;
  const glyphs: ShapedGlyph[] = [];
  const missing: number[] = [];
  let x = 0;
  if (text.length > 0) {
    const run = font.layout(text, [...features]);
    for (let i = 0; i < run.glyphs.length; i++) {
      const g = run.glyphs[i]!;
      const p = run.positions[i]!;
      if (g.id === 0) missing.push(...g.codePoints);
      glyphs.push({ id: g.id, x: x + p.xOffset * unit, y: -p.yOffset * unit });
      x += p.xAdvance * unit + tracking;
    }
  }
  const shaped: ShapedRun = {
    face: face.key,
    text,
    sizePt,
    size,
    tracking,
    features,
    glyphs,
    width: glyphs.length > 0 ? x - tracking : 0,
    ascent: font.ascent * unit,
    descent: font.descent * unit,
    capHeight: (font.capHeight || font.ascent * 0.7) * unit,
    xHeight: (font.xHeight || font.ascent * 0.5) * unit,
    unit,
    missing,
  };
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(key, shaped);
  return shaped;
}

export function measureText(face: FontFace, text: string, sizePt: number, opts: ShapeOptions = {}): number {
  return shapeText(face, text, sizePt, opts).width;
}

const glyphPathCache = new Map<string, string>();

/** Contorno de un glifo como `d` de SVG en unidades de diseño (Y hacia arriba). */
export function glyphPath(face: FontFace, glyphId: number): string {
  const key = `${face.key}#${glyphId}`;
  const hit = glyphPathCache.get(key);
  if (hit !== undefined) return hit;
  const d = face.font.getGlyph(glyphId).path.toSVG();
  glyphPathCache.set(key, d);
  return d;
}

/** Reduce el cuerpo hasta que el texto entre en `maxWidth` (nunca por debajo de `minPt`). */
export function fitSize(face: FontFace, text: string, sizePt: number, maxWidth: number, minPt: number, opts: ShapeOptions = {}): number {
  let size = sizePt;
  const w = measureText(face, text, size, opts);
  if (w <= maxWidth || w === 0) return size;
  size = Math.max(minPt, (sizePt * maxWidth) / w);
  while (size > minPt && measureText(face, text, size, opts) > maxWidth) size -= 0.1;
  return Math.max(minPt, Number(size.toFixed(2)));
}

/**
 * Partición en líneas (algoritmo voraz por palabras; corta palabras que no
 * entran solas). Respeta saltos de línea explícitos.
 */
export function wrapText(face: FontFace, text: string, sizePt: number, maxWidth: number, opts: ShapeOptions = {}): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(face, candidate, sizePt, opts) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (measureText(face, word, sizePt, opts) <= maxWidth) {
        line = word;
      } else {
        let chunk = '';
        for (const ch of Array.from(word)) {
          if (measureText(face, chunk + ch, sizePt, opts) > maxWidth && chunk) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
