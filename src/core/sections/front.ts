/**
 * Páginas de apertura: portada interior, dedicatoria, datos personales,
 * índice, calendario anual, cumpleaños, mejor versión posible, visión anual,
 * plan de acción y año en píxeles.
 */
import type { DayInfo } from '../calendar';
import { monthNames } from '../calendar/locale';
import { fmt, type AgendaStrings } from '../i18n';
import { centerIn, cols, flex, grid, hsplit, inset, rows, takeBottom, takeTop } from '../layout/box';
import type { LayoutContext, SizeKey, TextRole } from '../layout/context';
import { line, rect, type LinkArea, type Prim } from '../layout/prims';
import { heartIcon, miniCalendar, ruledLines, sectionHeader, writingArea } from '../layout/widgets';
import { inkBounds, TABULAR_FEATURES } from '../text/shape';
import { ptToMm } from '../util/geometry';
import { checklist, fieldLine, headed, order } from './common';
import { opt, param, type SectionModule } from './types';

/* ---------- Portada interior ---------- */

export const titlePage: SectionModule = {
  type: 'titlePage',
  scope: 'front',
  defaults: { showName: true, showKicker: true },
  plan: (_doc, item) => [{ key: 'front:title', type: 'titlePage', section: item.id, title: 'Portada', group: 'front', startOn: 'recto', params: { ...item.options } }],
  layout(ctx, page) {
    const d = ctx.doc.design;
    const c = ctx.content;
    const year = String(d.calendar.year);
    const title = d.persona.title || ctx.s.titlePage.title;
    const showName = param(page, 'showName', true) && d.persona.name.trim().length > 0;
    const yearRun = ctx.run(year, { role: 'display', size: 'hero', features: TABULAR_FEATURES });
    const cy = c.y + c.h * 0.42;
    const y = ctx.textAt(year, c.x + c.w / 2, cy, { role: 'display', size: 'hero', align: 'center', features: TABULAR_FEATURES });
    ctx.add('title.year', 'Año', [y.prim]);
    // Las cifras de estilo antiguo bajan de la línea de base (el 7 y el 9 de Cormorant Garamond):
    // la línea siguiente se ubica por debajo de la tinta real del año, nunca encima.
    const yearInk = inkBounds(ctx.face('display'), yearRun);
    const yearBottom = cy + (yearInk ? yearInk.y + yearInk.h : 0);
    const clear = (text: string, role: TextRole, size: SizeKey, preferred: number): number => {
      const run = ctx.run(text, { role, size });
      const ink = inkBounds(ctx.face(role), run);
      return Math.max(preferred, yearBottom + 2.5 - (ink ? ink.y : -run.capHeight));
    };
    let baseline = cy + ptToMm(ctx.theme.sizes.title) * 1.45;
    const titleCap = ctx.run(title, { role: 'title', size: 'titleSmall' }).capHeight;
    let titleBaseline: number;
    if (showName) {
      baseline = clear(d.persona.name, 'title', 'title', baseline);
      const n = ctx.textAt(d.persona.name, c.x + c.w / 2, baseline, { role: 'title', size: 'title', align: 'center' });
      ctx.add('title.name', 'Nombre', [n.prim]);
      baseline += ptToMm(ctx.theme.sizes.title) * 1.3;
      titleBaseline = baseline - ptToMm(ctx.theme.sizes.titleSmall) + titleCap;
    } else titleBaseline = clear(title, 'title', 'titleSmall', baseline - ptToMm(ctx.theme.sizes.titleSmall) + titleCap);
    const t = ctx.textIn(title, { x: c.x, y: titleBaseline - titleCap, w: c.w, h: 30 }, { role: 'title', size: 'titleSmall', align: 'center', wrap: true, fit: true });
    ctx.add('title.title', 'Título', t.prims);
    if (d.persona.subtitle) {
      const st = ctx.textIn(d.persona.subtitle, { x: c.x, y: t.bbox.y + t.bbox.h + 4, w: c.w, h: 12 }, { role: 'label', size: 'label', upper: true, tracking: true, align: 'center', wrap: true });
      ctx.add('title.subtitle', 'Subtítulo', st.prims);
    }
    if (param(page, 'showKicker', true)) {
      const k = ctx.textAt(ctx.s.titlePage.kicker, c.x + c.w / 2, c.y + c.h, { role: 'label', size: 'labelSmall', upper: true, tracking: 0.2, align: 'center' });
      ctx.add('title.kicker', 'Rótulo inferior', [k.prim]);
    }
  },
};

