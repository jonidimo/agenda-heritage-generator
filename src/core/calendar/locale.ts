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
