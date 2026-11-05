/**
 * Semanas: variantes Alastair (la de 2026), horizontal (días apilados en dos
 * páginas), vertical (columnas) y día por página. Ninguna impone horas fijas:
 * cada persona organiza su tiempo.
 */
import type { DayInfo, MonthInfo, WeekInfo } from '../calendar';
import { weekdayLabel, weekdayLetter } from '../calendar/locale';
import { fmt } from '../i18n';
import { flex, hsplit, rows, takeBottom, takeTop } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import { circle, line, rect, type LinkArea, type Prim } from '../layout/prims';
import { checkCircle, heartIcon, isSouthern, miniCalendar, moonIcon, ruledLines, signifierIcon, textLine, writingArea, type Signifier } from '../layout/widgets';
import { TABULAR_FEATURES } from '../text/shape';
import { ptToMm, type Rect } from '../util/geometry';
import { abbreviated, checklist, order } from './common';
import { opt, param, type PagePlan, type PagePlanDraft, type SectionModule } from './types';

type Variant = 'alastair' | 'horizontal' | 'vertical' | 'daily';

function weekOf(ctx: LayoutContext, page: PagePlan): WeekInfo {
  const key = page.params?.week as string | undefined;
  const w = ctx.doc.cal.weeks.find((x) => x.key === key);
  if (!w) throw new Error(`Semana no encontrada: ${key}`);
  return w;
}

function draft(week: WeekInfo, month: MonthInfo, itemId: string, side: string, type: string, extra: Partial<PagePlanDraft> = {}): PagePlanDraft {
  return {
    key: `week:${week.key}:${side}`,
    type,
    section: itemId,
    title: `${week.label} · ${week.number}`,
    group: `month:${month.key}`,
    ...extra,
    params: { week: week.key, weekNumber: week.number, month: { y: month.y, m: month.m }, monthName: month.name, ...(extra.params ?? {}) },
  };
}

const showMoon = (ctx: LayoutContext): boolean => ctx.doc.design.astronomy.moonPhases && ctx.doc.design.astronomy.showIn.includes('week');
const south = (ctx: LayoutContext): boolean => isSouthern(ctx.doc.design.holidays.country, ctx.doc.design.astronomy.hemisphere);

export const weeks: SectionModule = {
  type: 'weeks',
  scope: 'month',
  defaults: { variant: 'alastair', priorities: 'auto', footer: 'expenses', undated: false, miniWeeks: 2 },
  plan(_doc, item, month) {
    if (!month) return [];
    const variant = opt<Variant>(item, 'variant', 'alastair');
    const out: PagePlanDraft[] = [];
    for (const week of month.weeks) {
      if (variant === 'daily') {
        // En el orden de la semana; los días de fin de semana contiguos comparten página.
        const days = week.days;
        let i = 0;
        let first = true;
        while (i < days.length) {
          const group = [days[i]!];
          if (days[i]!.isWeekend) while (i + group.length < days.length && days[i + group.length]!.isWeekend) group.push(days[i + group.length]!);
          const isos = group.map((d) => d.iso);
          const key = group.length > 1 ? `day:${isos[0]}+` : `day:${isos[0]}`;
          out.push(draft(week, month, item.id, key, 'daily', { key, startOn: first ? 'verso' : 'any', title: isos[0]!, params: { ...item.options, days: isos } }));
          first = false;
          i += group.length;
        }
        continue;
      }
      // `days`: los días que muestra cada página (los enlaces de un día llevan a la página que lo tiene).
      const daysOf = (left: boolean): string[] => week.days.slice(...weekSplit(variant, left)).map((d) => d.iso);
      out.push(draft(week, month, item.id, 'left', 'weekLeft', { startOn: 'verso', params: { ...item.options, variant, days: daysOf(true) } }));
      out.push(draft(week, month, item.id, 'right', 'weekRight', { params: { ...item.options, variant, days: daysOf(false) } }));
    }
    return out;
  },
  layout(ctx, page) {
    const variant = param<Variant>(page, 'variant', 'alastair');
    if (page.type === 'daily') return dailyPage(ctx, page);
    const week = weekOf(ctx, page);
    const left = page.type === 'weekLeft';
    if (variant === 'alastair') return left ? alastairLeft(ctx, page, week) : alastairRight(ctx, page, week);
    if (variant === 'vertical') return verticalWeek(ctx, page, week, left);
    return horizontalWeek(ctx, page, week, left);
  },
};

