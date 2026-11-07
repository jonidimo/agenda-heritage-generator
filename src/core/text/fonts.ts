import { openFont, type FKFont } from './fontkit';

export type FontStyle = 'normal' | 'italic';

export interface FontSpec {
  family: string;
  weight: number;
  style: FontStyle;
}

/** Una fuente que llega de un archivo (p. ej. la de un texto propio), validada; si no es válida, null. */
export function parseFontSpec(v: unknown): FontSpec | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.family !== 'string' || !o.family.trim() || o.family.length > 80) return null;
  const weight = typeof o.weight === 'number' && Number.isFinite(o.weight) ? Math.min(1000, Math.max(100, Math.round(o.weight))) : 400;
  return { family: o.family.trim(), weight, style: o.style === 'italic' ? 'italic' : 'normal' };
}

export interface FontFace extends FontSpec {
  /** Clave única y estable: `familia|peso|estilo`. */
  key: string;
  bytes: Uint8Array;
  font: FKFont;
  source: 'builtin' | 'user';
  /** Ruta relativa dentro de /fonts para las integradas, o id del recurso para las subidas. */
  file?: string;
  /** Las fuentes variables se incrustan como instancia por defecto (aviso en verificación previa). */
  variable: boolean;
}

export function faceKey(spec: FontSpec): string {
  return `${spec.family}|${spec.weight}|${spec.style}`;
}

/** Detecta familia, peso y estilo leyendo las tablas `name` y `OS/2` de la fuente. */
export function detectFaceMeta(font: FKFont): FontSpec {
  const preferred = font.getName?.('preferredFamily') ?? null;
  const family = (preferred || font.familyName || font.postscriptName || 'Sin nombre').trim();
  const weight = font['OS/2']?.usWeightClass ?? guessWeight(font.subfamilyName);
  const italic =
    Boolean(font['OS/2']?.fsSelection?.italic) ||
    Boolean(font.head?.macStyle?.italic) ||
    Math.abs(font.italicAngle || 0) > 0.5 ||
    /italic|oblique|cursiva/i.test(font.subfamilyName ?? '');
  return { family, weight: clampWeight(weight), style: italic ? 'italic' : 'normal' };
}

