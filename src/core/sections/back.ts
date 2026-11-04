/**
 * Páginas finales: contraseñas (opcionalmente como libreta aparte para
 * guardar en casa), contactos, salud, diario de sueño, destrabar tareas,
 * estimaciones y notas. Más las páginas especiales: relleno y páginas propias.
 */
import type { CustomPage } from '../design/schema';
import { fmt } from '../i18n';
import { assetPrims } from '../document/assets';
import { inset, rows, takeBottom, takeTop } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import { line, rect, type Prim } from '../layout/prims';
import { ruledLines, sectionHeader, writingArea } from '../layout/widgets';
import type { Rect } from '../util/geometry';
import { fieldLine, headed, pageTextVars } from './common';
import { opt, param, type PagePlan, type SectionModule } from './types';

function pagesDraft(item: { id: string; options: Record<string, unknown> }, prefix: string, type: string, title: string, count: number) {
  const n = Math.max(1, Math.min(20, count));
  return Array.from({ length: n }, (_, i) => ({ key: `back:${prefix}:${i}`, type, section: item.id, title, group: 'back', params: { ...item.options, part: i, parts: n } }));
}

/** Tabla de renglones con columnas (anchos relativos) y encabezados. */
/**
 * Anchos de columna por peso, pero sin que ninguna quede más angosta que su mínimo
 * (las que lo necesitan se fijan en su mínimo y el resto se reparte entre las demás).
 */