/** Qué días de la semana van en cada página según la variante (desde, hasta: índices dentro de la semana). */
export function weekSplit(variant: string, left: boolean): [number, number] {
  if (variant === 'alastair') return left ? [0, 7] : [0, 0];
  if (variant === 'vertical') return left ? [0, 4] : [4, 7];
  return left ? [0, 3] : [3, 7];
}

/* ---------- Encabezado semanal ---------- */

function weekHeader(ctx: LayoutContext, week: WeekInfo, page: PagePlan, withMiniCal: boolean): Rect {
  const c = ctx.content;
  const s = ctx.s;
  const headH = 17;
  const [head, rest] = takeTop(c, headH, 5);
  const labelRun = ctx.run(fmt(s.week.label, { n: week.number }), { role: 'label', size: ctx.theme.sizes.label + 1, upper: true, tracking: true });
  const lb = head.y + labelRun.capHeight + 0.5;
  const p: Prim[] = [ctx.textAt(fmt(s.week.label, { n: week.number }), head.x, lb, { role: 'label', size: ctx.theme.sizes.label + 1, upper: true, tracking: true }).prim];
  p.push(ctx.textAt(week.label, head.x, lb + ptToMm(ctx.theme.sizes.subtitle) * 1.15, { role: 'title', size: 'subtitle' }).prim);
  ctx.add('week.title', 'Semana y mes', p);
  if (withMiniCal) {
    const nWeeks = Math.max(1, Math.min(3, Number(param(page, 'miniWeeks', 2))));
    const idx = ctx.doc.cal.weeks.indexOf(week);
    const rowsData: DayInfo[][] = [week.days];
    for (let k = 1; k < nWeeks; k++) {
      const next = ctx.doc.cal.weeks[idx + k];
      if (next) rowsData.push(next.days);
      else {
        const last = rowsData[rowsData.length - 1]!;
        rowsData.push(last.map((d) => ctx.doc.cal.day(isoPlus(d.iso, 7))!));
      }
    }
    const w = Math.min(46, c.w * 0.42);
    const box = ctx.rect('week.minical', { x: head.x + head.w - w, y: head.y, w, h: headH - 2.5 });
    const links: LinkArea[] = [];
    const prims = miniCalendar(ctx, box, rowsData, {
      onCell: (day, cell) => links.push({ ...cell, to: { kind: 'date', iso: day.iso }, cat: 'days' }),
      order: order(ctx),
      highlight: new Set(week.days.map((d) => d.iso)),
      month: null,
      otherMonth: 'show',
      numberSize: ctx.theme.sizes.label + 1.5,
      headerSize: ctx.theme.sizes.label + 1.5,
      headerH: 4.6,
      weekendStyle: 'none',
      holidays: 'none',
      headerRule: true,
    });
    ctx.add('week.minical', 'Minicalendario', prims, { links });
  }
  ctx.add('week.headRule', 'Filete del encabezado', [line(head.x, head.y + headH, head.x + head.w, head.y + headH, ctx.stroke('rule', 'ink', { use: 'separator' }))], { editable: false });
  return rest;
}

function isoPlus(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return t.toISOString().slice(0, 10);
}

function dayHeading(ctx: LayoutContext, day: DayInfo, x: number, baseline: number, maxW: number): Prim[] {
  const label = `${weekdayLabel(ctx.doc.locale, day.dow)} ${day.d}`;
  const t = ctx.textAt(label, x, baseline, { role: 'labelStrong', size: 'dayLabel' });
  const out: Prim[] = [t.prim];
  let cx = x + t.width + 2;
  if (day.events.length > 0) {
    out.push(heartIcon(ctx, cx + 0.9, baseline - 1.1, 1.6));
    const evText = day.events.map((e2) => e2.label).join(' · ');
    const evW = x + maxW - cx - 2.4;
    if (evW > 4) {
      const e = ctx.textIn(evText, { x: cx + 2.4, y: baseline - 2.6, w: evW, h: 3 }, { role: 'body', size: ctx.theme.sizes.small - 0.5, ellipsis: true, silent: true });
      if (e.truncated) abbreviated(ctx, evText, 'event');
      out.push(...e.prims);
      cx += 2.4 + e.bbox.w + 2;
    } else abbreviated(ctx, evText, 'event');
  }
  const h = day.holidays[0];
  if (h) {
    const avail = x + maxW - cx - (showMoon(ctx) && day.moon ? 4 : 0);
    if (avail > 6) {
      const ht = ctx.textIn(`— ${h.name}`, { x: cx, y: baseline - 2.6, w: avail, h: 3 }, { role: 'body', size: ctx.theme.sizes.small - 0.5, ellipsis: true, silent: true });
      if (ht.truncated) abbreviated(ctx, h.name, 'holiday');
      out.push(...ht.prims);
    } else abbreviated(ctx, h.name, 'holiday');
  }
  if (showMoon(ctx) && day.moon) out.push(...moonIcon(ctx, x + maxW - 1.6, baseline - 1.2, 1.25, day.moon, south(ctx)));
  return out;
}

