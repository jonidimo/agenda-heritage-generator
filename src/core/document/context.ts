/**
 * Construye el contexto del documento a partir del diseño y de los recursos
 * ya cargados (fuentes, datos de feriados, recursos gráficos).
 */
import { buildCalendar, type CalendarOptions } from '../calendar';
import { currencySymbol, defaultTimeZone, regionWeekInfo } from '../calendar/locale';
import { moonPhases, seasonDates } from '../calendar/moon';
import { sheetSize, type Design } from '../design/schema';
import { resolveThemeFor } from '../design/themes';
import { computeHolidays, type HolidayCountryData, type HolidayType } from '../holidays';
import { langOf, resolveStrings } from '../i18n';
import type { AssetInfo, DocContext, PageGeometry } from '../layout/context';
import type { Side } from '../layout/prims';
import type { FontRegistry } from '../text/fonts';

export interface Resources {
  fonts: FontRegistry;
  holidays: HolidayCountryData | null;
  assets: ReadonlyMap<string, AssetInfo>;
}

export interface PageFormat {
  /** Página terminada (después del refile), en mm. */
  w: number;
  h: number;
  /** Hoja de impresión tal como sale de la impresora (apaisada si van 2 páginas por cara). */
  sheetW: number;
  sheetH: number;
  /** Páginas por cara de hoja. */
  nUp: 1 | 2;
  /** Media hoja sin refilar (la celda donde va cada página). */
  cellW: number;
  cellH: number;
}

export function pageFormat(design: Design): PageFormat {
  const s = sheetSize(design.paper);
  const t = design.binding.trim;
  if (design.binding.method === 'single') {
    return { w: s.w - t.outer, h: s.h - t.top - t.bottom, sheetW: s.w, sheetH: s.h, nUp: 1, cellW: s.w, cellH: s.h };
  }
  const cellW = s.h / 2;
  const cellH = s.w;
  return { w: cellW - t.outer, h: cellH - t.top - t.bottom, sheetW: s.h, sheetH: s.w, nUp: 2, cellW, cellH };
}

function weekStartNumber(design: Design): number {
  const ws = design.calendar.weekStart;
  if (ws === 'monday') return 1;
  if (ws === 'sunday') return 7;
  if (ws === 'saturday') return 6;
  return regionWeekInfo(design.locale).firstDay;
}

export function calendarOptions(design: Design): CalendarOptions {
  const weekend = design.calendar.weekend === 'auto' ? regionWeekInfo(design.locale).weekend : design.calendar.weekend;
  return {
    year: design.calendar.year,
    startMonth: design.calendar.startMonth,
    monthCount: design.calendar.monthCount,
    weekStart: weekStartNumber(design),
    weekend,
    numbering: design.calendar.numbering,
    locale: design.locale,
  };
}

/**
 * Un documento anterior de la misma agenda. Mientras las partes del diseño de las que sale algo no
 * cambien (por identidad: el editor trabaja con diseños inmutables), eso se reutiliza en lugar de
 * calcularse otra vez: cambiar un color no vuelve a calcular el calendario, los feriados ni las
 * fases de la luna.
 */
export interface ContextSource {
  readonly design: Design;
  readonly resources: Resources;
  readonly ctx: DocContext;
}

/** ¿Estas partes del diseño son las mismas que las del documento anterior? */
export function unchanged(prev: ContextSource | undefined, design: Design, keys: ReadonlyArray<keyof Design>): prev is ContextSource {
  return prev !== undefined && keys.every((k) => prev.design[k] === design[k]);
}

/** Partes del diseño de las que salen el calendario, el huso horario, la moneda y las estaciones. */
const CALENDAR_INPUTS = ['locale', 'calendar', 'holidays', 'personalDates', 'astronomy'] as const satisfies ReadonlyArray<keyof Design>;

type Calendrical = Pick<DocContext, 'cal' | 'timeZone' | 'currency' | 'seasons'>;

function buildCalendrical(design: Design, res: Resources): Calendrical {
  const lang = design.holidays.language === 'auto' ? langOf(design.locale) : design.holidays.language;
  const tz =
    design.calendar.timeZone !== 'auto'
      ? design.calendar.timeZone
      : design.holidays.country && res.holidays?.tz
        ? res.holidays.tz
        : defaultTimeZone(design.locale, design.holidays.country);
  const cal = buildCalendar(calendarOptions(design), {
    holidays: (from, to) =>
      computeHolidays(design.holidays.country ? res.holidays : null, {
        subdivision: design.holidays.subdivision,
        types: design.holidays.types as HolidayType[],
        lang,
        from,
        to,
        edits: { added: design.holidays.added, removed: design.holidays.removed, renamed: design.holidays.renamed },
      }),
    personalDates: design.personalDates.map((p) => ({ ...p, year: p.year ?? null })),
    moon: design.astronomy.moonPhases ? (from, to) => moonPhases(from, to, tz) : null,
  });
  return { cal, timeZone: tz, currency: currencySymbol(design.locale, design.holidays.country), seasons: seasonDates(design.calendar.year, tz) };
}

export function createDocContext(design: Design, res: Resources, prev?: ContextSource): DocContext {
  const theme = resolveThemeFor(design.theme);
  const strings =
    unchanged(prev, design, ['locale']) && prev.design.persona.labels === design.persona.labels ? prev.ctx.strings : resolveStrings(design.locale, design.persona.labels);
  const calendrical: Calendrical =
    unchanged(prev, design, CALENDAR_INPUTS) && prev.resources.holidays === res.holidays
      ? { cal: prev.ctx.cal, timeZone: prev.ctx.timeZone, currency: prev.ctx.currency, seasons: prev.ctx.seasons }
      : buildCalendrical(design, res);
  const methods = unchanged(prev, design, ['methods']) ? prev.ctx.methods : new Set([...design.methods.enabled, ...design.methods.custom.map((m) => m.id)]);
  const fmt = pageFormat(design);
  return {
    design,
    theme,
    fonts: res.fonts,
    strings,
    locale: design.locale,
    methods,
    assets: res.assets,
    pageW: fmt.w,
    pageH: fmt.h,
    ...calendrical,
  };
}

export function pageGeometry(doc: DocContext, side: Side): PageGeometry {
  const m = doc.theme.margins;
  const gutter = doc.design.binding.gutter;
  const inner = m.inner + gutter;
  const left = side === 'recto' ? inner : m.outer;
  const right = side === 'recto' ? m.outer : inner;
  return {
    w: doc.pageW,
    h: doc.pageH,
    side,
    spine: side === 'recto' ? 'left' : 'right',
    content: { x: left, y: m.top, w: doc.pageW - left - right, h: doc.pageH - m.top - m.bottom },
  };
}