/* ---------- Dedicatoria ---------- */

export const dedication: SectionModule = {
  type: 'dedication',
  scope: 'front',
  defaults: {},
  plan: (doc, item) => (doc.design.persona.dedication.trim() ? [{ key: 'front:dedication', type: 'dedication', section: item.id, title: 'Dedicatoria', group: 'front' }] : []),
  layout(ctx) {
    const d = ctx.doc.design;
    const c = inset(ctx.content, 0, 6);
    const titleText = fmt(d.persona.dedicationTitle, { year: d.calendar.year, name: d.persona.name });
    const body = fmt(d.persona.dedication, { year: d.calendar.year, name: d.persona.name });
    const bodySize = ctx.theme.sizes.subtitle + 1;
    const titleH = titleText ? ptToMm(ctx.theme.sizes.title) * 1.6 : 0;
    const bodyBox = { x: c.x, y: 0, w: c.w, h: c.h - titleH };
    // Medición con la caja real; luego se ubica con el mismo cuerpo, sin volver a ajustar.
    const measured = ctx.textIn(body, bodyBox, { role: 'quote', size: bodySize, wrap: true, fit: true, leading: 1.6 });
    const bodyH = measured.lines * ptToMm(measured.sizePt) * 1.6;
    const top = c.y + Math.max(0, (c.h - titleH - bodyH) / 2);
    if (titleText) {
      const t = ctx.textIn(titleText, { x: c.x, y: top, w: c.w, h: titleH }, { role: 'title', size: 'title', wrap: true, fit: true });
      ctx.add('dedication.title', 'Título de la dedicatoria', t.prims);
    }
    const b = ctx.textIn(body, { x: c.x, y: top + titleH, w: c.w, h: c.y + c.h - top - titleH }, { role: 'quote', size: measured.sizePt, wrap: true, leading: 1.6 });
    ctx.add('dedication.body', 'Texto de la dedicatoria', b.prims);
  },
};

/* ---------- Datos personales ---------- */

export const personalInfo: SectionModule = {
  type: 'personalInfo',
  scope: 'front',
  defaults: { emergency: true, medical: true },
  plan: (_doc, item) => [{ key: 'front:personal', type: 'personalInfo', section: item.id, title: 'Datos personales', group: 'front', params: { ...item.options } }],
  layout(ctx, page) {
    const s = ctx.s.personal;
    let r = headed(ctx, s.title, '');
    const pitch = Math.max(8, ctx.theme.writing.pitch * 1.35);
    const h1 = sectionHeader(ctx, r, s.belongsTo, 'personal.owner');
    r = takeTop(r, h1)[1];
    const fields = [s.name, s.phone, s.email, s.address, ''];
    const prims: Prim[] = [];
    fields.forEach((f, i) => prims.push(...fieldLine(ctx, r.x, r.y + (i + 1) * pitch, r.w, f ? `${f}:` : '')));
    ctx.add('personal.fields', 'Campos', prims);
    r = takeTop(r, fields.length * pitch + 4)[1];
    const reward = ctx.textIn(s.reward, { ...r, h: 10 }, { role: 'quote', size: ctx.theme.sizes.body + 1, wrap: true });
    ctx.add('personal.reward', 'Aviso de devolución', reward.prims);
    r = takeTop(r, reward.bbox.h + 8)[1];
    if (param(page, 'emergency', true)) {
      const h2 = sectionHeader(ctx, r, s.emergency, 'personal.emergency');
      r = takeTop(r, h2)[1];
      const ef: Prim[] = [];
      [s.contactName, s.relation, s.phone].forEach((f, i) => ef.push(...fieldLine(ctx, r.x, r.y + (i + 1) * pitch, r.w, `${f}:`)));
      ctx.add('personal.emergencyFields', 'Contacto de emergencia', ef);
      r = takeTop(r, 3 * pitch + 6)[1];
    }
    if (param(page, 'medical', true) && r.h > pitch * 3) {
      const mf: Prim[] = [];
      [s.bloodType, s.allergies, s.insurance].forEach((f, i) => mf.push(...fieldLine(ctx, r.x, r.y + (i + 1) * pitch, r.w, `${f}:`)));
      ctx.add('personal.medical', 'Datos médicos', mf);
    }
  },
};

/* ---------- Índice ---------- */

/** Lo mínimo para titular una sección: los textos del idioma y el idioma (sirve un `LayoutContext`). */
export interface TitleContext {
  s: AgendaStrings;
  doc: { locale: string };
}