/* ---------- Alastair: izquierda (días) ---------- */

function alastairLeft(ctx: LayoutContext, page: PagePlan, week: WeekInfo): void {
  const r = weekHeader(ctx, week, page, true);
  const prioritiesOpt = param<string | boolean>(page, 'priorities', 'auto');
  const priorities = prioritiesOpt === true || (prioritiesOpt === 'auto' && ctx.has('top-priorities'));
  const openLoops = ctx.has('open-loops');
  const notesH = Math.max(24, 4 + 3 * Math.max(6, ctx.theme.writing.pitch));
  const [daysArea, notesBase] = takeBottom(r, notesH, 4);
  const notes = ctx.rect('week.notes', notesBase);
  const dayRows = rows(daysArea, 7);
  week.days.forEach((day, i) => {
    const row = ctx.rect(`day.${i}`, dayRows[i]!);
    const p: Prim[] = [];
    if (day.isWeekend && ctx.theme.weekendShading) p.push(rect(row, { fill: ctx.fill('weekend') }));
    p.push(line(row.x, row.y, row.x + row.w, row.y, ctx.stroke('rule', 'ink', { use: 'table' })));
    p.push(...dayHeading(ctx, day, row.x + 1.5, row.y + 1.2 + ptToMm(ctx.theme.sizes.dayLabel) * 0.75, row.w - 3));
    ctx.add(`day.${i}`, `${weekdayLabel(ctx.doc.locale, day.dow)} ${day.d}`, p, { bbox: row });
  });
  ctx.add('days.bottom', 'Cierre de los días', [line(daysArea.x, daysArea.y + daysArea.h, daysArea.x + daysArea.w, daysArea.y + daysArea.h, ctx.stroke('rule', 'ink', { use: 'table' }))], { editable: false });
  const np: Prim[] = [line(notes.x, notes.y, notes.x + notes.w, notes.y, ctx.stroke('heavy', 'ink', { use: 'separator' }))];
  const s = ctx.s;
  const label = openLoops ? s.pages.weekly.openLoops : priorities ? s.week.priorities : s.week.notes;
  np.push(...ctx.textIn(label, { x: notes.x, y: notes.y + 2, w: notes.w, h: 3 }, { role: 'label', size: ctx.theme.sizes.label, upper: true, tracking: true }).prims);
  const area = { x: notes.x, y: notes.y + 4, w: notes.w, h: notes.h - 4 };
  const pitch = Math.max(5.5, (area.h - 0.5) / 3);
  if (priorities && !openLoops) {
    for (let k = 1; k <= 3; k++) {
      const y = area.y + k * pitch;
      np.push(ctx.textAt(`${k}.`, area.x, y - 1.2, { role: 'labelStrong', size: 'label' }).prim);
      np.push(line(area.x + 4, y, area.x + area.w, y, ctx.stroke('hair', undefined, { use: 'writing' })));
    }
  } else if (openLoops) {
    const [a, b, c] = hsplit(area, [flex(1.3), flex(1.3), flex(0.6)], 3);
    np.push(...ctx.textIn(s.pages.weekly.nextStep, { ...b!, h: 3 }, { role: 'label', size: 'tiny', upper: true, tracking: true }).prims);
    np.push(...ctx.textIn(s.pages.weekly.when, { ...c!, h: 3 }, { role: 'label', size: 'tiny', upper: true, tracking: true }).prims);
    for (const col of [a!, b!, c!]) np.push(...ruledLines(col, pitch, ctx.stroke('hair')));
  } else {
    np.push(...ruledLines(area, pitch, ctx.stroke('hair')));
  }
  ctx.add('week.notes', label, np);
}

