/**
 * Páginas mensuales: portada, registro diario, vista mensual, registro de
 * hábitos, balance, resumen y notas.
 */
import type { DayInfo, MonthInfo } from '../calendar';
import { dateOrder, formatDayMonth, weekdayLabel, weekdayLetter } from '../calendar/locale';
import { fmt } from '../i18n';
import { centerIn, cols, flex, grid, hsplit, inset, rows, takeBottom, takeTop, vsplit } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import { circle, line, rect, type LinkArea, type Prim } from '../layout/prims';
import { amountLines, heartIcon, isSouthern, moonIcon, ruledLines, sectionHeader, textLine, writingArea } from '../layout/widgets';
import { TABULAR_FEATURES } from '../text/shape';
import { ptToMm, type Rect } from '../util/geometry';
import { abbreviated, checklist, headed, label, monthTitle, nextMonthName, order } from './common';
import { opt, param, type PagePlan, type PagePlanDraft, type SectionModule } from './types';

function monthOf(ctx: LayoutContext, page: PagePlan): MonthInfo {
  const m = page.params?.month as { y: number; m: number } | undefined;
  const found = m ? ctx.doc.cal.months.find((x) => x.y === m.y && x.m === m.m) : undefined;
  if (!found) throw new Error(`Mes no encontrado para ${page.key}`);
  return found;
}

function monthDraft(month: MonthInfo, itemId: string, suffix: string, type: string, title: string, extra: Partial<PagePlanDraft> = {}): PagePlanDraft {
  return {
    key: `month:${month.key}:${suffix}`,
    type,
    section: itemId,
    title,
    group: `month:${month.key}`,
    ...extra,
    params: { month: { y: month.y, m: month.m }, monthName: month.name, ...(extra.params ?? {}) },
  };
}

const south = (ctx: LayoutContext): boolean => isSouthern(ctx.doc.design.holidays.country, ctx.doc.design.astronomy.hemisphere);
const showMoon = (ctx: LayoutContext, where: 'monthLog' | 'monthGrid'): boolean => ctx.doc.design.astronomy.moonPhases && ctx.doc.design.astronomy.showIn.includes(where);

/* ---------- Portada mensual ---------- */