/** Títulos de las secciones en el idioma de la agenda (índice impreso y marcadores del PDF). */
export const TOC_TITLES: Record<string, (ctx: TitleContext) => string> = {
  personalInfo: (c) => c.s.personal.title,
  guide: (c) => c.s.guide.title,
  yearOverview: (c) => c.s.yearOverview.title.charAt(0) + c.s.yearOverview.title.slice(1).toLocaleLowerCase(c.doc.locale),
  birthdays: (c) => c.s.birthdays.title,
  bestSelf: (c) => c.s.pages.bestSelf.title,
  vision: (c) => c.s.vision.title,
  actionPlan: (c) => c.s.actionPlan.title,
  moodYear: (c) => c.s.moodYear.title,
  passwords: (c) => c.s.passwords.title,
  contacts: (c) => c.s.contacts.title,
  health: (c) => c.s.health.title,
  sleepDiary: (c) => c.s.pages.sleep.title,
  unstuck: (c) => c.s.pages.unstuck.title,
  estimates: (c) => c.s.pages.estimates.title,
  notes: (c) => c.s.notes.title,
};

export const toc: SectionModule = {
  type: 'toc',
  scope: 'front',
  defaults: {},
  plan: (doc, item) => {
    const entries = doc.design.sections.filter((s) => s.enabled).length + doc.cal.months.length;
    const pages = entries > 30 ? 2 : 1;
    return Array.from({ length: pages }, (_, i) => ({ key: `front:toc:${i}`, type: 'toc', section: item.id, title: 'Índice', group: 'front', params: { part: i, parts: pages } }));
  },
  layout(ctx, page) {
    const all = ctx.doc.pages ?? [];
    const entries: Array<{ title: string; page: number; key: string; month?: boolean }> = [];
    const seenTypes = new Set<string>();
    const seenGroups = new Set<string>();
    for (const p of all) {
      if (p.type === 'filler' || p.type === 'toc' || p.type === 'titlePage' || p.type === 'dedication') continue;
      if (p.group.startsWith('month:')) {
        if (seenGroups.has(p.group)) continue;
        seenGroups.add(p.group);
        const [y, m] = p.group.slice(6).split('-').map(Number);
        entries.push({ title: `${monthNames(ctx.doc.locale)[(m ?? 1) - 1]} ${y}`, page: p.index + 1, key: p.key, month: true });
        continue;
      }
      const key = p.type === 'weekLeft' || p.type === 'weekRight' ? 'week' : p.type === 'custom' ? p.key : p.type;
      if (seenTypes.has(key)) continue;
      seenTypes.add(key);
      const t = TOC_TITLES[key]?.(ctx) ?? (p.type === 'custom' ? p.title : null);
      if (t) entries.push({ title: t, page: p.index + 1, key: p.key });
    }
    const parts = param(page, 'parts', 1);
    const part = param(page, 'part', 0);
    const per = Math.ceil(entries.length / parts);
    const mine = entries.slice(part * per, (part + 1) * per);
    const r = headed(ctx, ctx.s.toc.title, '');
    const pitch = Math.min(7, r.h / Math.max(1, mine.length));
    const prims: Prim[] = [];
    const links: LinkArea[] = [];
    mine.forEach((e, i) => {
      const y = r.y + (i + 0.75) * pitch;
      // Toda la fila (título, puntos y número) lleva a la página.
      links.push({ x: r.x, y: r.y + i * pitch, w: r.w, h: pitch, to: { kind: 'page', key: e.key }, cat: 'toc' });
      const left = ctx.textAt(e.title, r.x + (e.month ? 4 : 0), y, { role: e.month ? 'body' : 'heading', size: e.month ? 'body' : 'small', upper: !e.month, tracking: e.month ? 0 : 0.05 });
      const num = ctx.textAt(String(e.page), r.x + r.w, y, { role: 'number', size: 'body', align: 'right', features: TABULAR_FEATURES });
      prims.push(left.prim, num.prim);
      const x0 = left.bbox.x + left.width + 2;
      const x1 = num.bbox.x - 2;
      if (x1 > x0 + 2) prims.push(line(x0, y, x1, y, ctx.stroke('hair', undefined, { dash: [0.15, 1.2], cap: 'round', width: ptToMm(0.7) })));
    });
    ctx.add('toc.entries', 'Entradas del índice', prims, { links });
  },
};

/* ---------- Calendario anual ---------- */