/* ---------- Alastair: derecha (tareas × días) ---------- */

const ALASTAIR_LEGEND: Signifier[] = ['task', 'done', 'migrated', 'scheduled'];

function alastairRight(ctx: LayoutContext, page: PagePlan, week: WeekInfo): void {
  const c = ctx.content;
  const s = ctx.s;
  const footer = param<string>(page, 'footer', 'expenses');
  const footerH = footer === 'none' ? 0 : footer === 'review' ? 26 : 14;
  const legendOn = ctx.has('alastair-method') || ctx.has('bullet-journal');
  // Leyenda medida: en una fila con espacios iguales si entra; si no, en dos filas de dos.
  const legendItems = ALASTAIR_LEGEND.map((k) => ({ k, label: s.pages.signifiers[k] }));
  const legendStyle = { role: 'body' as const, size: 'tiny' as const };
  const ICON_W = 3.6;
  const legendWidths = legendItems.map((it) => ICON_W + ctx.run(it.label, legendStyle).width);
  const legendGap = 2.5;
  const oneRow = legendWidths.reduce((a, b) => a + b, 0) + legendGap * (legendItems.length - 1) <= c.w;
  const legendRowH = 5;
  const legendH = legendOn ? (oneRow ? 6 : 2 * legendRowH + 1) : 0;
  const [gridBase, bottom] = takeBottom(c, footerH + legendH, footerH + legendH > 0 ? 4 : 0);
  const gridArea = ctx.rect('tasks.grid', gridBase);
  const undated = param(page, 'undated', false);
  const dayW = Math.max(6.5, ctx.theme.writing.pitch * 1.05);
  const ncols = 7 + (undated ? 1 : 0);
  const taskW = gridArea.w - ncols * dayW;
  const headH = 9;
  const pitch = ctx.theme.writing.pitch;
  const nRows = Math.floor((gridArea.h - headH) / pitch);
  const g: Prim[] = [];
  const x0 = gridArea.x + taskW;
  const bottomY = gridArea.y + headH + nRows * pitch;
  week.days.forEach((day, i) => {
    const x = x0 + i * dayW;
    if (day.isWeekend && ctx.theme.weekendShading) g.push(rect({ x, y: gridArea.y, w: dayW, h: bottomY - gridArea.y }, { fill: ctx.fill('weekend') }));
    g.push(...ctx.textIn(weekdayLetter(s, day.dow), { x, y: gridArea.y + 1.2, w: dayW, h: 3.6 }, { role: 'labelStrong', size: ctx.theme.sizes.label + 1, align: 'center', valign: 'middle' }).prims);
    g.push(...ctx.textIn(String(day.d), { x, y: gridArea.y + 4.8, w: dayW, h: 3 }, { role: 'number', size: ctx.theme.sizes.labelSmall, align: 'center', valign: 'middle', features: TABULAR_FEATURES }).prims);
    g.push(line(x, gridArea.y, x, bottomY, ctx.stroke('hair', 'ruleSoft', { use: 'table' })));
  });
  if (undated) {
    const x = x0 + 7 * dayW;
    g.push(line(x, gridArea.y, x, bottomY, ctx.stroke('hair', 'ruleSoft', { use: 'table' })));
    g.push(...ctx.textIn('?', { x, y: gridArea.y + 1.2, w: dayW, h: 3.6 }, { role: 'labelStrong', size: ctx.theme.sizes.label + 1, align: 'center', valign: 'middle' }).prims);
  }
  g.push(...ctx.textIn(s.week.tasks, { x: gridArea.x, y: gridArea.y + 2.5, w: taskW - 2, h: 3 }, { role: 'label', size: 'labelSmall', upper: true, tracking: true }).prims);
  g.push(line(gridArea.x, gridArea.y, gridArea.x + gridArea.w, gridArea.y, ctx.stroke('rule', 'ink', { use: 'table' })));
  g.push(line(gridArea.x, gridArea.y + headH, gridArea.x + gridArea.w, gridArea.y + headH, ctx.stroke('rule', 'ink', { use: 'table' })));
  for (let k = 1; k <= nRows; k++) {
    const y = gridArea.y + headH + k * pitch;
    g.push(line(gridArea.x, y, gridArea.x + gridArea.w, y, ctx.stroke('hair', undefined, { use: 'table' })));
  }
  ctx.add('tasks.grid', 'Grilla de tareas', g);
  let y = bottom.y;
  if (legendOn) {
    const lp: Prim[] = [];
    const place = (i: number, x: number, rowY: number, rowH: number, w: number): void => {
      const it = legendItems[i]!;
      lp.push(...signifierIcon(ctx, it.k, x + 1.5, rowY + rowH / 2, 2.6));
      lp.push(...ctx.textIn(it.label, { x: x + ICON_W, y: rowY, w: w - ICON_W, h: rowH }, { ...legendStyle, valign: 'middle', fit: true }).prims);
    };
    if (oneRow) {
      // Primer elemento al margen izquierdo, último al derecho y espacios iguales entre medio.
      const spare = (bottom.w - legendWidths.reduce((a, b) => a + b, 0)) / Math.max(1, legendItems.length - 1);
      let x = bottom.x;
      legendItems.forEach((_, i) => {
        place(i, x, y, legendH, legendWidths[i]! + 0.2);
        x += legendWidths[i]! + spare;
      });
    } else {
      const half = bottom.w / 2;
      legendItems.forEach((_, i) => place(i, bottom.x + (i % 2) * half, y + Math.floor(i / 2) * legendRowH, legendRowH, half - 1.5));
    }
    ctx.add('tasks.legend', s.pages.weekly.legend, lp);
    y += legendH;
  }
  if (footer === 'expenses') {
    const f = ctx.rect('tasks.expenses', { x: bottom.x, y: y + 1, w: bottom.w, h: footerH - 1 });
    const p: Prim[] = [line(f.x, f.y, f.x + f.w, f.y, ctx.stroke('rule', 'ink', { use: 'separator' }))];
    p.push(...ctx.textIn(s.week.expenses, { x: f.x, y: f.y + 2, w: f.w, h: 3 }, { role: 'label', size: ctx.theme.sizes.label, upper: true, tracking: true }).prims);
    const t = ctx.textAt(s.week.expensesTotal, f.x, f.y + f.h - 1.5, { role: 'body', size: 'body', upper: true });
    p.push(t.prim, line(f.x + t.width + 3, f.y + f.h - 1.1, f.x + f.w, f.y + f.h - 1.1, ctx.stroke('strong', 'ink', { use: 'writing' })));
    ctx.add('tasks.expenses', s.week.expenses, p);
  } else if (footer === 'review') {
    const f = ctx.rect('tasks.review', { x: bottom.x, y: y + 1, w: bottom.w, h: footerH - 1 });
    const p: Prim[] = [line(f.x, f.y, f.x + f.w, f.y, ctx.stroke('rule', 'ink', { use: 'separator' }))];
    p.push(...ctx.textIn(s.week.review, { x: f.x, y: f.y + 2, w: f.w, h: 3 }, { role: 'label', size: ctx.theme.sizes.label, upper: true, tracking: true }).prims);
    const steps = s.pages.weekly.reviewSteps;
    const half = Math.ceil(steps.length / 2);
    const colsR = hsplit({ x: f.x, y: f.y + 5, w: f.w, h: f.h - 5 }, [flex(), flex()], 4);
    steps.forEach((st, i) => {
      const col = colsR[i < half ? 0 : 1]!;
      const k = i < half ? i : i - half;
      const yy = col.y + 2 + k * 4.4;
      p.push(rect({ x: col.x, y: yy - 2.2, w: 2.4, h: 2.4 }, { stroke: ctx.stroke('hair', 'ink') }));
      p.push(...ctx.textIn(st, { x: col.x + 3.4, y: yy - 2.4, w: col.w - 3.4, h: 3 }, { role: 'body', size: 'tiny', fit: true }).prims);
    });
    ctx.add('tasks.review', s.week.review, p);
  }
}

