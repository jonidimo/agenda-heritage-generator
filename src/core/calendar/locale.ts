/**
 * Nombres de meses y días con Intl (cualquier idioma sin tablas propias) y
 * datos regionales de semana (primer día y fin de semana).
 */
import type { AgendaStrings } from '../i18n';

const monthFmtCache = new Map<string, string[]>();
const weekdayFmtCache = new Map<string, string[]>();

function capitalize(s: string, locale: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

/** Nombres de mes (índice 0 = enero) con mayúscula inicial. */
export function monthNames(locale: string, width: 'long' | 'short' = 'long'): string[] {
  const key = `${locale}|${width}`;
  const hit = monthFmtCache.get(key);
  if (hit) return hit;
  let fmtr: Intl.DateTimeFormat;
  try {
    fmtr = new Intl.DateTimeFormat(locale, { month: width, timeZone: 'UTC' });
  } catch {
    fmtr = new Intl.DateTimeFormat('es', { month: width, timeZone: 'UTC' });
  }
  const names = Array.from({ length: 12 }, (_, i) => {
    // "LLLL" (forma independiente) en idiomas que la distinguen.
    const parts = fmtr.formatToParts(new Date(Date.UTC(2021, i, 15)));
    const raw = parts.find((p) => p.type === 'month')?.value ?? '';
    return capitalize(raw.replace(/\.$/, ''), locale);
  });
  monthFmtCache.set(key, names);
  return names;
}

/** Nombres de día ISO (índice 0 = lunes … 6 = domingo). */
export function weekdayNames(locale: string, width: 'long' | 'short' = 'short'): string[] {
  const key = `${locale}|${width}`;
  const hit = weekdayFmtCache.get(key);
  if (hit) return hit;
  let fmtr: Intl.DateTimeFormat;
  try {
    fmtr = new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' });
  } catch {
    fmtr = new Intl.DateTimeFormat('es', { weekday: width, timeZone: 'UTC' });
  }
  // 2021-03-01 fue lunes.
  const names = Array.from({ length: 7 }, (_, i) => capitalize(fmtr.format(new Date(Date.UTC(2021, 2, 1 + i))).replace(/\.$/, ''), locale));
  weekdayFmtCache.set(key, names);
  return names;
}

/** Abreviatura en mayúsculas para rótulos de día (LUN, MAR, MIÉ…). */
export function weekdayLabel(locale: string, isoWeekday: number): string {
  const names = weekdayNames(locale, 'short');
  const raw = names[isoWeekday - 1] ?? '';
  return raw.toLocaleUpperCase(locale).replace(/\.$/, '');
}

/** Inicial del día según la tabla del idioma (respeta «X» de España, «M» rioplatense, etc.). */
export function weekdayLetter(strings: AgendaStrings, isoWeekday: number): string {
  return strings.weekLetters[isoWeekday - 1] ?? '';
}

export interface WeekInfo {
  /** 1 = lunes … 7 = domingo. */
  firstDay: number;
  weekend: number[];
}

/** Datos regionales de la semana (Intl.Locale#getWeekInfo con reserva razonable). */
export function regionWeekInfo(locale: string): WeekInfo {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number; weekend: number[] };
      weekInfo?: { firstDay: number; weekend: number[] };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info && info.firstDay && Array.isArray(info.weekend)) return { firstDay: info.firstDay, weekend: [...info.weekend] };
  } catch {
    /* sin soporte: reserva */
  }
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  const sundayFirst = new Set(['US', 'CA', 'MX', 'BR', 'JP', 'IL', 'PH', 'CO', 'PE', 'VE', 'GT', 'HN', 'SV', 'NI', 'PA', 'DO', 'PR', 'ZA']);
  return { firstDay: region && sundayFirst.has(region) ? 7 : 1, weekend: [6, 7] };
}

