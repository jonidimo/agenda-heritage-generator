import { ptToMm, type Rect } from '../util/geometry';
import type { FontFace, FontRegistry, GlyphFallback } from './fonts';

/** Rasgos OpenType que se piden siempre. El mismo arreglo se le pasa a pdfkit. */
export const BASE_FEATURES: readonly string[] = ['kern', 'liga'];
export const TABULAR_FEATURES: readonly string[] = ['kern', 'liga', 'tnum'];

export interface ShapedGlyph {
  id: number;
  /** Posición del origen del glifo respecto del origen de la corrida (mm, Y hacia abajo). */
  x: number;
  y: number;
}

/**
 * Un tramo de una corrida dibujado con una sola cara: la del texto o una de reserva (para los
 * caracteres que la del texto no tiene).
 */
export interface ShapedSegment {
  /** Clave de la cara. */
  face: string;
  /** El trozo de `run.text` que dibuja este tramo (lo que recibe pdfkit). */
  text: string;
  /** Origen del tramo respecto del de la corrida, en mm. */
  x: number;
  /** Sus glifos en `run.glyphs`: de `from` a `to` (sin incluir). */
  from: number;
  to: number;
  /** mm por unidad de diseño de ESTA cara (no todas las fuentes usan la misma cantidad de unidades por em). */
  unit: number;
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
  /** Puntos de código sin glifo en la fuente ni en ninguna de reserva (para la verificación previa). */
  missing: number[];
  /**
   * Solo si algún carácter se tomó de una cara de reserva: los tramos, cada uno con su cara. Sin esto,
   * toda la corrida es de `face` (lo de siempre). Ver `segmentsOf`.
   */
  segments?: readonly ShapedSegment[];
  /** Los puntos de código que se dibujaron con una cara de reserva (solo si hubo alguno). */
  borrowed?: number[];
}

export interface ShapeOptions {
  /** Espaciado entre letras en em (0.05 = 5 % del cuerpo). */
  tracking?: number;
  features?: readonly string[];
  /** De dónde tomar los caracteres que la cara no tiene (ver `FontRegistry.glyphFallback`). */
  fallback?: GlyphFallback;
}

/** La corrida como tramos de una sola cara: uno solo (toda la corrida) si no se tomó nada de otra cara. */
export function segmentsOf(run: ShapedRun): readonly ShapedSegment[] {
  return run.segments ?? [{ face: run.face, text: run.text, x: 0, from: 0, to: run.glyphs.length, unit: run.unit }];
}

const coverage = new WeakMap<FontFace, Map<number, boolean>>();

/** ¿La cara tiene un glifo para este punto de código? (Se recuerda por cara.) */
export function hasGlyph(face: FontFace, codePoint: number): boolean {
  let known = coverage.get(face);
  if (!known) {
    known = new Map();
    coverage.set(face, known);
  }
  const hit = known.get(codePoint);
  if (hit !== undefined) return hit;
  const has = face.font.hasGlyphForCodePoint(codePoint);
  known.set(codePoint, has);
  return has;
}

/**
 * El texto en tramos de una sola cara: cada carácter con la cara del texto si la tiene; si no, con la
 * primera de reserva que lo tenga; si ninguna, con la del texto (que dibuja su glifo vacío y avisa).
 * `null` cuando no se toma nada prestado: el texto se conforma entero, como siempre.
 */
function coverageSplit(primary: FontFace, text: string, faces: readonly FontFace[]): Array<{ face: FontFace; text: string }> | null {
  let complete = true;
  for (const ch of text) {
    if (!hasGlyph(primary, ch.codePointAt(0)!)) {
      complete = false;
      break;
    }
  }
  if (complete) return null;
  const parts: Array<{ face: FontFace; text: string }> = [];
  let borrowed = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let face = primary;
    if (!hasGlyph(primary, cp)) {
      const alt = faces.find((f) => hasGlyph(f, cp));
      if (alt) {
        face = alt;
        borrowed = true;
      }
    }
    const last = parts[parts.length - 1];
    if (last && last.face === face) last.text += ch;
    else parts.push({ face, text: ch });
  }
  return borrowed ? parts : null;
}

/**
 * Los puntos de código del texto que la cara no tiene, sin repetir y en orden. Se miran en su tabla de
 * caracteres: fontkit reusa un mismo glifo vacío para todos los que faltan (con los puntos de código
 * del primero), así que preguntarle al glifo diría siempre el primero.
 */
function uncovered(face: FontFace, text: string): number[] {
  const out = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!hasGlyph(face, cp)) out.add(cp);
  }
  return [...out];
}

const cache = new Map<string, ShapedRun>();
const CACHE_LIMIT = 20_000;