export const yearOverview: SectionModule = {
  type: 'yearOverview',
  scope: 'front',
  defaults: { years: 2, perPage: 6 },
  plan: (doc, item) => {
    const years = Math.max(1, Math.min(3, Number(opt(item, 'years', 2))));
    const perPage = Number(opt(item, 'perPage', 6)) === 12 ? 12 : 6;
    const out = [];
    const startY = doc.design.calendar.year;
    for (let k = 0; k < years; k++) {
      const y = startY + k;
      const parts = perPage === 12 ? 1 : 2;
      for (let p = 0; p < parts; p++) {
        out.push({
          key: `year:${y}:${p}`,
          type: 'yearOverview',
          section: item.id,
          title: `${y}`,
          group: 'front',
          startOn: (p === 0 && parts === 2 ? 'verso' : 'any') as 'verso' | 'any',
          params: { year: y, part: p, perPage },
        });
      }
    }
    return out;
  },
  layout(ctx, page) {
    const y = param(page, 'year', ctx.doc.design.calendar.year);
    const part = param(page, 'part', 0);
    const perPage = param(page, 'perPage', 6);
    const r = headed(ctx, String(y), ctx.s.yearOverview.title, { titleSize: 'title' });
    const nCols = perPage === 12 ? 3 : 2;
    const nRows = perPage === 12 ? 4 : 3;
    const cells = grid(r, nCols, nRows, 6, 5).flat();
    const names = monthNames(ctx.doc.locale);
    const showMoon = ctx.doc.design.astronomy.moonPhases && ctx.doc.design.astronomy.showIn.includes('yearOverview');
    cells.forEach((cell, i) => {
      const m = part * perPage + i + 1;
      if (m > 12) return;
      const weeks = ctx.doc.cal.monthGrid(y, m);
      while (weeks.length < 6) weeks.push([]);
      const head = ctx.textIn((names[m - 1] ?? '').toLocaleUpperCase(ctx.doc.locale), { ...cell, h: 5 }, { role: 'labelStrong', size: perPage === 12 ? 'label' : ctx.theme.sizes.heading + 1.5, align: 'center', tracking: 0.08 });
      const ruleY = cell.y + 5.6;
      const body = { x: cell.x, y: cell.y + 7, w: cell.w, h: cell.h - 7 };
      const rowsData = weeks.map((w) => (w.length === 7 ? w : ([] as DayInfo[])));
      const filled = rowsData.filter((w) => w.length === 7);
      const prims: Prim[] = [...head.prims, line(cell.x + 2, ruleY, cell.x + cell.w - 2, ruleY, ctx.stroke('hair', 'ink'))];
      const links: LinkArea[] = [{ x: cell.x, y: cell.y, w: cell.w, h: ruleY - cell.y + 0.6, to: { kind: 'month', y, m }, cat: 'months' }];
      prims.push(
        ...miniCalendar(ctx, body, filled, {
          onCell: (day, c, inMonth) => {
            if (inMonth) links.push({ ...c, to: { kind: 'date', iso: day.iso }, cat: 'days' });
          },
          month: { y, m },
          otherMonth: 'hide',
          order: order(ctx),
          rowH: (body.h - 4.5) / 6,
          headerH: 4.5,
          weekendStyle: 'gray',
          holidays: 'underline',
          numberSize: perPage === 12 ? ctx.theme.sizes.small : 'calendarNumber',
          headerSize: 'labelSmall',
        }),
      );
      // Fechas personales: corazón diminuto.
      const rowH = (body.h - 4.5) / 6;
      const colW = body.w / 7;
      filled.forEach((week, wi) =>
        week.forEach((day, di) => {
          if (day.m !== m) return;
          if (day.events.length > 0) prims.push(heartIcon(ctx, body.x + (di + 0.85) * colW, body.y + 4.5 + (wi + 0.25) * rowH, 1.1));
          if (showMoon && day.moon === 'full') prims.push({ t: 'circle', cx: body.x + (di + 0.15) * colW, cy: body.y + 4.5 + (wi + 0.25) * rowH, r: 0.45, stroke: ctx.stroke('hair', 'ink') });
        }),
      );
      ctx.add(`month.${m}`, `${names[m - 1]} ${y}`, prims, { links });
    });
  },
};

/* ---------- Cumpleaños y fechas importantes ---------- */