export const monthCover: SectionModule = {
  type: 'monthCover',
  scope: 'month',
  defaults: { sticker: true, phrase: true, intention: false, focusHabit: false, woop: 'auto' },
  plan: (_doc, item, month) => (month ? [monthDraft(month, item.id, 'cover', 'monthCover', month.name, { startOn: 'recto', params: { ...item.options } })] : []),
  layout(ctx, page) {
    const month = monthOf(ctx, page);
    const c = ctx.content;
    const scaleK = ctx.page.w / 148.5;
    const nameRun = ctx.run(month.name, { role: 'display', size: 'monthHero' });
    const nameBase = c.y + 6 + nameRun.capHeight;
    const name = textLine(ctx, 'cover.month', month.name, { x: c.x, baseline: nameBase }, { role: 'display', size: 'monthHero' });
    ctx.add('cover.month', 'Nombre del mes', [name.prim]);
    let y = nameBase + 8;
    const woopOpt = param<string | boolean>(page, 'woop', 'auto');
    const woop = woopOpt === true || (woopOpt === 'auto' && (ctx.has('woop') || ctx.has('fresh-start')));
    const phraseOn = param(page, 'phrase', true);
    const phraseIdx = (month.m - 1) % 12;
    const phrases = ctx.doc.design.persona.phrases.length >= 12 ? ctx.doc.design.persona.phrases : ctx.s.phrases;
    const phrase = phraseVars(ctx, phrases[phraseIdx] ?? '');
    const bottomReserve = phraseOn && phrase ? 18 : 0;
    const fieldsOn = param(page, 'intention', false) || param(page, 'focusHabit', false);
    const woopH = woop ? 46 : 0;
    const fieldsH = fieldsOn ? 2 * Math.max(9, ctx.theme.writing.pitch * 1.4) + 2 : 0;
    if (param(page, 'sticker', true)) {
      const avail = c.y + c.h - bottomReserve - woopH - fieldsH - y - 4;
      const size = Math.max(30, Math.min(70 * scaleK, c.w * 0.62, avail));
      const natural = centerIn({ x: c.x, y, w: c.w, h: size }, size, size);
      const box = ctx.rect('cover.sticker', natural);
      const p: Prim[] = [rect(box, { stroke: ctx.stroke('hair', 'rule', { use: 'frame', dash: [1.2, 1] }) })];
      p.push(...ctx.textIn(ctx.s.monthCover.sticker, inset(box, 2), { role: 'label', size: 'labelSmall', upper: true, tracking: true, align: 'center', valign: 'middle', color: '#e2e2e2', fit: true }).prims);
      ctx.add('cover.sticker', 'Espacio para sticker', p);
      y = natural.y + natural.h + 6;
    }
    if (fieldsOn) {
      const pitch = Math.max(9, ctx.theme.writing.pitch * 1.4);
      const p: Prim[] = [];
      const labels = [param(page, 'intention', false) ? ctx.s.monthCover.intention : null, param(page, 'focusHabit', false) ? ctx.s.monthCover.focusHabit : null].filter(Boolean) as string[];
      const fbox = ctx.rect('cover.fields', { x: c.x, y, w: c.w, h: labels.length * pitch });
      const step = fbox.h / Math.max(1, labels.length);
      labels.forEach((l, i) => {
        const by = fbox.y + (i + 1) * step;
        const t = ctx.textAt(l, fbox.x, by, { role: 'heading', size: 'labelSmall', upper: true, tracking: true });
        p.push(t.prim, line(fbox.x + t.width + 2, by + 0.6, fbox.x + fbox.w, by + 0.6, ctx.stroke('hair', undefined, { use: 'writing' })));
      });
      ctx.add('cover.fields', 'Intención y hábito foco', p);
      y += labels.length * pitch + 4;
    }
    if (woop) {
      const box = { x: c.x, y, w: c.w, h: Math.min(woopH - 4, c.y + c.h - bottomReserve - y - 2) };
      if (box.h > 20) {
        const s = ctx.s.pages.woop;
        const head = sectionHeader(ctx, box, s.title, 'cover.woopTitle', { gap: 1.5 });
        const cells = grid(ctx.rect('cover.woop', { x: box.x, y: box.y + head, w: box.w, h: box.h - head }), 2, 2, 3, 2).flat();
        const p: Prim[] = [];
        [s.wish, s.outcome, s.obstacle, s.plan].forEach((label, i) => {
          const cell = cells[i]!;
          p.push(rect(cell, { stroke: ctx.stroke('hair', 'rule', { use: 'table' }) }));
          p.push(...ctx.textIn(`${i + 1}. ${label}`, inset(cell, 1.5, 2), { role: 'label', size: 'labelSmall', upper: true, tracking: 0.05, fit: true }).prims);
        });
        ctx.add('cover.woop', 'Nuevo comienzo (WOOP)', p);
      }
    }
    if (phraseOn && phrase) {
      const box = { x: c.x + c.w - Math.min(95 * scaleK, c.w), y: c.y + c.h - bottomReserve, w: Math.min(95 * scaleK, c.w), h: bottomReserve };
      const t = ctx.textBlock('cover.phrase', box, `“${phrase}”`, { role: 'quote', size: 13, align: 'right', valign: 'bottom', wrap: true, fit: true });
      ctx.add('cover.phrase', 'Frase del mes', t.prims, { text: { kind: 'phrase', index: phraseIdx } });
    }
  },
};

/** Variables de las frases: {year}, {name} y fechas astronómicas reales del año ({marchEquinox}…). */
function phraseVars(ctx: LayoutContext, text: string): string {
  const fmtDay = (iso: string): string => {
    try {
      return formatDayMonth(ctx.doc.locale, iso, dateOrder(ctx.doc.locale, ctx.doc.design.calendar.dateFormat));
    } catch {
      return iso;
    }
  };
  const se = ctx.doc.seasons;
  return fmt(text, {
    year: ctx.doc.design.calendar.year,
    name: ctx.doc.design.persona.name,
    marchEquinox: fmtDay(se.marchEquinox),
    juneSolstice: fmtDay(se.juneSolstice),
    septemberEquinox: fmtDay(se.septemberEquinox),
    decemberSolstice: fmtDay(se.decemberSolstice),
  });
}

/* ---------- Registro diario (una línea por día) ---------- */

