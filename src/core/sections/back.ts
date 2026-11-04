/**
 * Páginas finales: contraseñas (opcionalmente como libreta aparte para
 * guardar en casa), contactos, salud, diario de sueño, destrabar tareas,
 * estimaciones y notas. Más las páginas especiales: relleno y páginas propias.
 */
import { fmt } from '../i18n';
import { assetPrims } from '../document/assets';
import { flex, hsplit, inset, rows, takeBottom, takeTop } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import { line, rect, type Prim } from '../layout/prims';
import { ruledLines, sectionHeader, writingArea } from '../layout/widgets';
import type { Rect } from '../util/geometry';
import { fieldLine, headed } from './common';
import { opt, param, type PagePlan, type SectionModule } from './types';

function pagesDraft(item: { id: string; options: Record<string, unknown> }, prefix: string, type: string, title: string, count: number) {
  const n = Math.max(1, Math.min(20, count));
  return Array.from({ length: n }, (_, i) => ({ key: `back:${prefix}:${i}`, type, section: item.id, title, group: 'back', params: { ...item.options, part: i, parts: n } }));
}

/** Tabla de renglones con columnas (anchos relativos) y encabezados. */
function table(ctx: LayoutContext, r: Rect, headers: string[], weights: number[], pitch: number, id: string, label: string): void {
  const [head, body] = takeTop(r, 6);
  const colsR = hsplit(head, weights.map((w) => flex(w)), 0);
  const p: Prim[] = [];
  headers.forEach((h, i) => p.push(...ctx.textIn(h, inset(colsR[i]!, 0, 1.5), { role: 'heading', size: 'labelSmall', upper: true, tracking: true, valign: 'middle', fit: true }).prims));
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
    ctx.add('notes.area', 'Área de notas', writingArea(ctx, ctx.content, style === 'auto' ? 'dots' : (style as 'dots')), { editable: false });
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
    ctx.add('notes.area', 'Área de notas', writingArea(ctx, ctx.content, style as 'dots'), { editable: false });
  },
};

/* ---------- Página propia (imagen, SVG o PDF importado, o plantilla) ---------- */

export const custom: SectionModule = {
  type: 'custom',
  scope: 'any',
  defaults: {},
  plan: () => [],
  layout(ctx, page) {
    const id = param<string>(page, 'id', '');
    const cp = ctx.doc.design.customPages.find((p) => p.id === id);
    if (!cp) return;
    const c = cp.content;
    const area: Rect = c.area === 'page' ? { x: 0, y: 0, w: ctx.page.w, h: ctx.page.h } : ctx.content;
    if (c.background !== 'blank') ctx.add('custom.background', 'Fondo', writingArea(ctx, ctx.content, c.background), { editable: false, layer: 0 });
    if (cp.title && c.kind !== 'artwork') {
      const t = ctx.textAt(cp.title, ctx.content.x, ctx.content.y + 8, { role: 'title', size: 'titleSmall' });
      ctx.add('custom.title', 'Título', [t.prim]);
    }
    if (c.kind === 'artwork' && c.assetId) {
      const info = ctx.doc.assets.get(c.assetId);
      const rotated = c.rotation === 90 || c.rotation === 270;
      const box = rotated ? { x: area.x + (area.w - area.h) / 2, y: area.y + (area.h - area.w) / 2, w: area.h, h: area.w } : area;
      const prims = assetPrims(info ? { ...info, ...(info.kind === 'pdf' ? {} : {}) } : undefined, box, { fit: c.fit, opacity: c.opacity, rotation: c.rotation, clip: c.fit === 'cover', minStrokePt: 0.2 });
      if (info?.kind === 'pdf') {
        const walk = (ps: Prim[]): void => ps.forEach((p) => (p.t === 'pdf' ? (p.page = c.pdfPage) : p.t === 'group' ? walk(p.children) : undefined));
        walk(prims);
      }
      ctx.add('custom.artwork', 'Ilustración', prims, { role: 'artwork', layer: 5, bbox: box });
    } else if (c.kind === 'text' && c.text) {
      const t = ctx.textIn(fmt(c.text, { year: ctx.doc.design.calendar.year, name: ctx.doc.design.persona.name }), inset(ctx.content, cp.title ? 14 : 0, 0, 0, 0), { role: 'body', size: 'body', wrap: true, fit: true, leading: 1.45 });
      ctx.add('custom.text', 'Texto', t.prims);
    }
  },
};

export const BACK_SECTIONS: SectionModule[] = [passwords, contacts, health, sleepDiary, unstuck, estimates, notes, filler, custom];
