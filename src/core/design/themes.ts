/**
 * Temas visuales: todos los valores de diseño (fuentes por rol, tamaños,
 * grosores, colores, márgenes, renglones o puntos) son datos editables. Las
 * secciones nunca usan números sueltos: piden «el tamaño de rótulo» o «el
 * grosor de renglón» al tema, así cambiar la estética no requiere código.
 */
import type { FontSpec } from '../text/fonts';

export type WritingStyle = 'lines' | 'dots' | 'grid' | 'blank';

export interface ThemeTokens {
  name: string;
  description: string;
  fonts: {
    /** Números grandes y año de portada. */
    display: FontSpec;
    /** Títulos de página (en Heritage, itálica liviana). */
    title: FontSpec;
    /** Rótulos en mayúsculas espaciadas. */
    label: FontSpec;
    /** Rótulos fuertes (LUN 5, encabezados de columna). */
    labelStrong: FontSpec;
    /** Encabezados de sección (subrayados). */
    heading: FontSpec;
    /** Texto corrido (guía, dedicatoria, notas). */
    body: FontSpec;
    /** Cifras de calendarios. */
    number: FontSpec;
    /** Frases y citas. */
    quote: FontSpec;
  };
  /** Familias de reserva si falta alguna (en orden). */
  fallbacks: string[];
  colors: {
    ink: string;
    soft: string;
    rule: string;
    ruleSoft: string;
    weekend: string;
    accent: string;
  };
  /** Grosores en puntos tipográficos. */
  strokes: { hair: number; grid: number; rule: number; strong: number; heavy: number };
  /** Cuerpos en puntos. */
  sizes: {
    hero: number;
    monthHero: number;
    title: number;
    titleSmall: number;
    subtitle: number;
    heading: number;
    label: number;
    labelSmall: number;
    body: number;
    small: number;
    tiny: number;
    dayLabel: number;
    calendarNumber: number;
  };
  /** Espaciado de letras en em. */
  tracking: { label: number; heading: number };
  /** Márgenes de página en mm (el margen interior suma además el lomo de la encuadernación). */
  margins: { top: number; bottom: number; inner: number; outer: number };
  writing: { style: WritingStyle; pitch: number };
  dots: { pitch: number; radius: number; color: string };
  weekendShading: boolean;
  /** Tamaño mínimo legible (pt) que respeta el ajuste automático de textos largos. */
  minTextPt: number;
}

const heritage: ThemeTokens = {
  name: 'Heritage',
  description: 'Clásico, durable y legible: Cormorant Garamond + Manrope, monocromo para láser.',
  fonts: {
    display: { family: 'Cormorant Garamond', weight: 300, style: 'normal' },
    title: { family: 'Cormorant Garamond', weight: 300, style: 'italic' },
    label: { family: 'Manrope', weight: 300, style: 'normal' },
    labelStrong: { family: 'Manrope', weight: 800, style: 'normal' },
    heading: { family: 'Manrope', weight: 600, style: 'normal' },
    body: { family: 'Manrope', weight: 300, style: 'normal' },
    number: { family: 'Manrope', weight: 400, style: 'normal' },
    quote: { family: 'Cormorant Garamond', weight: 400, style: 'italic' },
  },
  fallbacks: ['Manrope', 'Cormorant Garamond'],
  colors: { ink: '#000000', soft: '#000000', rule: '#999999', ruleSoft: '#cccccc', weekend: '#e0e0e0', accent: '#556b2f' },
  strokes: { hair: 0.3, grid: 0.25, rule: 0.5, strong: 1, heavy: 1.5 },
  sizes: {
    hero: 72,
    monthHero: 52,
    title: 26,
    titleSmall: 20,
    subtitle: 14,
    heading: 8,
    label: 7,
    labelSmall: 6,
    body: 9,
    small: 7.5,
    tiny: 5.5,
    dayLabel: 9,
    calendarNumber: 8.5,
  },
  tracking: { label: 0.05, heading: 0.1 },
  margins: { top: 15, bottom: 15, inner: 15, outer: 15 },
  writing: { style: 'lines', pitch: 6.2 },
  dots: { pitch: 5, radius: 0.5, color: '#303030' },
  weekendShading: true,
  minTextPt: 5.5,
};

const clara: ThemeTokens = {
  ...heritage,
  name: 'Clara',
  description: 'Máxima legibilidad: Atkinson Hyperlegible Next, cuerpos mayores, renglones amplios y contraste alto.',
  fonts: {
    display: { family: 'Atkinson Hyperlegible Next', weight: 300, style: 'normal' },
    title: { family: 'Atkinson Hyperlegible Next', weight: 600, style: 'normal' },
    label: { family: 'Atkinson Hyperlegible Next', weight: 500, style: 'normal' },
    labelStrong: { family: 'Atkinson Hyperlegible Next', weight: 700, style: 'normal' },
    heading: { family: 'Atkinson Hyperlegible Next', weight: 700, style: 'normal' },
    body: { family: 'Atkinson Hyperlegible Next', weight: 400, style: 'normal' },
    number: { family: 'Atkinson Hyperlegible Next', weight: 600, style: 'normal' },
    quote: { family: 'Atkinson Hyperlegible Next', weight: 400, style: 'italic' },
  },
  fallbacks: ['Atkinson Hyperlegible Next', 'Manrope'],
  colors: { ink: '#000000', soft: '#000000', rule: '#555555', ruleSoft: '#8a8a8a', weekend: '#d6d6d6', accent: '#000000' },
  strokes: { hair: 0.4, grid: 0.35, rule: 0.6, strong: 1.1, heavy: 1.6 },
  sizes: {
    hero: 66,
    monthHero: 46,
    title: 22,
    titleSmall: 18,
    subtitle: 14,
    heading: 9.5,
    label: 8.5,
    labelSmall: 7.5,
    body: 11,
    small: 9,
    tiny: 7,
    dayLabel: 10.5,
    calendarNumber: 9.5,
  },
  tracking: { label: 0.03, heading: 0.06 },
  writing: { style: 'lines', pitch: 7.5 },
  dots: { pitch: 6, radius: 0.6, color: '#202020' },
  minTextPt: 7,
};