export const birthdays: SectionModule = {
  type: 'birthdays',
  scope: 'front',
  defaults: { pages: 1 },
  plan: (_doc, item) => {
    const pages = Number(opt(item, 'pages', 1)) === 2 ? 2 : 1;
    return Array.from({ length: pages }, (_, i) => ({ key: `front:birthdays:${i}`, type: 'birthdays', section: item.id, title: 'Cumpleaños', group: 'front', startOn: (pages === 2 && i === 0 ? 'verso' : 'any') as 'verso' | 'any', params: { part: i, parts: pages } }));
  },
  layout(ctx, page) {
    const parts = param(page, 'parts', 1);
    const part = param(page, 'part', 0);
    const r = headed(ctx, ctx.s.birthdays.title, parts === 2 ? `${part === 0 ? '1–6' : '7–12'}` : '', { titleSize: 'titleSmall' });
    const months = parts === 2 ? 6 : 12;
    const cells = grid(r, parts === 2 ? 1 : 2, parts === 2 ? 6 : 6, 6, 3).flat();
    const names = monthNames(ctx.doc.locale);
    const pitch = Math.max(5, ctx.theme.writing.pitch * 0.95);
    cells.forEach((cell, i) => {
      const m = part * months + i + 1;
      if (m > 12) return;
      const prims: Prim[] = [];
      const head = ctx.textIn((names[m - 1] ?? '').toLocaleUpperCase(ctx.doc.locale), { ...cell, h: 4 }, { role: 'heading', size: 'heading', tracking: ctx.theme.tracking.heading });
      prims.push(...head.prims, line(cell.x, cell.y + 4.6, cell.x + cell.w, cell.y + 4.6, ctx.stroke('rule', 'ink')));
      const area = { x: cell.x, y: cell.y + 4.6, w: cell.w, h: cell.h - 4.6 };
      prims.push(...ruledLines(area, pitch, ctx.stroke('hair')));
      const evs = ctx.doc.design.personalDates.filter((p) => p.month === m).sort((a, b) => a.day - b.day);
      evs.slice(0, Math.floor(area.h / pitch)).forEach((ev, k) => {
        const t = ctx.textAt(`${ev.day} · ${ev.label}`, area.x + 1, area.y + (k + 1) * pitch - 1.2, { role: 'body', size: 'small' });
        prims.push(t.prim);
      });
      ctx.add(`birthdays.${m}`, names[m - 1] ?? '', prims);
    });
  },
};

/* ---------- Mejor versión posible ---------- */

export const bestSelf: SectionModule = {
  type: 'bestSelf',
  scope: 'front',
  defaults: {},
  plan: (_doc, item) => [{ key: 'front:bestSelf', type: 'bestSelf', section: item.id, title: 'Mejor versión posible', group: 'front' }],
  layout(ctx) {
    const s = ctx.s.pages.bestSelf;
    let r = headed(ctx, s.title, s.horizon, { titleSize: 'titleSmall' });
    const prompt = ctx.textIn(s.prompt, { ...r, h: 18 }, { role: 'quote', size: ctx.theme.sizes.body + 1, wrap: true, fit: true });
    ctx.add('bestSelf.prompt', 'Consigna', prompt.prims);
    r = takeTop(r, prompt.bbox.h + 4)[1];
    const [main, bottom] = takeBottom(r, 52, 4);
    ctx.add('bestSelf.writing', 'Espacio para escribir', writingArea(ctx, main), { role: 'writing' });
    const vh = sectionHeader(ctx, bottom, s.values, 'bestSelf.valuesHeader');
    const vals = { x: bottom.x, y: bottom.y + vh, w: bottom.w, h: 3 * ctx.theme.writing.pitch };
    ctx.add('bestSelf.values', 'Valores', checklist(ctx, vals, ctx.theme.writing.pitch, { circles: true }));
    const gTop = { x: bottom.x, y: vals.y + vals.h + 3, w: bottom.w, h: bottom.h - vh - vals.h - 3 };
    const gh = sectionHeader(ctx, gTop, fmt(s.goal, { year: ctx.doc.design.calendar.year }), 'bestSelf.goalHeader');
    const gl = { x: gTop.x, y: gTop.y + gh, w: gTop.w, h: Math.max(0, gTop.h - gh) };
    const prims: Prim[] = ruledLines(gl, ctx.theme.writing.pitch, ctx.stroke('hair'));
    if (ctx.has('implementation-intentions')) {
      const t = ctx.textAt(ctx.s.pages.ifThen.when, gl.x, gl.y + gl.h - 1, { role: 'label', size: 'labelSmall', tracking: true });
      prims.push(t.prim);
    }
    ctx.add('bestSelf.goal', 'Meta concreta', prims);
  },
};

