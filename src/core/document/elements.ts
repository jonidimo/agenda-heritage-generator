/**
 * Elementos compuestos (`customBlocks` de tipo tabla, lista, hábitos, finanzas, minicalendario,
 * cuadrantes, notas, línea de horas y valoración): se dibujan completos dentro de su caja con las
 * piezas de `widgets.ts`, las mismas que usan las secciones del programa. Cada propiedad se lee con
 * su rango (un archivo con valores fuera de rango o de otro tipo se acomoda, nunca falla).
 */
import type { DayInfo } from '../calendar';
import { monthNames } from '../calendar/locale';
import {
  CHECK_SHAPES,
  enumProp,
  type ElementKind,
  NOTE_STYLES,
  numProp,
  PROP_DEFAULTS,
  PROP_RANGES,
  QUADRANT_STYLES,
  RATING_FORMS,
  stringList,
} from '../design/customBlocks';
import { inset } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import { line, rect, type LinkArea, type Prim } from '../layout/prims';
import { amountLines, checklist, dotField, habitGrid, miniCalendar, ratingShape, ruledLines, squareGrid, tableGrid, writingArea } from '../layout/widgets';
import { order } from '../sections/common';
import type { PagePlan } from '../sections/types';
import { ptToMm, type Rect } from '../util/geometry';

export interface ElementDrawing {
  prims: Prim[];
  /** Zonas tocables del PDF (los días de un minicalendario). */
  links: LinkArea[];
}

const int = (v: unknown, r: { min: number; max: number }, def: number): number => Math.round(numProp(v, r, def));

/** El mes de un minicalendario: el elegido, o el de la página, o el primero de la agenda. */
function monthFor(ctx: LayoutContext, page: PagePlan, want: unknown): { y: number; m: number } {
  const picked = typeof want === 'string' ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(want) : null;
  if (picked) return { y: Number(picked[1]), m: Number(picked[2]) };
  const own = page.params?.month as { y: number; m: number } | undefined;
  if (own) return own;
  const first = ctx.doc.cal.months[0];
  return first ? { y: first.y, m: first.m } : { y: ctx.doc.design.calendar.year, m: ctx.doc.design.calendar.startMonth };
}

/** Hora del reloj en el idioma de la agenda («7:00», «7 AM»…). */
function hourLabel(locale: string, minutes: number, withMinutes: boolean): string {
  const at = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60) % 24, minutes % 60));
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', ...(withMinutes ? { minute: '2-digit' as const } : {}), timeZone: 'UTC' }).format(at);
  } catch {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  }
}

function drawTable(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  return {
    prims: tableGrid(ctx, box, {
      rows: int(p.rows, PROP_RANGES.tableRows, PROP_DEFAULTS.tableRows),
      cols: int(p.cols, PROP_RANGES.tableCols, PROP_DEFAULTS.tableCols),
      header: p.header !== false,
      headers: stringList(p.headers, PROP_RANGES.tableCols.max),
    }),
    links: [],
  };
}

function drawChecklist(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  const items = int(p.items, PROP_RANGES.checkItems, PROP_DEFAULTS.checkItems);
  const columns = Math.min(int(p.columns, PROP_RANGES.checkColumns, 1), items);
  const shape = enumProp(p.shape, CHECK_SHAPES, 'circle');
  const labels = stringList(p.labels);
  const perColumn = Math.ceil(items / columns);
  const gap = 5;
  const colW = (box.w - gap * (columns - 1)) / columns;
  const pitch = box.h / perColumn;
  const prims: Prim[] = [];
  for (let c = 0; c < columns; c++) {
    const count = Math.min(perColumn, items - c * perColumn);
    prims.push(...checklist(ctx, { x: box.x + c * (colW + gap), y: box.y, w: colW, h: pitch * count }, pitch, { max: count, circles: shape !== 'none', square: shape === 'square', labels: labels.slice(c * perColumn, c * perColumn + count) }));
  }
  return { prims, links: [] };
}

function drawHabits(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  return {
    prims: habitGrid(ctx, box, { rows: int(p.rows, PROP_RANGES.habitRows, PROP_DEFAULTS.habitRows), days: int(p.days, PROP_RANGES.habitDays, PROP_DEFAULTS.habitDays), names: stringList(p.names, PROP_RANGES.habitRows.max) }),
    links: [],
  };
}

