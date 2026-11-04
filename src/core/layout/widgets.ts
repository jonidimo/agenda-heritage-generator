/**
 * Piezas reutilizables de página: áreas de escritura (renglones, puntos,
 * cuadrícula), encabezados, minicalendarios, íconos vectoriales (fases
 * lunares, signos de los métodos) y casillas.
 */
import type { DayInfo, MoonPhase } from '../calendar';
import { weekdayLetter } from '../calendar/locale';
import type { WritingStyle } from '../design/themes';
import { TABULAR_FEATURES } from '../text/shape';
import { ptToMm, type Rect } from '../util/geometry';
import { cols, rows } from './box';
import type { LayoutContext, SizeKey } from './context';
import { circle, line, type DotsPrim, type Prim, type Stroke } from './prims';

/* ---------- Áreas de escritura ---------- */

export function ruledLines(r: Rect, pitch: number, stroke: Stroke, opts: { includeTop?: boolean; includeBottom?: boolean } = {}): Prim[] {
  const out: Prim[] = [];
  const start = opts.includeTop ? 0 : 1;
  const n = Math.floor((r.h + 1e-6) / pitch);
  for (let i = start; i <= n; i++) {
    const y = r.y + i * pitch;
    if (y > r.y + r.h + 1e-6) break;
    if (i === n && opts.includeBottom === false) break;
    out.push(line(r.x, y, r.x + r.w, y, stroke));
  }
  return out;
}

export function dotField(r: Rect, pitch: number, radiusMm: number, color: string, opts: { snap?: boolean } = {}): DotsPrim {
  const nx = Math.max(1, Math.floor((r.w + 1e-6) / pitch));
  const ny = Math.max(1, Math.floor((r.h + 1e-6) / pitch));
  const ox = opts.snap ? r.x + pitch / 2 : r.x + (r.w - (nx - 1) * pitch) / 2;
  const oy = opts.snap ? r.y + pitch / 2 : r.y + (r.h - (ny - 1) * pitch) / 2;
  const pts: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push(ox + i * pitch, oy + j * pitch);
  return { t: 'dots', pts, r: radiusMm, color };
}

export function squareGrid(r: Rect, pitch: number, stroke: Stroke): Prim[] {
  const out: Prim[] = [];
  const nx = Math.floor((r.w + 1e-6) / pitch);
  const ny = Math.floor((r.h + 1e-6) / pitch);
  const w = nx * pitch;
  const h = ny * pitch;
  const ox = r.x + (r.w - w) / 2;
  const oy = r.y + (r.h - h) / 2;
  for (let i = 0; i <= nx; i++) out.push(line(ox + i * pitch, oy, ox + i * pitch, oy + h, stroke));
  for (let j = 0; j <= ny; j++) out.push(line(ox, oy + j * pitch, ox + w, oy + j * pitch, stroke));
  return out;
}

/** Área de escritura según el estilo del tema (o uno forzado). */
export function writingArea(ctx: LayoutContext, r: Rect, style?: WritingStyle | 'auto', pitch?: number): Prim[] {
  const s = ctx.writingStyle(style);
  const p = pitch ?? (s === 'dots' || s === 'grid' ? ctx.theme.dots.pitch : ctx.theme.writing.pitch);
  if (s === 'lines') return ruledLines(r, p, ctx.stroke('hair'));
  if (s === 'dots') return [dotField(r, p, ptToMm(ctx.theme.dots.radius), ctx.theme.dots.color)];
  if (s === 'grid') return squareGrid(r, p, ctx.stroke('grid', 'ruleSoft'));
  return [];
}

/* ---------- Encabezados ---------- */

/**
 * Encabezado Heritage: título grande (izquierda) + rótulo chico (derecha)
 * alineados sobre la misma línea de base, con filete debajo. Devuelve el alto usado.
 */
