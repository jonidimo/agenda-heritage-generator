import { likelyLanguage, likelyRegion } from '../calendar/locale';
import { en } from './en';
import { es, type AgendaStrings } from './es';
import { it } from './it';
import { pt } from './pt';

export type { AgendaStrings } from './es';

export const LANGUAGES = ['es', 'en', 'pt', 'it'] as const;
export type Lang = (typeof LANGUAGES)[number];

const TABLE: Record<Lang, AgendaStrings> = { es, en, pt, it };

/** Idioma base de una etiqueta BCP 47 ('es-AR' → 'es'); cae en español si no está soportado. */
export function langOf(locale: string): Lang {
  const base = locale.toLowerCase().split(/[-_]/)[0] ?? 'es';
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Lang) : 'es';
}

/** Idioma de la agenda que se habla en un país, según CLDR (AR → es, BR → pt, DE → ninguno). */
export function countryLang(country: string | null | undefined): Lang | undefined {
  if (!country) return undefined;
  const l = likelyLanguage(country.toUpperCase());
  return (LANGUAGES as readonly string[]).includes(l ?? '') ? (l as Lang) : undefined;
}

/**
 * País para un idioma cuando hay que proponer uno: el de la persona si habla ese idioma
 * (su navegador dice es-AR → Argentina); si no, el más probable según CLDR (pt → Brasil).
 */
export function homeCountry(lang: Lang, preferred?: string | null): string | undefined {
  if (preferred && countryLang(preferred) === lang) return preferred.toUpperCase();
  return likelyRegion(lang);
}

/**
 * Etiqueta de idioma y región: el idioma elegido y la región del país de los feriados
 * ('es' + 'UY' → 'es-UY'), que fija fechas, moneda, inicio de semana y variantes regionales.
 */
export function localeFor(lang: string, country: string | null | undefined): string {
  const l = lang.toLowerCase().split(/[-_]/)[0] || 'es';
  return country && /^[A-Za-z]{2}$/.test(country) ? `${l}-${country.toUpperCase()}` : l;
}

/** Interpola variables {nombre} en una plantilla. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Textos del idioma con las sustituciones del usuario aplicadas. Las claves
 * de `overrides` usan notación con puntos (p. ej. `review.moods.2` o
 * `week.notes`) para que cualquier rótulo impreso sea editable sin código.
 */
export function resolveStrings(locale: string, overrides: Record<string, string> = {}): AgendaStrings {
  const base = TABLE[langOf(locale)];
  const regional = regionalPatch(locale);
  const merged = structuredCloneJson(base);
  for (const [path, value] of Object.entries({ ...regional, ...overrides })) setPath(merged, path, value);
  return merged;
}

/** Ajustes regionales de un mismo idioma (p. ej. «X» para miércoles en España). */
function regionalPatch(locale: string): Record<string, string> {
  const tag = locale.toLowerCase();
  if (tag === 'es-es') return { 'weekLetters.2': 'X', 'personal.insurance': 'Mutua / seguro médico', 'health.insurance': 'Mutua / seguro médico' };
  if (tag === 'es-mx' || tag === 'es-co' || tag === 'es-pe' || tag === 'es-cl') {
    return { 'personal.insurance': 'Seguro médico', 'health.insurance': 'Seguro médico' };
  }
  if (tag === 'pt-pt') return { 'personal.insurance': 'Seguro de saúde', 'health.insurance': 'Seguro de saúde', 'personal.phone': 'Telemóvel' };
  if (tag === 'en-gb' || tag === 'en-au' || tag === 'en-ie') {
    return { 'balance.title': 'Monthly Budget', 'personal.insurance': 'Health cover', 'health.insurance': 'Health cover' };
  }
  return {};
}

function structuredCloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setPath(target: unknown, path: string, value: string): void {
  const parts = path.split('.');
  let node = target as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = node[parts[i]!];
    if (next === null || typeof next !== 'object') return;
    node = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(node)) {
    const idx = Number(last);
    if (Number.isInteger(idx) && idx >= 0) node[idx] = value;
  } else if (last in node && typeof node[last] === 'string') {
    node[last] = value;
  }
}

/** Lista de claves editables (para el panel «Textos» de la interfaz). */
export function listStringKeys(strings: AgendaStrings): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const walk = (node: unknown, prefix: string): void => {
    if (typeof node === 'string') {
      out.push({ key: prefix, value: node });
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${prefix}.${i}`));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk(strings, '');
  return out;
}