export function fitColumns(total: number, weights: number[], mins: number[]): number[] {
  const fixed = weights.map(() => false);
  let out = weights.slice();
  if (mins.reduce((a, b) => a + b, 0) > total) {
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => (total * w) / sum);
  }
  for (let iter = 0; iter <= weights.length; iter++) {
    const freeW = total - mins.reduce((a, m, i) => a + (fixed[i] ? m : 0), 0);
    const sumW = weights.reduce((a, w, i) => a + (fixed[i] ? 0 : w), 0);
    out = weights.map((w, i) => (fixed[i] ? mins[i]! : sumW > 0 ? (freeW * w) / sumW : 0));
    let changed = false;
    out.forEach((w, i) => {
      if (!fixed[i] && w < mins[i]! - 1e-6) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return out;
}

function table(ctx: LayoutContext, r: Rect, headers: string[], weights: number[], pitch: number, id: string, label: string): void {
  const [head, body] = takeTop(r, 6);
  const style = { role: 'heading' as const, size: 'labelSmall' as const, upper: true, tracking: true };
  // Mínimo de cada columna: su rótulo al cuerpo mínimo legible del tema, más aire a los lados.
  const mins = headers.map((h) => {
    const run = ctx.run(h, style);
    return run.width * Math.min(1, ctx.theme.minTextPt / run.sizePt) + 3.2;
  });
  let cx = head.x;
  const colsR = fitColumns(head.w, weights, mins).map((w) => {
    const c = { x: cx, y: head.y, w, h: head.h };
    cx += w;
    return c;
  });
  const p: Prim[] = [];
  headers.forEach((h, i) => p.push(...ctx.textIn(h, inset(colsR[i]!, 0, 1.5), { ...style, valign: 'middle', fit: true }).prims));
  p.push(line(r.x, head.y + head.h, r.x + r.w, head.y + head.h, ctx.stroke('rule', 'ink')));
  const n = Math.floor(body.h / pitch);
  for (let k = 1; k <= n; k++) p.push(line(r.x, body.y + k * pitch, r.x + r.w, body.y + k * pitch, ctx.stroke('hair')));
  for (let i = 1; i < colsR.length; i++) p.push(line(colsR[i]!.x, head.y + 1, colsR[i]!.x, body.y + n * pitch, ctx.stroke('hair', 'ruleSoft')));
  ctx.add(id, label, p);
}

/* ---------- Contraseñas ---------- */

export const passwords: SectionModule = {
  type: 'passwords',
  scope: 'back',
  defaults: { pages: 2, separate: false, detailed: 'auto' },
  plan: (_doc, item) => pagesDraft(item, 'passwords', 'passwords', 'Contraseñas', Number(opt(item, 'pages', 2))),
  layout(ctx, page) {
    const s = ctx.s.passwords;
    const part = param(page, 'part', 0);
    const detailedOpt = param<string | boolean>(page, 'detailed', 'auto');
    const detailed = detailedOpt === true || (detailedOpt === 'auto' && ctx.has('password-log'));
    let r = headed(ctx, s.title, '', { titleSize: 'title' });
    if (part === 0) {
      const note = ctx.textIn(s.note, { ...r, h: 9 }, { role: 'quote', size: ctx.theme.sizes.small + 0.5, wrap: true, fit: true, color: '#555555' });
      ctx.add('passwords.note', 'Consejo de seguridad', note.prims);
      r = takeTop(r, note.bbox.h + 3)[1];
      if (detailed) {
        const ex = ctx.s.pages.passwords;
        const p: Prim[] = [...fieldLine(ctx, r.x, r.y + 6, r.w, `${ex.mainEmail}:`, ctx.theme.sizes.labelSmall), ...fieldLine(ctx, r.x, r.y + 13, r.w, `${ex.manager}:`, ctx.theme.sizes.labelSmall)];
        ctx.add('passwords.main', ex.mainEmail, p);
        r = takeTop(r, 17)[1];
      }
    }
    const pitch = Math.max(8, ctx.theme.writing.pitch * 1.45);
    if (detailed) {
      const ex = ctx.s.pages.passwords;
      table(ctx, r, [s.platform, s.user, s.hint, ex.changed, ex.twoFactor], [3, 3, 3, 1.4, 1.1], pitch, 'passwords.table', s.title);
    } else {
      table(ctx, r, [s.platform, s.user, s.hint], [4, 3, 3], pitch, 'passwords.table', s.title);
    }
  },
};

/* ---------- Contactos ---------- */

export const contacts: SectionModule = {
  type: 'contacts',
  scope: 'back',
  defaults: { pages: 1 },
  plan: (_doc, item) => pagesDraft(item, 'contacts', 'contacts', 'Contactos', Number(opt(item, 'pages', 1))),
  layout(ctx, page) {
    const s = ctx.s.contacts;
    const cats = (param<string[] | null>(page, 'categories', null) ?? s.categories) as string[];
    const r = headed(ctx, s.title, '', { titleSize: 'title' });
    const parts = rows(r, cats.length, 4);
    const pitch = Math.max(7.5, ctx.theme.writing.pitch * 1.35);
    cats.forEach((cat, i) => {
      const box = parts[i]!;
      const h = sectionHeader(ctx, box, cat, `contacts.${i}.head`);
      ctx.add(`contacts.${i}`, cat, ruledLines({ x: box.x, y: box.y + h, w: box.w, h: box.h - h }, pitch, ctx.stroke('hair')));
    });
  },
};

/* ---------- Salud ---------- */

export const health: SectionModule = {
  type: 'health',
  scope: 'back',
  defaults: { pages: 1 },
  plan: (_doc, item) => pagesDraft(item, 'health', 'health', 'Salud', Number(opt(item, 'pages', 1))),
  layout(ctx, page) {
    const s = ctx.s.health;
    const part = param(page, 'part', 0);
    let r = headed(ctx, s.title, '', { titleSize: 'title' });
    if (part === 0) {
      const pitch = Math.max(7.5, ctx.theme.writing.pitch * 1.25);
      const p: Prim[] = [];
      [s.bloodType, s.allergies, s.insurance, s.memberNumber, s.doctor].forEach((f, i) => p.push(...fieldLine(ctx, r.x, r.y + (i + 1) * pitch, r.w, `${f}:`)));
      ctx.add('health.fields', s.title, p);
      r = takeTop(r, 5 * pitch + 5)[1];
    }
    const [meds, checks] = takeBottom(r, r.h * 0.42, 5);
    const hm = sectionHeader(ctx, meds, s.medication, 'health.meds.head', { rule: 'none' });
    table(ctx, { x: meds.x, y: meds.y + hm, w: meds.w, h: meds.h - hm }, [s.medName, s.dose, s.schedule, s.since], [3, 1.6, 2, 1.4], Math.max(7, ctx.theme.writing.pitch * 1.15), 'health.meds', s.medication);
    const hc = sectionHeader(ctx, checks, s.checkups, 'health.checks.head', { rule: 'none' });
    table(ctx, { x: checks.x, y: checks.y + hc, w: checks.w, h: checks.h - hc }, [ctx.s.common.date, s.specialty, ctx.s.common.notes], [1.3, 2.2, 4], Math.max(7, ctx.theme.writing.pitch * 1.15), 'health.checks', s.checkups);
  },
};

/* ---------- Diario de sueño (14 días por página) ---------- */

export const sleepDiary: SectionModule = {
  type: 'sleepDiary',
  scope: 'back',
  defaults: { pages: 2 },
  plan: (_doc, item) => pagesDraft(item, 'sleep', 'sleepDiary', 'Diario de sueño', Number(opt(item, 'pages', 2))),
  layout(ctx) {
    const s = ctx.s.pages.sleep;
    let r = headed(ctx, s.title, '', { titleSize: 'titleSmall' });
    const hint = ctx.textIn(s.hint, { ...r, h: 9 }, { role: 'body', size: 'small', wrap: true, fit: true });
    ctx.add('sleep.hint', 'Consigna', hint.prims);
    r = takeTop(r, hint.bbox.h + 3)[1];
    table(ctx, r, [ctx.s.common.date, s.bed, s.latency, s.awakenings, s.up, s.quality], [1.3, 1.4, 1.7, 1.4, 1.4, 1.4], (r.h - 6) / 14, 'sleep.table', s.title);
  },
};

/* ---------- Destrabar una tarea (postergación) ---------- */

export const unstuck: SectionModule = {
  type: 'unstuck',
  scope: 'back',
  defaults: { pages: 1 },
  plan: (_doc, item) => pagesDraft(item, 'unstuck', 'unstuck', 'Destrabar', Number(opt(item, 'pages', 1))),
  layout(ctx) {
    const s = ctx.s.pages.unstuck;
    const r = headed(ctx, s.title, '', { titleSize: 'titleSmall' });
    const halves = rows(r, 2, 6);
    halves.forEach((box, k) => {
      const p: Prim[] = [rect(box, { stroke: ctx.stroke('hair', 'rule') })];
      const inner = inset(box, 3);
      const steps = [s.avoiding, s.feeling, s.firstStep];
      const parts = rows({ x: inner.x, y: inner.y, w: inner.w, h: inner.h - 8 }, steps.length, 2);
      steps.forEach((label, i) => {
        const pr = parts[i]!;
        p.push(...ctx.textIn(`${i + 1}. ${label}`, { ...pr, h: 3 }, { role: 'label', size: 'labelSmall', upper: true, tracking: true }).prims);
        p.push(...ruledLines({ x: pr.x, y: pr.y + 2.5, w: pr.w, h: pr.h - 2.5 }, ctx.theme.writing.pitch, ctx.stroke('hair')));
      });
      p.push(ctx.textAt(`4. ${s.when}`, inner.x, inner.y + inner.h - 1.5, { role: 'label', size: 'labelSmall', tracking: 0.05 }).prim);
      ctx.add(`unstuck.${k}`, s.title, p);
    });
  },
};

/* ---------- Estimé / tardé (falacia de planificación) ---------- */

export const estimates: SectionModule = {
  type: 'estimates',
  scope: 'back',
  defaults: { pages: 1 },
  plan: (_doc, item) => pagesDraft(item, 'estimates', 'estimates', 'Estimaciones', Number(opt(item, 'pages', 1))),
  layout(ctx) {
    const s = ctx.s.pages.estimates;
    const r = headed(ctx, s.title, '', { titleSize: 'titleSmall' });
    table(ctx, r, [s.task, s.steps, s.estimated, s.actual], [4, 1.2, 1.4, 1.4], Math.max(7, ctx.theme.writing.pitch * 1.15), 'estimates.table', s.title);
  },
};

/* ---------- Notas ---------- */

export const notes: SectionModule = {
  type: 'notes',
  scope: 'any',
  defaults: { count: 4, style: 'auto' },
  plan: (_doc, item) => {
    const n = Math.max(0, Math.min(200, Number(opt(item, 'count', 4))));
    return Array.from({ length: n }, (_, i) => ({ key: `back:notes:${item.id}:${i}`, type: 'notes', section: item.id, title: 'Notas', group: 'back', params: { style: opt(item, 'style', 'auto') } }));
  },
  layout(ctx, page) {
    const style = param<string>(page, 'style', 'auto');
    ctx.add('notes.area', 'Área de notas', writingArea(ctx, ctx.content, style === 'auto' ? 'dots' : (style as 'dots')), { role: 'writing' });
  },
};

/* ---------- Relleno ---------- */

export const filler: SectionModule = {
  type: 'filler',
  scope: 'any',
  defaults: {},
  plan: () => [],
  layout(ctx, page: PagePlan) {
    const style = param<string>(page, 'style', 'dots');
    if (style === 'blank') return;
    ctx.add('notes.area', 'Área de notas', writingArea(ctx, ctx.content, style as 'dots'), { role: 'writing' });
  },
};

/* ---------- Página propia (imagen, SVG o PDF importado, o plantilla) ---------- */

/**
 * Contenido de una página propia o de una plantilla: fondo para escribir (en `backdrop`), imagen
 * o página de un PDF, o texto con las variables de la página (debajo de `textTop` mm del título).
 */
function drawPageContent(ctx: LayoutContext, page: PagePlan, c: CustomPage['content'], backdrop: Rect, textTop: number): void {
  const area: Rect = c.area === 'page' ? { x: 0, y: 0, w: ctx.page.w, h: ctx.page.h } : ctx.content;
  const below = inset(ctx.content, textTop, 0, 0, 0);
  if (c.background !== 'blank') ctx.add('custom.background', 'Fondo', writingArea(ctx, backdrop, c.background), { role: 'writing', layer: 0 });
  if (c.kind === 'artwork' && c.assetId) {
    const info = ctx.doc.assets.get(c.assetId);
    const name = ctx.doc.design.assets.find((a) => a.id === c.assetId)?.name ?? c.assetId;
    if (!info) ctx.warn('missingAsset', `No se encontró el archivo «${name}» de esta página: se deja un recuadro vacío.`, { name });
    const rotated = c.rotation === 90 || c.rotation === 270;
    const box = rotated ? { x: area.x + (area.w - area.h) / 2, y: area.y + (area.h - area.w) / 2, w: area.h, h: area.w } : area;
    const prims = assetPrims(info, box, { fit: c.fit, opacity: c.opacity, rotation: c.rotation, clip: c.fit === 'cover', minStrokePt: 0.2 });
    if (info?.kind === 'pdf') {
      const total = info.pages ?? 1;
      if (c.pdfPage > total) ctx.warn('pdfPageRange', `«${name}» tiene ${total} página${total === 1 ? '' : 's'}; se usa la última en lugar de la ${c.pdfPage}.`, { name, total, page: c.pdfPage });
      const pageNo = Math.min(Math.max(1, c.pdfPage), total);
      const walk = (ps: Prim[]): void => ps.forEach((p) => (p.t === 'pdf' ? (p.page = pageNo) : p.t === 'group' ? walk(p.children) : undefined));
      walk(prims);
    }
    ctx.add('custom.artwork', 'Ilustración', prims, { role: 'artwork', layer: 5, bbox: box });
  } else if (c.kind === 'text' && c.text) {
    const t = ctx.textIn(fmt(c.text, pageTextVars(ctx, page)), below, { role: 'body', size: 'body', wrap: true, fit: true, leading: 1.45 });
    ctx.add('custom.text', 'Texto', t.prims);
  }
}

export const custom: SectionModule = {
  type: 'custom',
  scope: 'any',
  defaults: {},
  plan: () => [],
  layout(ctx, page) {
    const id = param<string>(page, 'id', '');
    const cp = ctx.doc.design.customPages.find((p) => p.id === id);
    if (!cp) return;
    const withTitle = Boolean(cp.title) && cp.content.kind !== 'artwork';
    if (withTitle) {
      const t = ctx.textAt(cp.title, ctx.content.x, ctx.content.y + 8, { role: 'title', size: 'titleSmall' });
      ctx.add('custom.title', 'Título', [t.prim]);
    }
    // El fondo ocupa todo el contenido (el título va encima); el texto empieza debajo del título.
    drawPageContent(ctx, page, cp.content, ctx.content, withTitle ? 14 : 0);
  },
};

/**
 * Plantilla de página como sección: se diseña una vez (contenido y elementos propios del tipo
 * `tpl:<id>`) y se repite donde esté en la lista (una vez, o cada mes, semana o día dentro de
 * «Meses»). En las copias con fecha, el encabezado dice el día, la semana o el mes.
 */
export const pageTemplate: SectionModule = {
  type: 'pageTemplate',
  scope: 'any',
  defaults: { pages: 1 },
  plan: (doc, item) => {
    const id = String(item.options.template ?? '');
    const tp = doc.design.pageTemplates.find((x) => x.id === id);
    if (!tp) return [];
    const n = Math.max(1, Math.min(20, Number(opt(item, 'pages', 1))));
    return Array.from({ length: n }, (_, i) => ({ key: `tpl:${id}:${i}`, type: `tpl:${id}`, section: item.id, title: tp.title, group: 'back', params: { template: id, part: i, parts: n } }));
  },
  layout(ctx, page) {
    const tp = ctx.doc.design.pageTemplates.find((x) => x.id === param<string>(page, 'template', ''));
    if (!tp) return;
    let top = 0;
    if (tp.showTitle) {
      const v = pageTextVars(ctx, page);
      // A la derecha, lo que identifica la copia: el día, la semana o el mes.
      const right = v.date ? `${v.weekday} ${v.date}` : v.week ? fmt(ctx.s.week.label, { n: v.week }) : String(v.month);
      top = headed(ctx, fmt(tp.title, v), right).y - ctx.content.y;
    }
    drawPageContent(ctx, page, tp.content, inset(ctx.content, top, 0, 0, 0), top);
  },
};

export const BACK_SECTIONS: SectionModule[] = [passwords, contacts, health, sleepDiary, unstuck, estimates, notes, filler, custom, pageTemplate];