function drawFinance(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  const lines = int(p.lines, PROP_RANGES.amountLines, PROP_DEFAULTS.amountLines);
  const title = typeof p.title === 'string' ? p.title.slice(0, 120) : '';
  const prims: Prim[] = [];
  let area = box;
  if (title) {
    const head = Math.min(6.5, box.h * 0.2);
    prims.push(...ctx.textIn(title, { x: box.x, y: box.y, w: box.w, h: head }, { role: 'heading', size: 'labelSmall', upper: true, tracking: true, valign: 'middle', fit: true, wrap: false }).prims);
    area = { x: box.x, y: box.y + head, w: box.w, h: box.h - head };
  }
  const total = p.total !== false;
  // El renglón del total es un poco más alto que los demás y va al pie, con su marco.
  const totalH = total ? Math.min(10, area.h * 0.25) : 0;
  const rows = { x: area.x, y: area.y, w: area.w, h: area.h - totalH };
  prims.push(...amountLines(ctx, rows, rows.h / lines));
  if (total) {
    const t = { x: area.x, y: area.y + area.h - totalH + 1.5, w: area.w, h: totalH - 1.5 };
    prims.push(rect(t, { stroke: ctx.stroke('rule', 'ink', { use: 'frame' }) }));
    prims.push(...ctx.textIn(ctx.s.common.total, inset(t, 0, 2.5), { role: 'heading', size: 'labelSmall', upper: true, tracking: true, valign: 'middle', fit: true, wrap: false }).prims);
    prims.push(ctx.textAt(ctx.doc.currency, t.x + t.w * 0.7 + 1, t.y + t.h / 2 + 1.4, { role: 'label', size: 'labelSmall', color: '#9a9a9a' }).prim);
  }
  return { prims, links: [] };
}

function drawMiniCal(ctx: LayoutContext, p: Record<string, unknown>, box: Rect, page: PagePlan): ElementDrawing {
  const { y, m } = monthFor(ctx, page, p.month);
  const weeks = ctx.doc.cal.monthGrid(y, m);
  const prims: Prim[] = [];
  const links: LinkArea[] = [];
  let area = box;
  if (p.title !== false) {
    const head = Math.min(6, box.h * 0.2);
    const name = (monthNames(ctx.doc.locale)[m - 1] ?? '').toLocaleUpperCase(ctx.doc.locale);
    prims.push(...ctx.textIn(`${name} ${y}`, { x: box.x, y: box.y, w: box.w, h: head }, { role: 'labelStrong', size: 'label', tracking: 0.08, align: 'center', valign: 'middle', fit: true, wrap: false }).prims);
    area = { x: box.x, y: box.y + head, w: box.w, h: box.h - head };
  }
  const rowsData = weeks.map((w) => (w.length === 7 ? w : ([] as DayInfo[]))).filter((w) => w.length === 7);
  prims.push(
    ...miniCalendar(ctx, area, rowsData, {
      month: { y, m },
      otherMonth: 'dim',
      order: order(ctx),
      weekendStyle: 'gray',
      holidays: 'underline',
      onCell: (day, cell, inMonth) => {
        if (inMonth) links.push({ ...cell, to: { kind: 'date', iso: day.iso }, cat: 'days' });
      },
    }),
  );
  return { prims, links };
}

function drawQuadrants(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  const titles = stringList(p.titles, 4);
  const style = enumProp(p.style, QUADRANT_STYLES, 'blank');
  const w = box.w / 2;
  const h = box.h / 2;
  const prims: Prim[] = [];
  for (let i = 0; i < 4; i++) {
    const q = { x: box.x + (i % 2) * w, y: box.y + Math.floor(i / 2) * h, w, h };
    const head = Math.min(6.5, h * 0.25);
    if (titles[i]) {
      prims.push(...ctx.textIn(titles[i]!, { x: q.x + 1.5, y: q.y + 0.5, w: q.w - 3, h: head }, { role: 'heading', size: 'labelSmall', upper: true, tracking: true, valign: 'middle', fit: true, wrap: false }).prims);
      prims.push(line(q.x + 1.5, q.y + head + 0.5, q.x + q.w - 1.5, q.y + head + 0.5, ctx.stroke('hair', 'ruleSoft', { use: 'separator' })));
    }
    const body = { x: q.x + 1.5, y: q.y + (titles[i] ? head + 1 : 1), w: q.w - 3, h: q.h - (titles[i] ? head + 2 : 2) };
    if (style === 'lines') prims.push(...ruledLines(body, ctx.theme.writing.pitch, ctx.stroke('hair')));
    else if (style === 'dots') prims.push(dotField(body, ctx.theme.dots.pitch, ptToMm(ctx.theme.dots.radius), ctx.theme.dots.color));
  }
  const grid = ctx.stroke('rule', 'ink', { use: 'table' });
  prims.push(line(box.x + w, box.y, box.x + w, box.y + box.h, grid), line(box.x, box.y + h, box.x + box.w, box.y + h, grid), rect(box, { stroke: grid }));
  return { prims, links: [] };
}