/** Moneda local habitual por país (para rótulos de importes). */
export function currencySymbol(locale: string, country: string | null): string {
  const byCountry: Record<string, string> = {
    AR: 'ARS', UY: 'UYU', CL: 'CLP', MX: 'MXN', CO: 'COP', PE: 'PEN', PY: 'PYG', BO: 'BOB', VE: 'VES', EC: 'USD',
    ES: 'EUR', IT: 'EUR', PT: 'EUR', FR: 'EUR', DE: 'EUR', IE: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', GR: 'EUR', FI: 'EUR',
    US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', BR: 'BRL', CH: 'CHF', JP: 'JPY', CR: 'CRC', DO: 'DOP', GT: 'GTQ',
  };
  const code = (country && byCountry[country]) || 'USD';
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

const REGION_TZ: Record<string, string> = {
  AR: 'America/Argentina/Buenos_Aires', UY: 'America/Montevideo', CL: 'America/Santiago', PY: 'America/Asuncion',
  BO: 'America/La_Paz', PE: 'America/Lima', CO: 'America/Bogota', EC: 'America/Guayaquil', VE: 'America/Caracas',
  MX: 'America/Mexico_City', GT: 'America/Guatemala', CR: 'America/Costa_Rica', PA: 'America/Panama', DO: 'America/Santo_Domingo',
  CU: 'America/Havana', PR: 'America/Puerto_Rico', ES: 'Europe/Madrid', PT: 'Europe/Lisbon', IT: 'Europe/Rome', FR: 'Europe/Paris',
  DE: 'Europe/Berlin', GB: 'Europe/London', IE: 'Europe/Dublin', US: 'America/New_York', CA: 'America/Toronto', BR: 'America/Sao_Paulo',
  AU: 'Australia/Sydney', NZ: 'Pacific/Auckland', CH: 'Europe/Zurich', AT: 'Europe/Vienna', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels',
};

/** Huso horario razonable para un idioma-región (antes de caer en el del sistema o UTC). */
export function defaultTimeZone(locale: string, country: string | null): string {
  const region = (country ?? locale.split(/[-_]/)[1] ?? '').toUpperCase();
  if (REGION_TZ[region]) return REGION_TZ[region]!;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/* ---------- Convenciones de un país (datos CLDR del motor Intl) ---------- */

/** Región de una etiqueta BCP 47 ('es-AR' → 'AR'), o undefined. */
export function regionOf(locale: string): string | undefined {
  try {
    return new Intl.Locale(locale).region;
  } catch {
    return undefined;
  }
}

/**
 * Idioma más probable de un país según CLDR («likely subtags»: AR → es, BR → pt, US → en),
 * sin listas propias: lo resuelve el motor Intl.
 */
export function likelyLanguage(region: string): string | undefined {
  try {
    return new Intl.Locale(`und-${region}`).maximize().language;
  } catch {
    return undefined;
  }
}

/** País más probable de un idioma según CLDR (es → ES, pt → BR, en → US). */
export function likelyRegion(language: string): string | undefined {
  try {
    return new Intl.Locale(language).maximize().region;
  } catch {
    return undefined;
  }
}

/**
 * Etiqueta con las convenciones del país: su idioma más probable y la región
 * ('en-AR' → 'es-AR'). Sirve para el orden de las fechas, que es del país y no del idioma:
 * el motor no trae datos de «en-AR» y usaría el orden de Estados Unidos.
 */
export function conventionLocale(locale: string): string {
  const region = regionOf(locale);
  const lang = region ? likelyLanguage(region) : undefined;
  return region && lang ? `${lang}-${region}` : locale;
}

/* ---------- Orden de las fechas ---------- */

/** Orden de día, mes y año: `auto` sigue al país; los demás lo fijan a mano. Las fechas se guardan siempre en ISO. */
export type DateOrderSetting = 'auto' | 'dmy' | 'mdy' | 'ymd';
export type DateOrder = Exclude<DateOrderSetting, 'auto'>;

const PROBE = new Date(Date.UTC(2027, 2, 31, 12));

/** Orden de día, mes y año en las partes que produce Intl para una configuración dada. */
function orderOf(locale: string, opts: Intl.DateTimeFormatOptions): DateOrder | null {
  try {
    const seq = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' })
      .formatToParts(PROBE)
      .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
      .map((p) => p.type[0])
      .join('');
    if (seq.startsWith('y')) return 'ymd';
    return seq.indexOf('m') < seq.indexOf('d') ? 'mdy' : 'dmy';
  } catch {
    return null;
  }
}

/** Orden de las fechas de una agenda: el del país (con `auto`) o el elegido a mano. */
export function dateOrder(locale: string, setting: DateOrderSetting = 'auto'): DateOrder {
  if (setting !== 'auto') return setting;
  return orderOf(conventionLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' }) ?? 'dmy';
}

/**
 * Día y mes con el mes en letras, en el idioma de la agenda y el orden pedido. Si el orden es el
 * propio del idioma, el texto es el de Intl tal cual («31 de marzo», «Wednesday, March 31»); si
 * se pide otro orden, se arma con las mismas palabras en ese orden («marzo 31», «31 March»).
 */
export function formatDayMonth(locale: string, iso: string, order: DateOrder, opts: { weekday?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
  const base: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC', ...(opts.weekday ? { weekday: 'long' } : {}) };
  try {
    const natural = orderOf(locale, { day: 'numeric', month: 'long' });
    // En la forma con letras no se escribe el año: «año, mes, día» se lee como mes y día.
    const wanted = order === 'dmy' ? 'dmy' : 'mdy';
    if (natural === wanted) return new Intl.DateTimeFormat(locale, base).format(date);
    const parts = new Intl.DateTimeFormat(locale, base).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
    const dm = wanted === 'mdy' ? `${get('month')} ${get('day')}` : `${get('day')} ${get('month')}`;
    return opts.weekday ? `${get('weekday')} ${dm}` : dm;
  } catch {
    return iso;
  }
}

/** Fecha en números en el orden elegido: 31/03, 03/31 o 03-31 (con año si se pide: 2027-03-31). */
export function formatNumeric(iso: string, order: DateOrder, withYear = false): string {
  const [y, m, d] = iso.split('-');
  if (order === 'ymd') return withYear ? `${y}-${m}-${d}` : `${m}-${d}`;
  const dm = order === 'mdy' ? `${m}/${d}` : `${d}/${m}`;
  return withYear ? `${dm}/${y}` : dm;
}
