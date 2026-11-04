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
 * Registro de caras tipográficas cargadas. La resolución sigue el algoritmo de
 * coincidencia de pesos de CSS Fonts 4 dentro de la familia pedida.
 */
export class FontRegistry {
  private readonly faces = new Map<string, FontFace>();

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
    this.faces.set(face.key, face);
    return face;
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