export const monthLog: SectionModule = {
  type: 'monthLog',
  scope: 'month',
  defaults: {},
  plan: (_doc, item, month) => (month ? [monthDraft(month, item.id, 'log', 'monthLog', month.name)] : []),
  layout(ctx, page) {
    const month = monthOf(ctx, page);
    const r = headed(ctx, month.name, String(month.y), { titleSize: 'title' });
    const n = month.days.length;
    const rowH = Math.min(r.h / n, 7.5);
    const moon = showMoon(ctx, 'monthLog');
    month.days.forEach((day, i) => {
      const row = ctx.rect(`day.${day.d}`, { x: r.x, y: r.y + i * rowH, w: r.w, h: rowH });
      const p: Prim[] = [];
      if (day.isWeekend && ctx.theme.weekendShading) p.push(rect(row, { fill: ctx.fill('weekend') }));
      p.push(line(row.x, row.y + row.h, row.x + row.w, row.y + row.h, ctx.stroke('hair', undefined, { use: 'table' })));
      const [numCol, dowCol, rest] = hsplit(row, [8, 10, flex()], 1.5);
      const holiday = day.holidays[0];
      p.push(...ctx.textIn(String(day.d), numCol!, { role: holiday ? 'title' : 'display', size: ctx.theme.sizes.calendarNumber + 0.5, align: 'right', valign: 'middle', features: TABULAR_FEATURES }).prims);
      p.push(...ctx.textIn(weekdayLetter(ctx.s, day.dow), dowCol!, { role: 'label', size: ctx.theme.sizes.small, valign: 'middle' }).prims);
      let x = rest!.x;
      if (day.events.length > 0) {
        p.push(heartIcon(ctx, x + 1, row.y + row.h / 2, 1.6));
        const evText = day.events.map((e) => e.label).join(' · ');
        const ev = ctx.textIn(evText, { x: x + 2.6, y: row.y, w: rest!.w * 0.5, h: row.h }, { role: 'body', size: ctx.theme.sizes.tiny + 0.5, valign: 'middle', ellipsis: true, silent: true });
        if (ev.truncated) abbreviated(ctx, evText, 'event');
        p.push(...ev.prims);
        x += 2.6 + ev.bbox.w + 3;
      }
      if (holiday) {
        const w = rest!.x + rest!.w - x - (moon ? 4 : 0);
        if (w > 5) {
          const hn = ctx.textIn(holiday.name, { x, y: row.y, w, h: row.h }, { role: 'label', size: 'tiny', upper: true, tracking: 0.04, valign: 'middle', ellipsis: true, silent: true });
          if (hn.truncated) abbreviated(ctx, holiday.name, 'holiday');
          p.push(...hn.prims);
        }
      }
      if (moon && day.moon) p.push(...moonIcon(ctx, rest!.x + rest!.w - 1.5, row.y + row.h / 2, Math.min(1.4, row.h * 0.26), day.moon, south(ctx)));
      // Solo el número y la inicial del día son tocables: el resto del renglón es para escribir.
      const tap = { x: row.x, y: row.y, w: rest!.x - row.x, h: row.h };
      ctx.add(`day.${day.d}`, `${day.d}`, p, { bbox: row, links: [{ ...tap, to: { kind: 'date', iso: day.iso }, cat: 'days' }] });
    });
  },
};

/* ---------- Vista mensual (grilla) ---------- */