function guessWeight(sub: string | undefined): number {
  const s = (sub ?? '').toLowerCase();
  if (s.includes('thin') || s.includes('hairline')) return 100;
  if (s.includes('extralight') || s.includes('ultralight')) return 200;
  if (s.includes('light')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('semibold') || s.includes('demibold')) return 600;
  if (s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold')) return 700;
  return 400;
}

function clampWeight(w: number): number {
  if (!Number.isFinite(w)) return 400;
  return Math.min(1000, Math.max(1, Math.round(w)));
}

/**
 * De dónde sale un carácter que la cara de un texto no tiene (una fuente de camiseta sin coma ni
 * paréntesis, por ejemplo): las caras candidatas, en orden de preferencia, nunca la propia.
 */
export interface GlyphFallback {
  /** Las claves de las caras, juntas: identifica la lista (forma parte de la clave de la caché de conformado). */
  key: string;
  faces: readonly FontFace[];
}

/**
 * Registro de caras tipográficas cargadas. La resolución sigue el algoritmo de
 * coincidencia de pesos de CSS Fonts 4 dentro de la familia pedida.
 */
export class FontRegistry {
  private readonly faces = new Map<string, FontFace>();
  /** Las caras integradas que una subida con la misma familia, peso y estilo tapó: vuelven al quitarla. */
  private readonly shadowed = new Map<string, FontFace>();
  /** Las listas de reserva ya armadas; cambian si se agrega o se quita una cara. */
  private readonly fallbackCache = new Map<string, GlyphFallback>();

  register(
    bytes: Uint8Array,
    meta: Partial<FontSpec> & { source?: 'builtin' | 'user'; file?: string } = {},
  ): FontFace {
    const font = openFont(bytes);
    const detected = detectFaceMeta(font);
    const spec: FontSpec = {
      family: meta.family ?? detected.family,
      weight: meta.weight ?? detected.weight,
      style: meta.style ?? detected.style,
    };
    const face: FontFace = {
      ...spec,
      key: faceKey(spec),
      bytes,
      font,
      source: meta.source ?? 'builtin',
      variable: Object.keys(font.variationAxes ?? {}).length > 0,
      ...(meta.file ? { file: meta.file } : {}),
    };
    const prev = this.faces.get(face.key);
    if (prev && prev.source === 'builtin' && face.source === 'user') this.shadowed.set(face.key, prev);
    this.faces.set(face.key, face);
    this.fallbackCache.clear();
    return face;
  }

  /** Quita las caras que vinieron de un archivo subido (`file`); devuelve cuántas quitó. */
  unregisterFile(file: string): number {
    let removed = 0;
    for (const [key, face] of this.faces) {
      if (face.file === file && this.faces.delete(key)) {
        removed++;
        const back = this.shadowed.get(key);
        if (back) {
          this.faces.set(key, back);
          this.shadowed.delete(key);
        }
      }
    }
    if (removed > 0) this.fallbackCache.clear();
    return removed;
  }

  has(spec: FontSpec): boolean {
    return this.faces.has(faceKey(spec));
  }

  get(key: string): FontFace | undefined {
    return this.faces.get(key);
  }

  list(): FontFace[] {
    return [...this.faces.values()];
  }

  families(): string[] {
    return [...new Set(this.list().map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  }

  facesOf(family: string): FontFace[] {
    return this.list().filter((f) => f.family === family);
  }

  /** Cara más cercana de la familia (o `undefined` si la familia no está cargada). */
  resolve(spec: FontSpec): FontFace | undefined {
    const exact = this.faces.get(faceKey(spec));
    if (exact) return exact;
    const all = this.facesOf(spec.family);
    if (all.length === 0) return undefined;
    const sameStyle = all.filter((f) => f.style === spec.style);
    const pool = sameStyle.length > 0 ? sameStyle : all;
    return pickWeight(pool, spec.weight);
  }

  /** Igual que `resolve`, con familias de reserva y, en último caso, cualquier cara cargada. */
  resolveWithFallback(spec: FontSpec, fallbacks: string[] = []): FontFace {
    const direct = this.resolve(spec);
    if (direct) return direct;
    for (const family of fallbacks) {
      const f = this.resolve({ ...spec, family });
      if (f) return f;
    }
    const any = this.list()[0];
    if (!any) throw new Error('No hay ninguna fuente cargada');
    return any;
  }

  /**
   * Una copia con las mismas caras (no se vuelven a leer ni a abrir): para sumarle las fuentes propias
   * de una agenda sin tocar un registro que comparten otras.
   */
  fork(): FontRegistry {
    const copy = new FontRegistry();
    for (const [k, f] of this.faces) copy.faces.set(k, f);
    for (const [k, f] of this.shadowed) copy.shadowed.set(k, f);
    return copy;
  }

  /**
   * Las caras de reserva por carácter para `primary`, como hace un navegador: primero las familias de
   * reserva del tema, después las demás cargadas (en el orden en que se cargaron); de cada familia, la
   * cara más parecida en peso y estilo. La familia de `primary` no cuenta: si a una cara le falta un
   * signo, a sus hermanas casi siempre también.
   */
  glyphFallback(primary: FontFace, fallbacks: readonly string[] = []): GlyphFallback {
    const cacheKey = `${primary.key}\u0001${fallbacks.join('\u0002')}`;
    const hit = this.fallbackCache.get(cacheKey);
    if (hit) return hit;
    const families = [...fallbacks, ...new Set(this.list().map((f) => f.family))];
    const seen = new Set<string>([primary.key]);
    const faces: FontFace[] = [];
    for (const family of families) {
      if (family === primary.family) continue;
      const face = this.resolve({ family, weight: primary.weight, style: primary.style });
      if (!face || seen.has(face.key)) continue;
      seen.add(face.key);
      faces.push(face);
    }
    const out: GlyphFallback = { key: faces.map((f) => f.key).join(';'), faces };
    this.fallbackCache.set(cacheKey, out);
    return out;
  }
}

function pickWeight(pool: FontFace[], desired: number): FontFace {
  const sorted = [...pool].sort((a, b) => a.weight - b.weight);
  const exact = sorted.find((f) => f.weight === desired);
  if (exact) return exact;
  const lighter = sorted.filter((f) => f.weight < desired).reverse();
  const heavier = sorted.filter((f) => f.weight > desired);
  let order: FontFace[];
  if (desired >= 400 && desired <= 500) {
    const upTo500 = heavier.filter((f) => f.weight <= 500);
    const beyond = heavier.filter((f) => f.weight > 500);
    order = [...upTo500, ...lighter, ...beyond];
  } else if (desired < 400) {
    order = [...lighter, ...heavier];
  } else {
    order = [...heavier, ...lighter];
  }
  return order[0] ?? sorted[0]!;
}