/* ---------- Visión anual ---------- */

export const vision: SectionModule = {
  type: 'vision',
  scope: 'front',
  defaults: { perPage: 2 },
  plan: (doc, item) => {
    const cats = (opt<string[] | null>(item, 'categories', null) ?? doc.strings.vision.categories) as string[];
    const per = Math.max(1, Math.min(4, Number(opt(item, 'perPage', 2))));
    const pages = Math.ceil(cats.length / per);
    return Array.from({ length: pages }, (_, i) => ({ key: `front:vision:${i}`, type: 'vision', section: item.id, title: 'Visión anual', group: 'front', startOn: (i === 0 && pages === 2 ? 'verso' : 'any') as 'verso' | 'any', params: { cats: cats.slice(i * per, (i + 1) * per), part: i } }));
  },
  layout(ctx, page) {
    const s = ctx.s.vision;
    const cats = param<string[]>(page, 'cats', []);
    const part = param(page, 'part', 0);
    const r = headed(ctx, part === 0 ? s.title : String(ctx.doc.design.calendar.year), s.subtitle, { titleSize: 'title' });
    const [headRow, body] = takeTop(r, 10);
    const colsR = hsplit(headRow, [24, flex(), flex(), flex()]);
    const ink = ctx.theme.colors.ink;
    const prims: Prim[] = [rect(headRow, { fill: { color: ink } })];
    [s.category, s.short, s.medium, s.long].forEach((t, i) => {
      const cell = colsR[i]!;
      const tx = ctx.textIn(t, inset(cell, 0, 1.5), { role: 'heading', size: 'labelSmall', upper: true, tracking: 0.08, align: 'center', valign: 'middle', color: '#ffffff', fit: true });
      prims.push(...tx.prims);
    });
    ctx.add('vision.head', 'Encabezado de la matriz', prims);
    const rowRects = rows(body, Math.max(1, cats.length));
    rowRects.forEach((row, i) => {
      const c = hsplit(row, [24, flex(), flex(), flex()]);
      const p: Prim[] = [line(row.x, row.y + row.h, row.x + row.w, row.y + row.h, ctx.stroke('rule', 'ink'))];
      const label = ctx.textIn(cats[i] ?? '', inset(c[0]!, 2, 1.5), { role: 'heading', size: 'labelSmall', upper: true, tracking: 0.06, wrap: true, valign: 'middle', align: 'center' });
      p.push(...label.prims);
      for (let k = 1; k < 4; k++) {
        const cell = c[k]!;
        p.push(line(cell.x, row.y, cell.x, row.y + row.h, ctx.stroke('rule', 'ink')));
        p.push(...ruledLines(inset(cell, 1, 2), ctx.theme.writing.pitch, ctx.stroke('hair')));
      }
      ctx.add(`vision.row.${i}`, cats[i] ?? '', p);
    });
    ctx.add('vision.frame', 'Marco', [rect(r, { stroke: ctx.stroke('rule', 'ink') })], { editable: false });
  },
};

/* ---------- Plan de acción ---------- */

export const actionPlan: SectionModule = {
  type: 'actionPlan',
  scope: 'front',
  defaults: { goals: 3, mantra: true },
  plan: (_doc, item) => {
    const goals = Math.max(1, Math.min(6, Number(opt(item, 'goals', 3))));
    const mantra = opt(item, 'mantra', true);
    const slots = goals + (mantra ? 1 : 0);
    const pages = Math.ceil(slots / 2);
    return Array.from({ length: pages }, (_, i) => ({ key: `front:action:${i}`, type: 'actionPlan', section: item.id, title: 'Plan de acción', group: 'front', startOn: (i === 0 && pages === 2 ? 'verso' : 'any') as 'verso' | 'any', params: { part: i, goals, mantra } }));
  },
  layout(ctx, page) {
    const s = ctx.s.actionPlan;
    const part = param(page, 'part', 0);
    const goals = param(page, 'goals', 3);
    const mantra = param(page, 'mantra', true);
    const r = headed(ctx, s.title, part === 0 ? s.subtitle : s.subtitleEnd, { titleSize: 'title' });
    const slots = rows(r, 2, 6);
    for (let k = 0; k < 2; k++) {
      const n = part * 2 + k + 1;
      const box = slots[k]!;
      if (n <= goals) goalBlock(ctx, box, n);
      else if (n === goals + 1 && mantra) mantraBlock(ctx, box);
    }
  },
};