export const monthGrid: SectionModule = {
  type: 'monthGrid',
  scope: 'month',
  defaults: { spread: 'auto' },
  plan: (doc, item, month) => {
    if (!month) return [];
    const spreadOpt = opt<string | boolean>(item, 'spread', 'auto');
    const spread = spreadOpt === true || (spreadOpt === 'auto' && doc.design.theme.comfort === 'wide');
    // `days`: los días del mes que muestra cada página (en dos páginas: lun–jue | vie–dom, según el orden de la semana).
    const daysOf = (cols: number[]): string[] => month.grid.flatMap((w) => cols.map((c) => w[c]!)).filter((d) => d.m === month.m && d.y === month.y).map((d) => d.iso);
    if (!spread) return [monthDraft(month, item.id, 'grid', 'monthGrid', month.name, { params: { part: -1, days: daysOf([0, 1, 2, 3, 4, 5, 6]) } })];
    return [0, 1].map((part) => monthDraft(month, item.id, `grid:${part}`, 'monthGrid', month.name, { startOn: part === 0 ? 'verso' : 'any', params: { part, days: daysOf(part === 0 ? [0, 1, 2, 3] : [4, 5, 6]) } }));
  },
  layout(ctx, page) {
    const month = monthOf(ctx, page);
    const part = param(page, 'part', -1);
    const ord = order(ctx);
    const r = headed(ctx, part === 1 ? '' : month.name, part === 0 ? '' : String(month.y), { titleSize: 'title' });
    const colIdx = part === -1 ? [0, 1, 2, 3, 4, 5, 6] : part === 0 ? [0, 1, 2, 3] : [4, 5, 6];
    const notesCol = part === 1;
    const [headBase, body] = takeTop(r, 5);
    const head = ctx.rect('grid.head', headBase);
    const tracks = [...colIdx.map(() => flex()), ...(notesCol ? [flex(1)] : [])];
    const headCols = hsplit(head, tracks);
    const p: Prim[] = [];
    colIdx.forEach((ci, k) => {
      const dow = ord[ci]!;
      p.push(...ctx.textIn(weekdayLabel(ctx.doc.locale, dow), headCols[k]!, { role: 'labelStrong', size: 'labelSmall', align: 'center', valign: 'middle', tracking: 0.05 }).prims);
    });
    if (notesCol) p.push(...ctx.textIn(ctx.s.common.notes, headCols[colIdx.length]!, { role: 'heading', size: 'labelSmall', align: 'center', valign: 'middle', tracking: true }).prims);
    ctx.add('grid.head', 'Encabezado', p);
    const weeks = month.grid;
    const rowRects = rows(body, weeks.length);
    weeks.forEach((week, wi) => {
      const row = ctx.rect(`grid.week.${wi}`, rowRects[wi]!);
      const cells = hsplit(row, tracks);
      const wp: Prim[] = [line(row.x, row.y, row.x + row.w, row.y, ctx.stroke('rule', 'ink', { use: 'table' }))];
      const links: LinkArea[] = [];
      colIdx.forEach((ci, k) => {
        const day = week[ci]!;
        const cell = cells[k]!;
        wp.push(...gridCell(ctx, day, cell, month, wi === 0 && k === 0));
        // La esquina del número es tocable; el resto de la casilla queda para escribir.
        if (day.m === month.m && day.y === month.y) links.push({ x: cell.x, y: cell.y, w: Math.min(cell.w, 8), h: Math.min(cell.h, 6.5), to: { kind: 'date', iso: day.iso }, cat: 'days' });
        if (k > 0) wp.push(line(cell.x, row.y, cell.x, row.y + row.h, ctx.stroke('hair', undefined, { use: 'table' })));
      });
      if (notesCol) {
        const nc = cells[colIdx.length]!;
        wp.push(line(nc.x, row.y, nc.x, row.y + row.h, ctx.stroke('hair', undefined, { use: 'table' })));
        wp.push(...ruledLines(inset(nc, 0, 1.5), Math.max(5, ctx.theme.writing.pitch), ctx.stroke('hair')));
      }
      if (wi === weeks.length - 1) wp.push(line(row.x, row.y + row.h, row.x + row.w, row.y + row.h, ctx.stroke('rule', 'ink', { use: 'table' })));
      ctx.add(`grid.week.${wi}`, `Semana ${wi + 1}`, wp, { links });
    });
  },
};

function gridCell(ctx: LayoutContext, day: DayInfo, cell: Rect, month: MonthInfo, _first: boolean): Prim[] {
  const out: Prim[] = [];
  const inMonth = day.m === month.m && day.y === month.y;
  if (day.isWeekend && ctx.theme.weekendShading && inMonth) out.push(rect(cell, { fill: ctx.fill('weekend') }));
  if (!inMonth) return out;
  const num = ctx.textIn(String(day.d), { x: cell.x + 1.2, y: cell.y + 1.2, w: cell.w - 2.4, h: 4 }, { role: day.holidays.length ? 'labelStrong' : 'number', size: ctx.theme.sizes.calendarNumber, features: TABULAR_FEATURES });
  out.push(...num.prims);
  let y = cell.y + 6;
  for (const h of day.holidays.slice(0, 1)) {
    // Dos líneas (tres si la celda es alta), con todo el alto libre de la celda; si no entra, se abrevia y se avisa.
    const free = Math.max(5, cell.y + cell.h - y - 1.2);
    const maxLines = free >= ptToMm(ctx.theme.sizes.tiny) * 1.3 * 6 ? 3 : 2;
    const t = ctx.textIn(h.name, { x: cell.x + 1.2, y, w: cell.w - 2.4, h: free }, { role: 'label', size: 'tiny', upper: true, wrap: true, maxLines, ellipsis: true, fit: true, silent: true });
    if (t.truncated) abbreviated(ctx, h.name, 'holiday');
    out.push(...t.prims);
    y += t.bbox.h + 1.2;
  }
  for (const e of day.events.slice(0, 1)) {
    out.push(heartIcon(ctx, cell.x + 2, y + 1, 1.4));
    const ev = ctx.textIn(e.label, { x: cell.x + 3.4, y: y - 0.3, w: cell.w - 4.6, h: 3 }, { role: 'body', size: 'tiny', ellipsis: true, silent: true });
    if (ev.truncated) abbreviated(ctx, e.label, 'event');
    out.push(...ev.prims);
  }
  if (showMoon(ctx, 'monthGrid') && day.moon) out.push(...moonIcon(ctx, cell.x + cell.w - 2.2, cell.y + 2.6, 1.3, day.moon, south(ctx)));
  return out;
}