export function pageHeader(
  ctx: LayoutContext,
  r: Rect,
  title: string,
  right: string,
  opts: { titleSize?: SizeKey | number; rightSize?: SizeKey | number; rule?: 'rule' | 'strong' | 'heavy' | 'none'; idPrefix?: string; gap?: number } = {},
): number {
  const titleRun = ctx.run(title, { role: 'title', size: opts.titleSize ?? 'title' });
  const baseline = r.y + titleRun.ascent * 0.92;
  const t = ctx.textAt(title, r.x, baseline, { role: 'title', size: opts.titleSize ?? 'title' });
  const prefix = opts.idPrefix ?? 'header';
  ctx.add(`${prefix}.title`, 'Título', [t.prim]);
  if (right) {
    const rr = ctx.textAt(right, r.x + r.w, baseline, { role: 'heading', size: opts.rightSize ?? 'label', upper: true, tracking: true, align: 'right' });
    ctx.add(`${prefix}.right`, 'Rótulo del encabezado', [rr.prim]);
  }
  const ruleY = baseline - titleRun.descent + 1.2;
  if (opts.rule !== 'none') ctx.add(`${prefix}.rule`, 'Filete del encabezado', [line(r.x, ruleY, r.x + r.w, ruleY, ctx.stroke(opts.rule ?? 'rule'))], { editable: false });
  return ruleY - r.y + (opts.gap ?? 4);
}

/** Rótulo de sección en mayúsculas con filete debajo (se achica para entrar en el ancho). Devuelve el alto usado. */
export function sectionHeader(ctx: LayoutContext, r: Rect, text: string, id: string, opts: { size?: SizeKey | number; rule?: 'rule' | 'hair' | 'none'; gap?: number } = {}): number {
  const size = opts.size ?? 'heading';
  const run = ctx.run(text, { role: 'heading', size, upper: true, tracking: ctx.theme.tracking.heading });
  const t = ctx.textIn(text, { x: r.x, y: r.y, w: r.w, h: run.capHeight + 1 }, { role: 'heading', size, upper: true, tracking: ctx.theme.tracking.heading, fit: true, ellipsis: true });
  const baseline = r.y + run.capHeight;
  const prims: Prim[] = [...t.prims];
  const ruleY = baseline + 1.2;
  if (opts.rule !== 'none') prims.push(line(r.x, ruleY, r.x + r.w, ruleY, opts.rule === 'hair' ? ctx.stroke('hair') : ctx.stroke('rule')));
  ctx.add(id, text, prims);
  return ruleY - r.y + (opts.gap ?? 2.5);
}

/* ---------- Minicalendario ---------- */

export interface MiniCalOpts {
  /** Días resaltados (subrayado + negrita). */
  highlight?: Set<string>;
  /** Mes «propio» (los demás días se atenúan u ocultan). */
  month?: { y: number; m: number } | null;
  otherMonth?: 'dim' | 'hide' | 'show';
  numberSize?: SizeKey | number;
  headerSize?: SizeKey | number;
  rowH?: number;
  headerH?: number;
  weekendStyle?: 'gray' | 'bold' | 'none';
  holidays?: 'underline' | 'none';
  /** Orden de días ISO de la semana (empieza en lunes o domingo). */
  order: number[];
  headerRule?: boolean;
}

