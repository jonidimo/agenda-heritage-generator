import type { MonthInfo } from '../calendar';
import { weekOrder } from '../calendar';
import { dateOrder, formatDayMonth, weekdayNames } from '../calendar/locale';
import { monthNames } from '../calendar/locale';
import { takeTop } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import type { Prim, TextSource } from '../layout/prims';
import { line } from '../layout/prims';
import { pageHeader, ruledLines } from '../layout/widgets';
import type { Rect } from '../util/geometry';
import type { PagePlan } from './types';

/** Encabezado estándar y caja restante debajo. */
/** Origen de un texto fijo del programa: su ruta en las cadenas del idioma (el editor lo cambia en `persona.labels`). */
export const label = (path: string): TextSource => ({ kind: 'label', path });

export function headed(ctx: LayoutContext, title: string, right: string, opts: Parameters<typeof pageHeader>[4] = {}): Rect {
  const used = pageHeader(ctx, ctx.content, title, right, opts);
  return takeTop(ctx.content, used)[1];
}

export function monthTitle(ctx: LayoutContext, month: MonthInfo): string {
  return `${month.name.toLocaleUpperCase(ctx.doc.locale)} ${month.y}`;
}

export function nextMonthName(ctx: LayoutContext, month: MonthInfo): string {
  return monthNameOf(ctx, (month.m % 12) + 1);
}

export function monthNameOf(ctx: LayoutContext, m: number): string {
  return monthNames(ctx.doc.locale)[m - 1] ?? '';
}

export function order(ctx: LayoutContext): number[] {
  return weekOrder(ctx.doc.cal.options.weekStart);
}

export { checklist } from '../layout/widgets';

/** Rótulo + renglones debajo (devuelve las primitivas y el alto usado). */
export function labeledLines(ctx: LayoutContext, r: Rect, label: string, lines: number, pitch: number, opts: { size?: number } = {}): { prims: Prim[]; height: number } {
  const t = ctx.textIn(label, { ...r, h: 4 }, { role: 'label', size: opts.size ?? ctx.theme.sizes.label, upper: true, tracking: true });
  const top = r.y + 3;
  const area = { x: r.x, y: top, w: r.w, h: lines * pitch };
  return { prims: [...t.prims, ...ruledLines(area, pitch, ctx.stroke('hair'))], height: 3 + lines * pitch };
}

/** Línea para escribir con rótulo a la izquierda («Nombre: ________»). */
export function fieldLine(ctx: LayoutContext, x: number, y: number, w: number, label: string, size?: number): Prim[] {
  const t = ctx.textAt(label, x, y, { role: 'label', size: size ?? ctx.theme.sizes.small });
  const lx = x + t.width + 2;
  return [t.prim, line(lx, y + 0.6, x + w, y + 0.6, ctx.stroke('hair', undefined, { use: 'writing' }))];
}

/**
 * Renglones con rótulo («Nombre: ____»), repartidos en la caja del elemento (`id`): una fila por
 * rótulo (uno vacío deja el renglón sin rótulo). La caja natural mide `pitch` mm por fila.
 */
export function fieldRows(ctx: LayoutContext, id: string, at: { x: number; y: number; w: number }, labels: readonly string[], pitch: number): Prim[] {
  const box = ctx.rect(id, { x: at.x, y: at.y, w: at.w, h: labels.length * pitch });
  const step = box.h / Math.max(1, labels.length);
  return labels.flatMap((f, i) => fieldLine(ctx, box.x, box.y + (i + 1) * step, box.w, f ? `${f}:` : ''));
}

/** Aviso informativo: un feriado o una fecha propia se abrevió con «…» para entrar en su lugar. */
export function abbreviated(ctx: LayoutContext, text: string, kind: 'holiday' | 'event'): void {
  const where = kind === 'holiday' ? 'podés darle un nombre más corto en Calendario → Feriados' : 'podés acortarlo en Persona → Cumpleaños y fechas importantes';
  ctx.warn('abbreviated', `«${text}» se abrevió para entrar en su lugar: ${where}.`, { text, kind });
}

/**
 * Variables de los textos escritos por la persona (elementos propios, plantillas de página):
 * {year} {name} {title} {month} {week} {page} en toda página, y en las copias por día {date}
 * («31 de marzo»), {weekday} y {day}. Las fechas salen en el idioma y el orden de la agenda.
 */
export const PAGE_TEXT_VARIABLES = {
  always: ['year', 'name', 'title', 'month', 'week', 'page'],
  dated: ['date', 'weekday', 'day'],
} as const;

type TextVars = Record<(typeof PAGE_TEXT_VARIABLES.always)[number], string | number> & Partial<Record<(typeof PAGE_TEXT_VARIABLES.dated)[number], string | number>>;

export function pageTextVars(ctx: LayoutContext, page: PagePlan): Record<string, string | number> {
  const d = ctx.doc.design;
  const iso = typeof page.params?.date === 'string' ? page.params.date : undefined;
  const vars: TextVars = {
    year: d.calendar.year,
    name: d.persona.name,
    title: d.persona.title,
    month: String(page.params?.monthName ?? ''),
    week: String(page.params?.weekNumber ?? ''),
    page: page.index + 1,
  };
  if (iso) {
    const [y, m, day] = iso.split('-').map(Number);
    const dow = ((new Date(Date.UTC(y!, m! - 1, day!)).getUTCDay() + 6) % 7) + 1;
    vars.date = formatDayMonth(ctx.doc.locale, iso, dateOrder(ctx.doc.locale, d.calendar.dateFormat));
    vars.weekday = weekdayNames(ctx.doc.locale, 'long')[dow - 1] ?? '';
    vars.day = day!;
    vars.year = y!;
  }
  return vars;
}