/* ---------- Registro de hábitos (página girada) ---------- */

export const habits: SectionModule = {
  type: 'habits',
  scope: 'month',
  defaults: { rows: 10, total: true },
  plan: (_doc, item, month) => (month ? [monthDraft(month, item.id, 'habits', 'habits', month.name, { params: { ...item.options } })] : []),
  layout(ctx, page) {
    const month = monthOf(ctx, page);
    const c = ctx.content;
    // Coordenadas locales giradas −90°: ancho = alto de la página.
    const W = c.h;
    const H = c.w;
    const m = [0, -1, 1, 0, c.x, c.y + c.h] as const;
    const local: Rect = { x: 0, y: 0, w: W, h: H };
    const inner = new LocalBlocks();
    const s = ctx.s.habits;
    // Encabezado.
    const titleRun = ctx.run(s.title, { role: 'title', size: 'titleSmall' });
    const base = titleRun.ascent * 0.9;
    inner.push('habits.title', 'Título', [ctx.textAt(s.title, 0, base, { role: 'title', size: 'titleSmall' }).prim]);
    inner.push('habits.month', 'Mes', [ctx.textAt(monthTitle(ctx, month), W, base, { role: 'heading', size: 'label', upper: true, tracking: true, align: 'right', opacity: 0.6 }).prim]);
    const ruleY = base + 2;
    inner.push('habits.rule', 'Filete', [line(0, ruleY, W, ruleY, ctx.stroke('strong', 'ink', { use: 'separator', width: ptToMm(2) }))]);
    // Pie.
    const showFootnote = ctx.has('habit-timeline') || ctx.has('streaks');
    const footH = showFootnote ? 9 : 6;
    const [gridArea, foot] = takeBottom({ x: 0, y: ruleY + 4, w: W, h: H - ruleY - 4 }, footH, 2);
    const nDays = month.days.length;
    const totalCol = param(page, 'total', true) ? 9 : 0;
    // Columna de automaticidad: tan ancha como su palabra más larga y tan alta como sus líneas.
    const autoLabel = ctx.s.pages.habits.automatic;
    const autoStyle = { role: 'heading' as const, size: ctx.theme.sizes.tiny, upper: true };
    const autoCol = ctx.has('habit-timeline') ? Math.max(12, ...autoLabel.split(/\s+/).map((w) => ctx.run(w, autoStyle).width + 2)) : 0;
    const nameW = Math.min(46, gridArea.w * 0.24);
    const dayW = (gridArea.w - nameW - totalCol - autoCol) / nDays;
    const autoLines = autoCol ? ctx.textIn(autoLabel, { x: 0, y: 0, w: autoCol - 1, h: 100 }, { ...autoStyle, wrap: true, silent: true }).lines : 0;
    const headH = Math.max(8, autoLines * ptToMm(ctx.theme.sizes.tiny) * 1.3 + 2);
    const nRows = Math.max(3, Math.min(20, Number(param(page, 'rows', 10))));
    const rowH = (gridArea.h - headH) / nRows;
    const g = ctx.stroke('grid', 'ink', { use: 'table' });
    const p: Prim[] = [];
    const x0 = gridArea.x + nameW;
    // Columnas de días.
    month.days.forEach((day, i) => {
      const x = x0 + i * dayW;
      if (day.isWeekend && ctx.theme.weekendShading) p.push(rect({ x, y: gridArea.y, w: dayW, h: gridArea.h }, { fill: ctx.fill('weekend') }));
      p.push(...ctx.textIn(String(day.d), { x, y: gridArea.y, w: dayW, h: headH / 2 }, { role: 'labelStrong', size: Math.min(ctx.theme.sizes.labelSmall + 0.5, dayW * 1.6), align: 'center', valign: 'middle', features: TABULAR_FEATURES }).prims);
      p.push(...ctx.textIn(weekdayLetter(ctx.s, day.dow), { x, y: gridArea.y + headH / 2, w: dayW, h: headH / 2 }, { role: 'label', size: Math.min(ctx.theme.sizes.labelSmall, dayW * 1.5), align: 'center', valign: 'middle' }).prims);
    });
    p.push(...ctx.textIn(s.habit, { x: gridArea.x + 1, y: gridArea.y, w: nameW - 2, h: headH }, { role: 'heading', size: 'labelSmall', upper: true, tracking: true, valign: 'middle' }).prims);
    let xr = x0 + nDays * dayW;
    if (totalCol) {
      p.push(...ctx.textIn(s.total, { x: xr, y: gridArea.y, w: totalCol, h: headH }, { role: 'heading', size: ctx.theme.sizes.tiny, upper: true, align: 'center', valign: 'middle', fit: true }).prims);
      xr += totalCol;
    }
    if (autoCol) p.push(...ctx.textIn(autoLabel, { x: xr + 0.5, y: gridArea.y, w: autoCol - 1, h: headH }, { ...autoStyle, align: 'center', valign: 'middle', wrap: true, fit: true }).prims);
    // Líneas.
    const right = gridArea.x + gridArea.w;
    for (let k = 0; k <= nRows; k++) {
      const y = gridArea.y + headH + k * rowH;
      p.push(line(gridArea.x, y, right, y, g));
    }
    p.push(line(gridArea.x, gridArea.y, right, gridArea.y, g));
    p.push(line(gridArea.x, gridArea.y + headH / 2, gridArea.x, gridArea.y + headH / 2, g));
    const verticals = [gridArea.x, ...month.days.map((_, i) => x0 + i * dayW), x0 + nDays * dayW, ...(totalCol ? [x0 + nDays * dayW + totalCol] : []), ...(autoCol ? [right] : [])];
    for (const x of verticals) p.push(line(x, gridArea.y, x, gridArea.y + gridArea.h, g));
    p.push(line(x0, gridArea.y + headH / 2, x0 + nDays * dayW, gridArea.y + headH / 2, ctx.stroke('hair', 'ruleSoft', { use: 'table' })));
    if (totalCol) for (let k = 0; k < nRows; k++) p.push(...ctx.textIn(`/${nDays}`, { x: x0 + nDays * dayW, y: gridArea.y + headH + k * rowH, w: totalCol - 1, h: rowH - 0.6 }, { role: 'label', size: ctx.theme.sizes.tiny, align: 'right', valign: 'bottom', color: '#9a9a9a' }).prims);
    if (ctx.has('habit-anchoring')) {
      for (let k = 0; k < nRows; k++) p.push(...ctx.textIn(s.anchor, { x: gridArea.x + 1, y: gridArea.y + headH + k * rowH, w: nameW - 2, h: rowH - 0.6 }, { role: 'label', size: ctx.theme.sizes.tiny, valign: 'bottom', color: '#a8a8a8' }).prims);
    }
    inner.push('habits.grid', 'Grilla de hábitos', p);
    const footText = showFootnote ? ctx.s.pages.habits.footnote : `${s.quote} — ${s.quoteAuthor}`;
    const ft = ctx.textIn(footText, foot, { role: showFootnote ? 'body' : 'quote', size: showFootnote ? ctx.theme.sizes.tiny + 0.5 : ctx.theme.sizes.small + 1, wrap: true, fit: true, align: showFootnote ? 'left' : 'right', valign: 'bottom', color: showFootnote ? ctx.theme.colors.ink : '#7a7a7a' });
    inner.push('habits.footer', 'Pie', ft.prims);
    void local;
    // Dibujada girada: se mueve y se escala, pero no cambia de ancho ni de alto por los lados.
    for (const b of inner.blocks) ctx.add(b.id, b.label, [{ t: 'group', m, children: b.prims }], { rigid: true });
  },
};