/** Minicalendario dentro de una caja: encabezado con iniciales + filas de semanas. */
export function miniCalendar(ctx: LayoutContext, r: Rect, weeks: DayInfo[][], opts: MiniCalOpts): Prim[] {
  const out: Prim[] = [];
  const headerH = opts.headerH ?? Math.min(4.2, r.h / (weeks.length + 1));
  const rowH = opts.rowH ?? (r.h - headerH) / Math.max(1, weeks.length);
  const colRects = cols({ x: r.x, y: r.y, w: r.w, h: headerH }, 7);
  opts.order.forEach((dow, i) => {
    const cell = colRects[i]!;
    const letter = weekdayLetter(ctx.s, dow);
    const t = ctx.textIn(letter, cell, { role: 'labelStrong', size: opts.headerSize ?? 'labelSmall', align: 'center', valign: 'middle' });
    out.push(...t.prims);
  });
  if (opts.headerRule) out.push(line(r.x, r.y + headerH, r.x + r.w, r.y + headerH, ctx.stroke('hair', 'ink')));
  const body = { x: r.x, y: r.y + headerH, w: r.w, h: rowH * weeks.length };
  const rowRects = rows(body, weeks.length);
  weeks.forEach((week, wi) => {
    const cells = cols(rowRects[wi]!, 7);
    week.forEach((day, di) => {
      const cell = cells[di]!;
      const inMonth = !opts.month || (day.y === opts.month.y && day.m === opts.month.m);
      if (!inMonth && opts.otherMonth === 'hide') return;
      const highlighted = opts.highlight?.has(day.iso) ?? false;
      const weekendGray = opts.weekendStyle === 'gray' && day.isWeekend;
      const isHoliday = day.holidays.some((h) => h.type === 'public');
      const color = !inMonth && opts.otherMonth === 'dim' ? ctx.theme.colors.ruleSoft : weekendGray || isHoliday ? '#808080' : ctx.theme.colors.ink;
      const t = ctx.textIn(String(day.d), cell, {
        role: highlighted || (opts.weekendStyle === 'bold' && day.isWeekend) ? 'labelStrong' : 'number',
        size: opts.numberSize ?? 'calendarNumber',
        align: 'center',
        valign: 'middle',
        color: isHoliday && opts.holidays !== 'none' ? ctx.theme.colors.ink : color,
        features: TABULAR_FEATURES,
      });
      out.push(...t.prims);
      const p = t.prims[0];
      if (p && (highlighted || (isHoliday && opts.holidays === 'underline'))) {
        const y = p.y + 0.9;
        out.push(line(p.x - 0.2, y, p.x + p.run.width + 0.2, y, ctx.stroke(highlighted ? 'rule' : 'hair', 'ink')));
      }
    });
  });
  return out;
}

/* ---------- Íconos vectoriales ---------- */

/**
 * Fase lunar: el lado oscuro se rellena. En el hemisferio sur la parte
 * iluminada del cuarto creciente se ve a la izquierda.
 */