/* ---------- Horizontal: días apilados (lun–mié + notas | jue–dom) ---------- */

function horizontalWeek(ctx: LayoutContext, page: PagePlan, week: WeekInfo, left: boolean): void {
  const r = left ? weekHeader(ctx, week, page, true) : takeTop(ctx.content, 0)[1];
  const days = week.days.slice(...weekSplit('horizontal', left));
  const slots = left ? 4 : 4;
  const parts = rows(r, slots, 2);
  days.forEach((day, i) => {
    const row = ctx.rect(`day.${left ? i : i + 3}`, parts[i]!);
    const p: Prim[] = [];
    if (day.isWeekend && ctx.theme.weekendShading) p.push(rect(row, { fill: ctx.fill('weekend') }));
    p.push(line(row.x, row.y, row.x + row.w, row.y, ctx.stroke('rule', 'ink', { use: 'table' })));
    p.push(...dayHeading(ctx, day, row.x + 1.5, row.y + 4, row.w - 3));
    p.push(...writingArea(ctx, { x: row.x, y: row.y + 5, w: row.w, h: row.h - 5 }, 'auto'));
    ctx.add(`day.${left ? i : i + 3}`, `${day.d}`, p, { bbox: row });
  });
  if (left) {
    const nrow = ctx.rect('week.notes', parts[3]!);
    const p: Prim[] = [line(nrow.x, nrow.y, nrow.x + nrow.w, nrow.y, ctx.stroke('heavy', 'ink', { use: 'separator' }))];
    const pr = ctx.has('top-priorities');
    p.push(...ctx.textIn(pr ? ctx.s.week.priorities : ctx.s.week.notes, { x: nrow.x, y: nrow.y + 2, w: nrow.w, h: 3 }, { role: 'label', size: 'label', upper: true, tracking: true }).prims);
    p.push(...(pr ? checklist(ctx, { x: nrow.x, y: nrow.y + 4, w: nrow.w, h: nrow.h - 4 }, ctx.theme.writing.pitch, { circles: true, max: 3 }) : writingArea(ctx, { x: nrow.x, y: nrow.y + 4, w: nrow.w, h: nrow.h - 4 }, 'auto')));
    ctx.add('week.notes', ctx.s.week.notes, p);
  }
}