class LocalBlocks {
  readonly blocks: Array<{ id: string; label: string; prims: Prim[] }> = [];
  push(id: string, label: string, prims: Prim[]): void {
    this.blocks.push({ id, label, prims });
  }
}

/* ---------- Balance del mes ---------- */

export const balance: SectionModule = {
  type: 'balance',
  scope: 'month',
  defaults: { shopping: true },
  plan: (_doc, item, month) => (month ? [monthDraft(month, item.id, 'balance', 'balance', month.name, { params: { ...item.options } })] : []),
  layout(ctx, page) {
    const month = monthOf(ctx, page);
    const s = ctx.s.balance;
    const r = headed(ctx, s.title, monthTitle(ctx, month), { titleSize: 'titleSmall', titleSource: label('balance.title') });
    const shopping = param(page, 'shopping', true);
    const [money, rest] = vsplit(r, [flex(shopping ? 1.15 : 2), flex(shopping ? 1 : 0.35)], 5);
    const [colA, colB] = hsplit(money!, [flex(), flex()], 6);
    const pitch = Math.max(5.5, ctx.theme.writing.pitch * 0.97);
    [colA!, colB!].forEach((col, i) => {
      const label = i === 0 ? s.income : s.variable;
      const h = sectionHeader(ctx, col, label, `balance.col${i}.head`);
      const area = ctx.rect(`balance.col${i}`, { x: col.x, y: col.y + h, w: col.w, h: col.h - h });
      ctx.add(`balance.col${i}`, label, amountLines(ctx, area, pitch));
    });
    const totalBase = { x: rest!.x, y: rest!.y, w: rest!.w, h: 11 };
    const totalBox = ctx.rect('balance.total', totalBase);
    const tp: Prim[] = [rect(totalBox, { stroke: ctx.stroke('rule', 'ink', { use: 'frame' }) })];
    const tl = ctx.textIn(s.total, inset(totalBox, 0, 3), { role: 'heading', size: 'labelSmall', upper: true, tracking: true, valign: 'middle' });
    tp.push(...tl.prims);
    const cur = ctx.textAt(ctx.doc.currency, totalBox.x + totalBox.w * 0.55, totalBox.y + totalBox.h / 2 + 2, { role: 'number', size: ctx.theme.sizes.subtitle });
    tp.push(cur.prim, line(cur.bbox.x + cur.width + 2, totalBox.y + totalBox.h / 2 + 2.4, totalBox.x + totalBox.w - 3, totalBox.y + totalBox.h / 2 + 2.4, ctx.stroke('hair', 'ink', { use: 'writing' })));
    ctx.add('balance.total', 'Total', tp);
    if (shopping) {
      const sh = { x: rest!.x, y: totalBase.y + totalBase.h + 5, w: rest!.w, h: rest!.h - totalBase.h - 5 };
      const hh = sectionHeader(ctx, sh, s.shopping, 'balance.shopping.head');
      const area = ctx.rect('balance.shopping', { x: sh.x, y: sh.y + hh, w: sh.w, h: sh.h - hh });
      const [a, b] = hsplit(area, [flex(), flex()], 6);
      ctx.add('balance.shopping', s.shopping, [...checklist(ctx, a!, pitch), ...checklist(ctx, b!, pitch)]);
    }
  },
};