const clasica: ThemeTokens = {
  ...heritage,
  name: 'Clásica',
  description: 'EB Garamond para títulos y textos, Manrope para datos; aire de libro.',
  fonts: {
    display: { family: 'EB Garamond', weight: 400, style: 'normal' },
    title: { family: 'EB Garamond', weight: 400, style: 'italic' },
    label: { family: 'Manrope', weight: 400, style: 'normal' },
    labelStrong: { family: 'Manrope', weight: 700, style: 'normal' },
    heading: { family: 'Manrope', weight: 600, style: 'normal' },
    body: { family: 'EB Garamond', weight: 400, style: 'normal' },
    number: { family: 'EB Garamond', weight: 500, style: 'normal' },
    quote: { family: 'EB Garamond', weight: 400, style: 'italic' },
  },
  fallbacks: ['EB Garamond', 'Manrope'],
  sizes: { ...heritage.sizes, title: 24, body: 10, calendarNumber: 9 },
};

const minimal: ThemeTokens = {
  ...heritage,
  name: 'Mínima',
  description: 'Una sola familia sans (Manrope), sin sombreado de fin de semana, puntos en vez de renglones.',
  fonts: {
    display: { family: 'Manrope', weight: 200, style: 'normal' },
    title: { family: 'Manrope', weight: 300, style: 'normal' },
    label: { family: 'Manrope', weight: 500, style: 'normal' },
    labelStrong: { family: 'Manrope', weight: 800, style: 'normal' },
    heading: { family: 'Manrope', weight: 700, style: 'normal' },
    body: { family: 'Manrope', weight: 300, style: 'normal' },
    number: { family: 'Manrope', weight: 500, style: 'normal' },
    quote: { family: 'Manrope', weight: 300, style: 'normal' },
  },
  fallbacks: ['Manrope'],
  tracking: { label: 0.12, heading: 0.14 },
  writing: { style: 'dots', pitch: 5 },
  weekendShading: false,
  sizes: { ...heritage.sizes, title: 22, hero: 64, monthHero: 44 },
};

const cuaderno: ThemeTokens = {
  ...heritage,
  name: 'Cuaderno',
  description: 'Títulos y frases manuscritos (Caveat) con datos en Manrope; cálido e informal.',
  fonts: {
    ...heritage.fonts,
    display: { family: 'Caveat', weight: 600, style: 'normal' },
    title: { family: 'Caveat', weight: 600, style: 'normal' },
    quote: { family: 'Caveat', weight: 400, style: 'normal' },
  },
  fallbacks: ['Caveat', 'Manrope'],
  sizes: { ...heritage.sizes, title: 30, titleSmall: 24, monthHero: 60, hero: 80, subtitle: 17 },
  writing: { style: 'grid', pitch: 5 },
};

export const THEMES: Record<string, ThemeTokens> = { heritage, clara, clasica, minimal, cuaderno };

export const COMFORT_FACTOR: Record<'compact' | 'normal' | 'wide', { pitch: number; text: number }> = {
  compact: { pitch: 0.9, text: 1 },
  normal: { pitch: 1, text: 1 },
  wide: { pitch: 1.2, text: 1.1 },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Fusión profunda de objetos simples (los arreglos se reemplazan). */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : (patch as T)) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Tema efectivo: tema base + ajustes del usuario + nivel de comodidad. */
export function resolveTheme(id: string, tokens: Record<string, unknown>, comfort: 'compact' | 'normal' | 'wide'): ThemeTokens {
  const base = THEMES[id] ?? heritage;
  const merged = deepMerge(base, tokens);
  const f = COMFORT_FACTOR[comfort];
  if (f.pitch === 1 && f.text === 1) return merged;
  const sizes = Object.fromEntries(
    Object.entries(merged.sizes).map(([k, v]) => [k, k === 'hero' || k === 'monthHero' || k === 'title' ? v : Number((v * f.text).toFixed(2))]),
  ) as ThemeTokens['sizes'];
  return {
    ...merged,
    sizes,
    writing: { ...merged.writing, pitch: Number((merged.writing.pitch * f.pitch).toFixed(2)) },
    dots: { ...merged.dots, pitch: Number((merged.dots.pitch * f.pitch).toFixed(2)) },
  };
}

/** Todas las caras tipográficas que el tema necesita (para precargarlas). */
export function themeFaces(theme: ThemeTokens): FontSpec[] {
  const list = Object.values(theme.fonts);
  const seen = new Set<string>();
  return list.filter((f) => {
    const k = `${f.family}|${f.weight}|${f.style}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