function drawNotes(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  const title = typeof p.title === 'string' ? p.title.slice(0, 120) : '';
  const prims: Prim[] = [];
  let area = box;
  if (title) {
    const head = Math.min(7, box.h * 0.25);
    prims.push(...ctx.textIn(title, { x: box.x + 1, y: box.y, w: box.w - 2, h: head }, { role: 'heading', size: 'label', upper: true, tracking: true, valign: 'middle', fit: true, wrap: false }).prims);
    prims.push(line(box.x, box.y + head, box.x + box.w, box.y + head, ctx.stroke('rule', 'ink', { use: 'separator' })));
    area = { x: box.x, y: box.y + head + 0.5, w: box.w, h: box.h - head - 0.5 };
  }
  const style = NOTE_STYLES.find((s) => s === p.style);
  prims.push(...(style === 'grid' ? squareGrid(area, PROP_DEFAULTS.gridPitch, ctx.stroke('grid', 'ruleSoft')) : writingArea(ctx, area, style ?? 'auto')));
  if (p.frame === true) prims.push(rect(box, { stroke: ctx.stroke('rule', 'ink', { use: 'frame' }) }));
  return { prims, links: [] };
}

function drawTimeline(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  const from = int(p.from, PROP_RANGES.hourFrom, PROP_DEFAULTS.hourFrom);
  // Termina después de empezar: un archivo con el fin antes del comienzo se acomoda a una hora de recorrido.
  const to = Math.max(from + 1, int(p.to, PROP_RANGES.hourTo, PROP_DEFAULTS.hourTo));
  const step = int(p.step, PROP_RANGES.hourStep, PROP_DEFAULTS.hourStep);
  const slots = Math.max(1, Math.floor(((to - from) * 60) / step));
  const rowH = box.h / slots;
  const labelW = Math.min(14, box.w * 0.22);
  const prims: Prim[] = [];
  for (let i = 0; i < slots; i++) {
    const minutes = from * 60 + i * step;
    const y = box.y + i * rowH;
    const onHour = minutes % 60 === 0;
    prims.push(...ctx.textIn(hourLabel(ctx.doc.locale, minutes, step % 60 !== 0), { x: box.x, y, w: labelW - 1.5, h: rowH }, { role: 'number', size: ctx.theme.sizes.tiny + 0.5, align: 'right', valign: 'top', color: onHour ? ctx.theme.colors.ink : '#9a9a9a', fit: true, wrap: false }).prims);
    prims.push(line(box.x + labelW, y, box.x + box.w, y, ctx.stroke('hair', onHour ? undefined : 'ruleSoft', { use: 'writing' })));
  }
  prims.push(line(box.x + labelW, box.y + box.h, box.x + box.w, box.y + box.h, ctx.stroke('hair', undefined, { use: 'writing' })), line(box.x + labelW, box.y, box.x + labelW, box.y + box.h, ctx.stroke('hair', 'ruleSoft', { use: 'table' })));
  return { prims, links: [] };
}

function drawRating(ctx: LayoutContext, p: Record<string, unknown>, box: Rect): ElementDrawing {
  const count = int(p.count, PROP_RANGES.ratingCount, PROP_DEFAULTS.ratingCount);
  const shape = enumProp(p.shape, RATING_FORMS, 'star');
  const text = typeof p.text === 'string' ? p.text.slice(0, 120) : '';
  const prims: Prim[] = [];
  let area = box;
  if (text) {
    const w = Math.min(box.w * 0.4, 40);
    prims.push(...ctx.textIn(text, { x: box.x, y: box.y, w: w - 1.5, h: box.h }, { role: 'label', size: ctx.theme.sizes.small, valign: 'middle', fit: true, wrap: false }).prims);
    area = { x: box.x + w, y: box.y, w: box.w - w, h: box.h };
  }
  const cell = area.w / count;
  const size = Math.max(1, Math.min(area.h * 0.82, cell * 0.8));
  for (let i = 0; i < count; i++) prims.push(ratingShape(ctx, shape, area.x + cell * (i + 0.5), area.y + area.h / 2, size));
  return { prims, links: [] };
}

/** Dibuja un elemento compuesto en su caja. Con `paper`, sobre un fondo blanco que tapa lo que la página tenga debajo (puntos, renglones). */
export function drawElement(ctx: LayoutContext, kind: ElementKind, props: Record<string, unknown>, box: Rect, page: PagePlan): ElementDrawing {
  const drawing = drawKind(ctx, kind, props, box, page);
  return props.paper === true ? { ...drawing, prims: [rect(box, { fill: ctx.fill('paper') }), ...drawing.prims] } : drawing;
}

function drawKind(ctx: LayoutContext, kind: ElementKind, props: Record<string, unknown>, box: Rect, page: PagePlan): ElementDrawing {
  switch (kind) {
    case 'table':
      return drawTable(ctx, props, box);
    case 'checklist':
      return drawChecklist(ctx, props, box);
    case 'habits':
      return drawHabits(ctx, props, box);
    case 'finance':
      return drawFinance(ctx, props, box);
    case 'minical':
      return drawMiniCal(ctx, props, box, page);
    case 'quadrants':
      return drawQuadrants(ctx, props, box);
    case 'notes':
      return drawNotes(ctx, props, box);
    case 'timeline':
      return drawTimeline(ctx, props, box);
    case 'rating':
      return drawRating(ctx, props, box);
  }
}