function goalBlock(ctx: LayoutContext, box: { x: number; y: number; w: number; h: number }, n: number): void {
  const s = ctx.s.actionPlan;
  const p: Prim[] = [rect(box, { stroke: ctx.stroke('rule', 'ink') })];
  const inner = inset(box, 4);
  const title = ctx.textAt(fmt(s.goal, { n }), inner.x, inner.y + 2.5, { role: 'heading', size: 'label', upper: true, tracking: true });
  p.push(title.prim, line(inner.x + title.width + 2, inner.y + 3, inner.x + inner.w, inner.y + 3, ctx.stroke('hair')));
  const [left, right] = hsplit({ x: inner.x, y: inner.y + 7, w: inner.w, h: inner.h - 7 }, [flex(0.7), flex(0.3)], 4);
  const why = ctx.textAt(s.why, left!.x, left!.y + 2.5, { role: 'quote', size: ctx.theme.sizes.body + 1 });
  p.push(why.prim, line(left!.x, left!.y + 8.5, left!.x + left!.w, left!.y + 8.5, ctx.stroke('hair')));
  const stepsTop = left!.y + 12;
  const stepsLabel = ctx.textAt(s.steps, left!.x, stepsTop, { role: 'heading', size: 'labelSmall', upper: true, tracking: true });
  p.push(stepsLabel.prim);
  const ii = ctx.has('implementation-intentions');
  const pitch = ctx.theme.writing.pitch;
  const reserve = ii ? 2 * pitch + 1 : 0;
  const stepsArea = { x: left!.x, y: stepsTop + 0.5, w: left!.w, h: left!.y + left!.h - stepsTop - 0.5 - reserve };
  p.push(...checklist(ctx, stepsArea, pitch, { circles: true, max: 5 }));
  if (ii) {
    const y1 = left!.y + left!.h - pitch - 1;
    const y2 = left!.y + left!.h - 1;
    p.push(ctx.textAt(ctx.s.pages.ifThen.when, left!.x, y1, { role: 'label', size: 'labelSmall', tracking: 0.04, color: ctx.theme.colors.soft }).prim);
    p.push(ctx.textAt(ctx.s.pages.ifThen.obstacle, left!.x, y2, { role: 'label', size: 'labelSmall', tracking: 0.04, color: ctx.theme.colors.soft }).prim);
  }
  const dl = ctx.textAt(s.deadline, right!.x + right!.w / 2, right!.y + 2.5, { role: 'heading', size: 'labelSmall', upper: true, tracking: true, align: 'center' });
  const dbox = centerIn({ x: right!.x, y: right!.y + 4, w: right!.w, h: 16 }, Math.min(28, right!.w), 13);
  p.push(dl.prim, rect(dbox, { stroke: ctx.stroke('rule', 'ink') }));
  p.push(ctx.textIn('/', dbox, { role: 'display', size: ctx.theme.sizes.subtitle, align: 'center', valign: 'middle', color: '#999999' }).prims[0]!);
  if (ctx.has('specific-goals')) {
    const sy = dbox.y + dbox.h + 6;
    const t = ctx.textIn(ctx.s.pages.ifThen.success, { x: right!.x, y: sy, w: right!.w, h: 8 }, { role: 'label', size: 'labelSmall', upper: true, wrap: true, fit: true, align: 'center' });
    p.push(...t.prims);
    const ly = sy + t.bbox.h + 5;
    p.push(line(right!.x, ly, right!.x + right!.w, ly, ctx.stroke('hair')));
    const dy = ly + 6;
    const dt = ctx.textAt(ctx.s.pages.ifThen.difficulty, right!.x + right!.w / 2, dy, { role: 'label', size: 'labelSmall', upper: true, tracking: true, align: 'center' });
    p.push(dt.prim);
    const circ = cols({ x: right!.x, y: dy + 1.5, w: right!.w, h: 5 }, 5);
    circ.forEach((c, i) => {
      p.push({ t: 'circle', cx: c.x + c.w / 2, cy: c.y + 2.2, r: 1.9, stroke: ctx.stroke('hair', 'ink') });
      p.push(ctx.textIn(String(i + 1), { x: c.x, y: c.y + 0.4, w: c.w, h: 3.6 }, { role: 'number', size: ctx.theme.sizes.tiny, align: 'center', valign: 'middle' }).prims[0]!);
    });
  }
  ctx.add(`goal.${n}`, `Objetivo ${n}`, p);
}