/**
 * Conforma una línea de texto con fontkit exactamente como lo hará pdfkit:
 * misma llamada `font.layout(texto, rasgos)` sobre la cadena completa (pdfkit
 * no la parte en palabras cuando recibe rasgos explícitos) y mismo modelo de
 * espaciado (`Tc` después de cada glifo).
 *
 * Con `fallback`, los caracteres que la cara no tiene salen de una cara de reserva: la línea se parte
 * en tramos de una sola cara y cada tramo se conforma entero con la suya (pdfkit dibuja cada tramo con
 * una llamada propia, en la misma posición). En el borde de un tramo no hay interletrado ni ligaduras
 * entre las dos caras, que de todos modos no tienen un par en común. Si la cara tiene todo, el
 * resultado es idéntico al de siempre.
 */
export function shapeText(face: FontFace, rawText: string, sizePt: number, opts: ShapeOptions = {}): ShapedRun {
  const text = rawText.normalize('NFC').replace(/[\r\n]+/g, ' ');
  const features = opts.features ?? BASE_FEATURES;
  const trackingEm = opts.tracking ?? 0;
  const fallback = opts.fallback;
  const key = `${face.key}\u0001${sizePt}\u0001${trackingEm}\u0001${features.join(',')}\u0001${fallback?.key ?? ''}\u0001${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const font = face.font;
  const size = ptToMm(sizePt);
  const unit = size / font.unitsPerEm;
  const tracking = trackingEm * size;
  const glyphs: ShapedGlyph[] = [];
  const missing: number[] = [];
  let x = 0;
  const parts = fallback && fallback.faces.length > 0 && text.length > 0 ? coverageSplit(face, text, fallback.faces) : null;
  let extra: Pick<ShapedRun, 'segments' | 'borrowed'> = {};
  if (!parts) {
    if (text.length > 0) {
      const run = font.layout(text, [...features]);
      for (let i = 0; i < run.glyphs.length; i++) {
        const g = run.glyphs[i]!;
        const p = run.positions[i]!;
        glyphs.push({ id: g.id, x: x + p.xOffset * unit, y: -p.yOffset * unit });
        x += p.xAdvance * unit + tracking;
      }
      if (glyphs.some((g) => g.id === 0)) missing.push(...uncovered(face, text));
    }
  } else {
    const segments: ShapedSegment[] = [];
    const borrowed = new Set<number>();
    for (const part of parts) {
      const u = size / part.face.font.unitsPerEm;
      const from = glyphs.length;
      const start = x;
      const run = part.face.font.layout(part.text, [...features]);
      for (let i = 0; i < run.glyphs.length; i++) {
        const g = run.glyphs[i]!;
        const p = run.positions[i]!;
        glyphs.push({ id: g.id, x: x + p.xOffset * u, y: -p.yOffset * u });
        x += p.xAdvance * u + tracking;
      }
      if (part.face !== face) for (const ch of part.text) borrowed.add(ch.codePointAt(0)!);
      else missing.push(...uncovered(face, part.text).filter((cp) => !missing.includes(cp)));
      segments.push({ face: part.face.key, text: part.text, x: start, from, to: glyphs.length, unit: u });
    }
    extra = { segments, borrowed: [...borrowed] };
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
    ...extra,
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

/* ---------- Tinta real de los glifos (para detectar textos que se pisan) ---------- */

type Box4 = [number, number, number, number];
const glyphBoxes = new WeakMap<FontFace, Map<number, Box4 | null>>();

/** Caja de tinta de un glifo en unidades de diseño: [minX, minY, maxX, maxY] con Y hacia arriba. */
export function glyphBox(face: FontFace, gid: number): Box4 | null {
  let cache = glyphBoxes.get(face);
  if (!cache) {
    cache = new Map();
    glyphBoxes.set(face, cache);
  }
  const hit = cache.get(gid);
  if (hit !== undefined) return hit;
  let box: Box4 | null = null;
  try {
    const b = face.font.getGlyph(gid).bbox;
    if (Number.isFinite(b.minX) && Number.isFinite(b.maxY) && b.maxX > b.minX && b.maxY > b.minY) box = [b.minX, b.minY, b.maxX, b.maxY];
  } catch {
    box = null;
  }
  cache.set(gid, box);
  return box;
}

/**
 * Caja de tinta de un texto conformado, relativa a su origen (x, línea de base), en mm y con Y hacia
 * abajo. Cada tramo se mide con su cara (`fonts` da la cara de cada clave).
 */
export function inkBounds(run: ShapedRun, fonts: Pick<FontRegistry, 'get'>): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const seg of segmentsOf(run)) {
    const face = fonts.get(seg.face);
    if (!face) continue;
    for (let i = seg.from; i < seg.to; i++) {
      const gl = run.glyphs[i]!;
      const b = glyphBox(face, gl.id);
      if (!b) continue;
      x0 = Math.min(x0, gl.x + b[0] * seg.unit);
      x1 = Math.max(x1, gl.x + b[2] * seg.unit);
      y0 = Math.min(y0, gl.y - b[3] * seg.unit);
      y1 = Math.max(y1, gl.y - b[1] * seg.unit);
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