/* ---------- Vertical: columnas por día ---------- */

function verticalWeek(ctx: LayoutContext, page: PagePlan, week: WeekInfo, left: boolean): void {
  const r = left ? weekHeader(ctx, week, page, false) : weekHeaderRight(ctx, week);
  const days = week.days.slice(...weekSplit('vertical', left));
  const colRects = hsplit(r, [...days.map(() => flex()), ...(left ? [] : [flex()])], 2);
  days.forEach((day, i) => {
    const col = ctx.rect(`day.${left ? i : i + 4}`, colRects[i]!);
    const p: Prim[] = [];
    if (day.isWeekend && ctx.theme.weekendShading) p.push(rect(col, { fill: ctx.fill('weekend') }));
    p.push(line(col.x, col.y, col.x + col.w, col.y, ctx.stroke('rule', 'ink', { use: 'table' })));
    p.push(...ctx.textIn(weekdayLabel(ctx.doc.locale, day.dow), { x: col.x, y: col.y + 1.5, w: col.w, h: 3 }, { role: 'labelStrong', size: 'label', align: 'center' }).prims);
    p.push(...ctx.textIn(String(day.d), { x: col.x, y: col.y + 5, w: col.w, h: 6 }, { role: 'display', size: ctx.theme.sizes.subtitle + 4, align: 'center', features: TABULAR_FEATURES }).prims);
    const h = day.holidays[0];
    if (h) {
      const ht = ctx.textIn(h.name, { x: col.x + 0.5, y: col.y + 12.5, w: col.w - 1, h: 5.5 }, { role: 'label', size: 'tiny', upper: true, align: 'center', wrap: true, maxLines: 2, ellipsis: true, fit: true, silent: true });
      if (ht.truncated) abbreviated(ctx, h.name, 'holiday');
      p.push(...ht.prims);
    }
    if (showMoon(ctx) && day.moon) p.push(...moonIcon(ctx, col.x + col.w - 2, col.y + 3, 1.2, day.moon, south(ctx)));
    p.push(...ruledLines({ x: col.x + 0.5, y: col.y + 18, w: col.w - 1, h: col.h - 18 }, ctx.theme.writing.pitch, ctx.stroke('hair')));
    ctx.add(`day.${left ? i : i + 4}`, `${day.d}`, p, { bbox: col });
  });
  if (!left) {
    const nc = ctx.rect('week.notes', colRects[days.length]!);
    const p: Prim[] = [line(nc.x, nc.y, nc.x + nc.w, nc.y, ctx.stroke('heavy', 'ink', { use: 'separator' }))];
    p.push(...ctx.textIn(ctx.s.common.notes, { x: nc.x, y: nc.y + 1.5, w: nc.w, h: 3 }, { role: 'label', size: 'label', upper: true, tracking: true, align: 'center' }).prims);
    p.push(...writingArea(ctx, { x: nc.x, y: nc.y + 6, w: nc.w, h: nc.h - 6 }, 'auto'));
    ctx.add('week.notes', ctx.s.week.notes, p);
  }
}