/* ---------- Resumen mensual ---------- */

export const review: SectionModule = {
  type: 'review',
  scope: 'month',
  defaults: { variant: 'auto' },
  plan: (_doc, item, month) => (month ? [monthDraft(month, item.id, 'review', 'review', month.name, { params: { ...item.options } })] : []),
  layout(ctx, page) {
    const month = monthOf(ctx, page);
    const s = ctx.s.review;
    const variantOpt = param(page, 'variant', 'auto');
    const reflective = variantOpt === 'reflective' || (variantOpt === 'auto' && ctx.has('daily-reflection'));
    const r = headed(ctx, s.title, monthTitle(ctx, month), { titleSize: 'title', titleSource: label('review.title') });
    const pitch = Math.max(5.5, ctx.theme.writing.pitch * 1.05);
    const [top, memory, bottom] = vsplit(r, [flex(reflective ? 1.5 : 1.1), flex(reflective ? 0.75 : 1), flex(1)], 5);
    // Logros (y, en la variante reflexiva, aprendizajes y lo que dejo ir).
    if (reflective) {
      const [a, b] = hsplit(top!, [flex(1.2), flex(1)], 5);
      const ha = sectionHeader(ctx, a!, s.achievements, 'review.achievements.head');
      ctx.add('review.achievements', s.achievements, ruledLines(ctx.rect('review.achievements', { x: a!.x, y: a!.y + ha, w: a!.w, h: a!.h - ha }), pitch, ctx.stroke('hair')));
      const [b1, b2] = vsplit(b!, [flex(), flex()], 3);
      const hb1 = sectionHeader(ctx, b1!, s.learned, 'review.learned.head');
      ctx.add('review.learned', s.learned, ruledLines(ctx.rect('review.learned', { x: b1!.x, y: b1!.y + hb1, w: b1!.w, h: b1!.h - hb1 }), pitch, ctx.stroke('hair')));
      const hb2 = sectionHeader(ctx, b2!, s.letGo, 'review.letGo.head');
      ctx.add('review.letGo', s.letGo, ruledLines(ctx.rect('review.letGo', { x: b2!.x, y: b2!.y + hb2, w: b2!.w, h: b2!.h - hb2 }), pitch, ctx.stroke('hair')));
    } else {
      const h = sectionHeader(ctx, top!, s.achievements, 'review.achievements.head');
      ctx.add('review.achievements', s.achievements, ruledLines(ctx.rect('review.achievements', { x: top!.x, y: top!.y + h, w: top!.w, h: top!.h - h }), pitch, ctx.stroke('hair')));
    }
    // Recuerdo del mes.
    const hm = sectionHeader(ctx, memory!, s.memory, 'review.memory.head', { rule: 'none' });
    const mbox = ctx.rect('review.memory', { x: memory!.x, y: memory!.y + hm, w: memory!.w, h: memory!.h - hm });
    ctx.add('review.memory', s.memory, [
      rect(mbox, { stroke: ctx.stroke('hair', 'rule', { use: 'frame', dash: [1.2, 1] }) }),
      ...ctx.textIn(s.memoryHint, mbox, { role: 'quote', size: ctx.theme.sizes.body, align: 'center', valign: 'middle', color: '#b5b5b5' }).prims,
    ]);
    // Pendientes y estado de ánimo.
    const [pend, mood] = hsplit(bottom!, [flex(1.35), flex(1)], 6);
    const hp = sectionHeader(ctx, pend!, fmt(s.pending, { month: nextMonthName(ctx, month).toLocaleUpperCase(ctx.doc.locale) }), 'review.pending.head');
    let area = ctx.rect('review.pending', { x: pend!.x, y: pend!.y + hp, w: pend!.w, h: pend!.h - hp });
    const pp: Prim[] = [];
    if (ctx.has('bullet-journal')) {
      const m = ctx.s.pages.migration;
      const t = ctx.textIn(`${m.title}  ›  ${m.keep} · ${m.schedule} · ${m.drop}`, { ...area, h: 4 }, { role: 'label', size: 'tiny', upper: true, tracking: 0.04, fit: true, color: '#6a6a6a' });
      pp.push(...t.prims);
      area = { ...area, y: area.y + 3.5, h: area.h - 3.5 };
    }
    pp.push(...checklist(ctx, area, pitch));
    ctx.add('review.pending', s.pending, pp);
    const hmood = sectionHeader(ctx, mood!, s.mood, 'review.mood.head');
    const moods = s.moods;
    const mp: Prim[] = [];
    const moodBox = ctx.rect('review.mood', { x: mood!.x, y: mood!.y + hmood + 2, w: mood!.w, h: mood!.h - hmood - 2 });
    const mc = cols(moodBox, moods.length);
    moods.forEach((label, i) => {
      const c = mc[i]!;
      const rr = Math.min(4.5, c.w * 0.32);
      mp.push(circle(c.x + c.w / 2, c.y + rr + 1, rr, { stroke: ctx.stroke('rule', 'ink') }));
      mp.push(...ctx.textIn(label, { x: c.x, y: c.y + 2 * rr + 3, w: c.w, h: 6 }, { role: 'label', size: 'tiny', upper: true, align: 'center', wrap: true, fit: true }).prims);
    });
    if (ctx.has('mood-log')) mp.push(...ctx.textIn(ctx.s.pages.mood.influence, { x: moodBox.x, y: moodBox.y + moodBox.h - 7, w: moodBox.w, h: 7 }, { role: 'body', size: 'tiny', wrap: true, fit: true, color: '#6a6a6a' }).prims);
    ctx.add('review.mood', s.mood, mp);
  },
};

/* ---------- Notas del mes ---------- */

export const monthNotes: SectionModule = {
  type: 'monthNotes',
  scope: 'month',
  defaults: { count: 1, style: 'auto' },
  plan: (_doc, item, month) => {
    if (!month) return [];
    const n = Math.max(0, Math.min(12, Number(opt(item, 'count', 1))));
    return Array.from({ length: n }, (_, i) => monthDraft(month, item.id, `notes:${item.id}:${i}`, 'notes', month.name, { params: { style: opt(item, 'style', 'auto') } }));
  },
  layout(ctx, page) {
    const style = param<string>(page, 'style', 'auto');
    ctx.add('notes.area', 'Área de notas', writingArea(ctx, ctx.rect('notes.area', ctx.content), style === 'auto' ? 'dots' : (style as 'dots')), { role: 'writing' });
  },
};

export const MONTH_SECTIONS: SectionModule[] = [monthCover, monthLog, monthGrid, habits, balance, review, monthNotes];