function mantraBlock(ctx: LayoutContext, box: { x: number; y: number; w: number; h: number }): void {
  const s = ctx.s.actionPlan;
  const b = { x: box.x, y: box.y + box.h * 0.25, w: box.w, h: box.h * 0.75 };
  const head = sectionHeader(ctx, { ...box, h: 8 }, fmt(s.mantra, { year: ctx.doc.design.calendar.year }), 'mantra.title', { rule: 'none' });
  void head;
  const p: Prim[] = [rect(b, { stroke: ctx.stroke('hair', 'ruleSoft', { dash: [1.2, 1] }) })];
  p.push(...ctx.textIn(s.mantraHint, inset(b, 4), { role: 'quote', size: ctx.theme.sizes.body, align: 'center', valign: 'middle', wrap: true, color: '#9a9a9a' }).prims);
  ctx.add('mantra.box', 'Espacio del mantra', p);
}

/* ---------- Año en píxeles ---------- */

export const moodYear: SectionModule = {
  type: 'moodYear',
  scope: 'front',
  defaults: {},
  plan: (doc, item) => [{ key: `front:mood:${doc.design.calendar.year}`, type: 'moodYear', section: item.id, title: 'Año en píxeles', group: 'front' }],
  layout(ctx) {
    const s = ctx.s.moodYear;
    let r = headed(ctx, s.title, String(ctx.doc.design.calendar.year), { titleSize: 'titleSmall' });
    const hint = ctx.textIn(`${s.hint} ${ctx.s.pages.mood.scale}`, { ...r, h: 9 }, { role: 'body', size: 'small', wrap: true, fit: true });
    ctx.add('mood.hint', 'Consigna', hint.prims);
    r = takeTop(r, hint.bbox.h + 3)[1];
    const [gridArea, legend] = takeBottom(r, 16, 3);
    const [dayCol, months] = hsplit(gridArea, [5, flex()]);
    const names = monthNames(ctx.doc.locale, 'short');
    const colRects = cols({ ...months!, h: 4 }, 12);
    const rowH = (gridArea.h - 4) / 31;
    const prims: Prim[] = [];
    colRects.forEach((c, i) => prims.push(...ctx.textIn((names[i] ?? '').slice(0, 1).toLocaleUpperCase(ctx.doc.locale), c, { role: 'labelStrong', size: 'labelSmall', align: 'center', valign: 'middle' }).prims));
    const y0 = gridArea.y + 4;
    const year = ctx.doc.design.calendar.year;
    for (let d = 1; d <= 31; d++) {
      const yy = y0 + (d - 1) * rowH;
      prims.push(...ctx.textIn(String(d), { x: dayCol!.x, y: yy, w: dayCol!.w - 1, h: rowH }, { role: 'number', size: ctx.theme.sizes.tiny, align: 'right', valign: 'middle', features: TABULAR_FEATURES }).prims);
      colRects.forEach((c, mi) => {
        const valid = d <= new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
        prims.push(rect({ x: c.x + 0.3, y: yy + 0.3, w: c.w - 0.6, h: rowH - 0.6 }, valid ? { stroke: ctx.stroke('grid', 'rule') } : { fill: { color: ctx.theme.colors.weekend } }));
      });
    }
    ctx.add('mood.grid', 'Grilla del año', prims);
    const lv = cols(legend, 5, 2);
    const lp: Prim[] = [];
    s.levels.forEach((label, i) => {
      const c = lv[i]!;
      lp.push(rect({ x: c.x, y: c.y + 1, w: 5, h: 4 }, { stroke: ctx.stroke('grid', 'rule') }));
      lp.push(ctx.textIn(String(5 - i), { x: c.x, y: c.y + 1, w: 5, h: 4 }, { role: 'number', size: ctx.theme.sizes.tiny, align: 'center', valign: 'middle' }).prims[0]!);
      lp.push(...ctx.textIn(label, { x: c.x + 6, y: c.y + 1, w: c.w - 6, h: 4 }, { role: 'body', size: 'small', valign: 'middle', fit: true }).prims);
    });
    const words = ctx.s.pages.mood.wordList.join(' · ');
    lp.push(...ctx.textIn(`${ctx.s.pages.mood.words}: ${words}`, { x: legend.x, y: legend.y + 7, w: legend.w, h: 8 }, { role: 'body', size: 'tiny', wrap: true, fit: true }).prims);
    ctx.add('mood.legend', 'Referencias', lp);
  },
};

export const FRONT_SECTIONS: SectionModule[] = [titlePage, dedication, personalInfo, toc, yearOverview, birthdays, bestSelf, vision, actionPlan, moodYear];