export function moonIcon(ctx: LayoutContext, cx: number, cy: number, r: number, phase: MoonPhase, south: boolean): Prim[] {
  const ink = ctx.theme.colors.ink;
  const stroke = { color: ink, width: Math.max(0.12, r * 0.18) };
  if (phase === 'new') return [circle(cx, cy, r, { fill: { color: ink } })];
  if (phase === 'full') return [circle(cx, cy, r, { stroke })];
  // Cuarto creciente (norte): iluminada la derecha → oscura la izquierda.
  const darkLeft = (phase === 'first') !== south;
  const sweep = darkLeft ? 0 : 1;
  const d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweep} ${cx} ${cy + r} Z`;
  return [
    { t: 'path', d, fill: { color: ink } },
    circle(cx, cy, r, { stroke }),
  ];
}

export type Signifier = 'task' | 'done' | 'migrated' | 'scheduled' | 'event' | 'note' | 'progress' | 'resumed' | 'priority';

/** Signos de los métodos (Alastair / Bullet Journal) dibujados como vectores. */
export function signifierIcon(ctx: LayoutContext, kind: Signifier, cx: number, cy: number, size: number): Prim[] {
  const s = ctx.stroke('rule', 'ink', { width: Math.max(0.18, size * 0.12), cap: 'round', join: 'round' });
  const h = size / 2;
  switch (kind) {
    case 'task':
      return [circle(cx, cy, size * 0.16, { fill: { color: ctx.theme.colors.ink } })];
    case 'done':
      return [line(cx - h * 0.7, cy - h * 0.7, cx + h * 0.7, cy + h * 0.7, s), line(cx - h * 0.7, cy + h * 0.7, cx + h * 0.7, cy - h * 0.7, s)];
    case 'migrated':
      return [{ t: 'path', d: `M ${cx - h * 0.5} ${cy - h * 0.7} L ${cx + h * 0.5} ${cy} L ${cx - h * 0.5} ${cy + h * 0.7}`, stroke: s }];
    case 'scheduled':
      return [{ t: 'path', d: `M ${cx + h * 0.5} ${cy - h * 0.7} L ${cx - h * 0.5} ${cy} L ${cx + h * 0.5} ${cy + h * 0.7}`, stroke: s }];
    case 'event':
      return [circle(cx, cy, size * 0.3, { stroke: s })];
    case 'note':
      return [line(cx - h * 0.6, cy, cx + h * 0.6, cy, s)];
    case 'progress':
      return [circle(cx, cy, size * 0.16, { fill: { color: ctx.theme.colors.ink } }), line(cx - h * 0.6, cy + h * 0.6, cx + h * 0.6, cy - h * 0.6, s)];
    case 'resumed':
      return [
        { t: 'path', d: `M ${cx - h * 0.6} ${cy + h * 0.1} A ${h * 0.6} ${h * 0.6} 0 1 1 ${cx} ${cy + h * 0.6}`, stroke: s },
        { t: 'path', d: `M ${cx - h * 0.85} ${cy - h * 0.25} L ${cx - h * 0.6} ${cy + h * 0.1} L ${cx - h * 0.25} ${cy - h * 0.1}`, stroke: s },
      ];
    case 'priority':
      return [{ t: 'path', d: `M ${cx} ${cy - h * 0.75} L ${cx + h * 0.22} ${cy - h * 0.2} L ${cx + h * 0.75} ${cy - h * 0.2} L ${cx + h * 0.32} ${cy + h * 0.15} L ${cx + h * 0.48} ${cy + h * 0.72} L ${cx} ${cy + h * 0.38} L ${cx - h * 0.48} ${cy + h * 0.72} L ${cx - h * 0.32} ${cy + h * 0.15} L ${cx - h * 0.75} ${cy - h * 0.2} L ${cx - h * 0.22} ${cy - h * 0.2} Z`, fill: { color: ctx.theme.colors.ink } }];
  }
}

/** Ícono de cumpleaños/fecha personal (pequeño corazón). */
export function heartIcon(ctx: LayoutContext, cx: number, cy: number, size: number): Prim {
  const s = size / 2;
  const d = `M ${cx} ${cy + s * 0.85} C ${cx - s * 1.25} ${cy - s * 0.05} ${cx - s * 0.75} ${cy - s * 1.05} ${cx} ${cy - s * 0.35} C ${cx + s * 0.75} ${cy - s * 1.05} ${cx + s * 1.25} ${cy - s * 0.05} ${cx} ${cy + s * 0.85} Z`;
  return { t: 'path', d, fill: { color: ctx.theme.colors.ink } };
}

/** Casilla circular (para listas de pendientes). */
export function checkCircle(ctx: LayoutContext, cx: number, cy: number, r: number): Prim {
  return circle(cx, cy, r, { stroke: ctx.stroke('rule', 'ink', { width: ptToMm(0.5) }) });
}

/** Casilla cuadrada. */
export function checkBox(ctx: LayoutContext, x: number, y: number, size: number): Prim {
  return { t: 'rect', x, y, w: size, h: size, stroke: ctx.stroke('rule', 'ink', { width: ptToMm(0.5) }) };
}

/** Hemisferio sur según el país (para orientar los íconos lunares). */
export function isSouthern(country: string | null, setting: 'auto' | 'north' | 'south' = 'auto'): boolean {
  if (setting !== 'auto') return setting === 'south';
  const south = new Set(['AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'BR', 'ZA', 'AU', 'NZ', 'NA', 'BW', 'MZ', 'MG', 'ZW', 'ZM', 'AO', 'LS', 'SZ', 'MW', 'FJ', 'PG']);
  return country ? south.has(country) : false;
}