function weekHeaderRight(ctx: LayoutContext, week: WeekInfo): Rect {
  const [head, rest] = takeTop(ctx.content, 12, 5);
  const t = textLine(ctx, 'week.title', fmt(ctx.s.week.label, { n: week.number }), { x: head.x + head.w, baseline: head.y + 4 }, { role: 'label', size: ctx.theme.sizes.label + 1, upper: true, tracking: true, align: 'right' });
  ctx.add('week.title', 'Semana', [t.prim]);
  return rest;
}

/* ---------- Día por página ---------- */

function dailyPage(ctx: LayoutContext, page: PagePlan): void {
  const isos = param<string[]>(page, 'days', []);
  const days = isos.map((iso) => ctx.doc.cal.day(iso)!).filter(Boolean);
  const c = ctx.content;
  const s = ctx.s.pages.daily;
  const parts = days.length > 1 ? rows(c, days.length, 4) : [c];
  days.forEach((day, i) => {
    const area = parts[i]!;
    const single = days.length === 1;
    const [headBase, body] = takeTop(area, single ? 16 : 10, 2);
    const head = ctx.rect(`daily.${i}.head`, headBase);
    const hp: Prim[] = [];
    const num = ctx.textAt(String(day.d), head.x, head.y + (single ? 11 : 7), { role: 'display', size: single ? ctx.theme.sizes.monthHero * 0.62 : ctx.theme.sizes.title, features: TABULAR_FEATURES });
    hp.push(num.prim);
    const wd = new Intl.DateTimeFormat(ctx.doc.locale, { weekday: 'long', month: 'long', timeZone: 'UTC' }).formatToParts(new Date(`${day.iso}T12:00:00Z`));
    const wdName = (wd.find((p) => p.type === 'weekday')?.value ?? '').toLocaleUpperCase(ctx.doc.locale);
    const mName = (wd.find((p) => p.type === 'month')?.value ?? '').toLocaleUpperCase(ctx.doc.locale);
    hp.push(ctx.textAt(wdName, num.bbox.x + num.width + 3, head.y + (single ? 6 : 4), { role: 'labelStrong', size: 'label', tracking: true }).prim);
    hp.push(ctx.textAt(`${mName} ${day.y}`, num.bbox.x + num.width + 3, head.y + (single ? 10.5 : 7.5), { role: 'label', size: 'labelSmall', tracking: true }).prim);
    const hol = day.holidays[0];
    if (hol) {
      const ht = ctx.textIn(hol.name, { x: head.x + head.w * 0.45, y: head.y + 1, w: head.w * 0.5, h: 6 }, { role: 'body', size: 'small', align: 'right', wrap: true, maxLines: 2, ellipsis: true, silent: true });
      if (ht.truncated) abbreviated(ctx, hol.name, 'holiday');
      hp.push(...ht.prims);
    }
    if (showMoon(ctx) && day.moon) hp.push(...moonIcon(ctx, head.x + head.w - 2, head.y + head.h - 3, 1.5, day.moon, south(ctx)));
    hp.push(line(head.x, head.y + head.h, head.x + head.w, head.y + head.h, ctx.stroke('rule', 'ink', { use: 'separator' })));
    ctx.add(`daily.${i}.head`, day.iso, hp);
    if (!single) {
      ctx.add(`daily.${i}.notes`, day.iso, writingArea(ctx, ctx.rect(`daily.${i}.notes`, body), 'auto'), { role: 'writing' });
      return;
    }
    // Página completa: recordatorios, 3 importantes, notas libres y cierre del día.
    const pitch = ctx.theme.writing.pitch;
    const blocks: Array<{ id: string; label: string; lines: number; on: boolean; circles?: boolean }> = [
      { id: 'remember', label: s.remember, lines: 2, on: ctx.has('external-memory') },
      { id: 'top3', label: s.top3, lines: 3, on: true, circles: true },
    ];
    let y = body.y;
    for (const b of blocks) {
      if (!b.on) continue;
      const box = ctx.rect(`daily.${b.id}`, { x: body.x, y, w: body.w, h: 2.5 + b.lines * pitch });
      const lab = ctx.textIn(b.label, { x: box.x, y: box.y, w: box.w, h: 3 }, { role: 'label', size: 'labelSmall', upper: true, tracking: true });
      const area = { x: box.x, y: box.y + 2.5, w: box.w, h: box.h - 2.5 };
      ctx.add(`daily.${b.id}`, b.label, [...lab.prims, ...(b.circles ? checklist(ctx, area, pitch, { circles: true }) : ruledLines(area, pitch, ctx.stroke('hair')))]);
      y += 2.5 + b.lines * pitch + 3;
    }
    const closing: Array<{ id: string; label: string; on: boolean; lines: number }> = [
      { id: 'progress', label: s.progress, on: ctx.has('done-list'), lines: 2 },
      { id: 'good', label: ctx.s.pages.goodThings.title, on: ctx.has('three-good-things'), lines: 3 },
      { id: 'learned', label: s.learned, on: ctx.has('daily-reflection'), lines: 2 },
      { id: 'tomorrow', label: s.tomorrow, on: ctx.has('brain-dump'), lines: 2 },
    ].filter((x) => x.on);
    const closingH = closing.reduce((sum, x) => sum + 3 + x.lines * pitch + 2, 0) + (ctx.has('mood-log') ? 7 : 0) + (ctx.has('focus-breaks') ? 7 : 0);
    const notesArea = { x: body.x, y, w: body.w, h: Math.max(10, body.y + body.h - y - closingH) };
    ctx.add('daily.notes', s.top3, writingArea(ctx, ctx.rect('daily.notes', notesArea), 'auto'), { role: 'writing' });
    y = notesArea.y + notesArea.h + 2;
    if (ctx.has('focus-breaks')) {
      const lab = ctx.textAt(s.focus, body.x, y + 3, { role: 'label', size: 'labelSmall', upper: true, tracking: true });
      const p: Prim[] = [lab.prim];
      for (let k = 0; k < 8; k++) p.push(circle(body.x + lab.width + 4 + k * 4.5, y + 2, 1.6, { stroke: ctx.stroke('hair', 'ink') }));
      ctx.add('daily.focus', s.focus, p);
      y += 7;
    }
    for (const b of closing) {
      const box = ctx.rect(`daily.${b.id}`, { x: body.x, y, w: body.w, h: 2.5 + b.lines * pitch });
      const lab = ctx.textIn(b.label, { x: box.x, y: box.y, w: box.w, h: 3 }, { role: 'label', size: 'labelSmall', upper: true, tracking: true });
      const area = { x: box.x, y: box.y + 2.5, w: box.w, h: box.h - 2.5 };
      ctx.add(`daily.${b.id}`, b.label, [...lab.prims, ...ruledLines(area, pitch, ctx.stroke('hair'))]);
      y += 2.5 + b.lines * pitch + 2;
    }
    if (ctx.has('mood-log')) {
      const lab = ctx.textAt(s.mood, body.x, y + 3, { role: 'label', size: 'labelSmall', upper: true, tracking: true });
      const p: Prim[] = [lab.prim];
      for (let k = 1; k <= 5; k++) {
        const cx = body.x + lab.width + 5 + (k - 1) * 6;
        p.push(checkCircle(ctx, cx, y + 2, 2));
        p.push(...ctx.textIn(String(k), { x: cx - 2, y: y + 0.2, w: 4, h: 3.6 }, { role: 'number', size: ctx.theme.sizes.tiny, align: 'center', valign: 'middle' }).prims);
      }
      ctx.add('daily.mood', s.mood, p);
    }
  });
}

export const WEEK_SECTIONS: SectionModule[] = [weeks];
