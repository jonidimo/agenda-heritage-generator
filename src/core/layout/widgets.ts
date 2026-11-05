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
import type { LayoutContext, SizeKey, TextAtOpts } from './context';
import { circle, line, rect, type DotsPrim, type Prim, type Stroke, type TextPrim, type TextSource } from './prims';

/* ---------- Texto de una línea ---------- */

/**
 * Una línea de texto en una caja a su medida. Es la caja que se ve al seleccionarla, y cambiarla de
 * tamaño la ajusta: si se angosta, el cuerpo se achica hasta que entre. Sin ajustes del editor,
 * el texto sale exactamente donde lo pondría `textAt`.
 */
export function textLine(ctx: LayoutContext, id: string, text: string, at: { x: number; baseline: number }, opts: TextAtOpts = {}): { prim: TextPrim; width: number; bbox: Rect } {
  const natural = ctx.textAt(text, at.x, at.baseline, opts);
  const box = ctx.rect(id, natural.bbox);
  if (box.x === natural.bbox.x && box.y === natural.bbox.y && box.w === natural.bbox.w && box.h === natural.bbox.h) return natural;
  const placed = ctx.textIn(text, box, { ...opts, fit: true, valign: 'top' });
  // Lo que se devuelve para seguir maquetando (ancho, caja) es el natural: lo que viene después no se corre porque este elemento cambió.
  return { prim: placed.prims[0] ?? natural.prim, width: natural.width, bbox: natural.bbox };
}

/* ---------- Áreas de escritura ---------- */

export function ruledLines(r: Rect, pitch: number, stroke: Stroke, opts: { includeTop?: boolean; includeBottom?: boolean } = {}): Prim[] {
  const out: Prim[] = [];
  // Renglones para escribir, salvo que quien llama diga otra cosa (el tema les da estilo).
  if (!stroke.use) stroke = { ...stroke, use: 'writing' };
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

export function dotField(r: Rect, pitch: number, radiusMm: number, color: string, opts: { snap?: boolean; pitchY?: number } = {}): DotsPrim {
  const py = opts.pitchY && opts.pitchY > 0 ? opts.pitchY : pitch;
  const nx = Math.max(1, Math.floor((r.w + 1e-6) / pitch));
  const ny = Math.max(1, Math.floor((r.h + 1e-6) / py));
  const ox = opts.snap ? r.x + pitch / 2 : r.x + (r.w - (nx - 1) * pitch) / 2;
  const oy = opts.snap ? r.y + py / 2 : r.y + (r.h - (ny - 1) * py) / 2;
  const pts: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push(ox + i * pitch, oy + j * py);
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
  if (s === 'dots') return [dotField(r, p, ptToMm(ctx.theme.dots.radius), ctx.theme.dots.color, pitch === undefined ? { pitchY: ctx.theme.dots.pitchY } : {})];
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
  opts: { titleSize?: SizeKey | number; rightSize?: SizeKey | number; rule?: 'rule' | 'strong' | 'heavy' | 'none'; idPrefix?: string; gap?: number; titleSource?: TextSource } = {},
): number {
  const titleRun = ctx.run(title, { role: 'title', size: opts.titleSize ?? 'title' });
  const baseline = r.y + titleRun.ascent * 0.92;
  const prefix = opts.idPrefix ?? 'header';
  const t = textLine(ctx, `${prefix}.title`, title, { x: r.x, baseline }, { role: 'title', size: opts.titleSize ?? 'title' });
  ctx.add(`${prefix}.title`, 'Título', [t.prim], opts.titleSource ? { text: opts.titleSource } : {});
  let extra = 0;
  if (right) {
    const free = r.w - t.width - 4;
    const style = { role: 'heading' as const, size: opts.rightSize ?? 'label', upper: true, tracking: true };
    const natural = ctx.run(right, style);
    const rightId = `${prefix}.right`;
    if (natural.width <= free) {
      ctx.add(rightId, 'Rótulo del encabezado', [textLine(ctx, rightId, right, { x: r.x + r.w, baseline }, { ...style, align: 'right' }).prim]);
    } else if (free > 20 && ctx.textIn(right, { x: 0, y: 0, w: free, h: 10 }, { ...style, fit: true, silent: true }).sizePt > ctx.theme.minTextPt + 0.4) {
      // Se achica para entrar al lado del título.
      const box = ctx.rect(rightId, { x: r.x + r.w - free, y: baseline - natural.capHeight, w: free, h: natural.capHeight + 1 });
      ctx.add(rightId, 'Rótulo del encabezado', ctx.textIn(right, box, { ...style, fit: true, align: 'right' }).prims);
    } else {
      // No entra: baja a una línea propia, alineado a la derecha, debajo del título.
      const y2 = baseline - titleRun.descent + natural.capHeight + 1.5;
      const box = ctx.rect(rightId, { x: r.x, y: y2 - natural.capHeight, w: r.w, h: natural.capHeight + 1 });
      ctx.add(rightId, 'Rótulo del encabezado', ctx.textIn(right, box, { ...style, fit: true, align: 'right' }).prims);
      extra = natural.capHeight + 2;
    }
  }
  const ruleY = baseline - titleRun.descent + 1.2 + extra;
  if (opts.rule !== 'none') ctx.add(`${prefix}.rule`, 'Filete del encabezado', [line(r.x, ruleY, r.x + r.w, ruleY, ctx.stroke(opts.rule ?? 'rule', undefined, { use: 'separator' }))], { editable: false });
  return ruleY - r.y + (opts.gap ?? 4);
}

/** Rótulo de sección en mayúsculas con filete debajo (se achica para entrar en el ancho). Devuelve el alto usado. */
export function sectionHeader(ctx: LayoutContext, r: Rect, text: string, id: string, opts: { size?: SizeKey | number; rule?: 'rule' | 'hair' | 'none'; gap?: number; parent?: string } = {}): number {
  const size = opts.size ?? 'heading';
  const run = ctx.run(text, { role: 'heading', size, upper: true, tracking: ctx.theme.tracking.heading });
  // La caja llega hasta el filete: cambiarla de tamaño ajusta el texto (de ancho) y baja o sube el filete.
  const ruleBase = run.capHeight + 1.2;
  const box = ctx.rect(id, { x: r.x, y: r.y, w: r.w, h: ruleBase }, opts.parent);
  const t = ctx.textIn(text, { x: box.x, y: box.y, w: box.w, h: run.capHeight + 1 }, { role: 'heading', size, upper: true, tracking: ctx.theme.tracking.heading, fit: true, ellipsis: true });
  const prims: Prim[] = [...t.prims];
  const ruleY = box.y + box.h;
  if (opts.rule !== 'none') prims.push(line(box.x, ruleY, box.x + box.w, ruleY, opts.rule === 'hair' ? ctx.stroke('hair', undefined, { use: 'separator' }) : ctx.stroke('rule', undefined, { use: 'separator' })));
  ctx.add(id, text, prims);
  // Lo que viene después se ubica con la caja natural: no se corre porque este elemento cambió.
  return ruleBase - 0 + (opts.gap ?? 2.5);
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
  /** Se llama por cada día dibujado con su casilla (para que el día sea tocable en el PDF). */
  onCell?: (day: DayInfo, cell: Rect, inMonth: boolean) => void;
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
      opts.onCell?.(day, cell, inMonth);
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
  return { t: 'path', d: heartPath(cx, cy, size), fill: { color: ctx.theme.colors.ink } };
}

/** Contorno de un corazón centrado en (cx, cy) que cabe en un cuadrado de lado `size`. */
export function heartPath(cx: number, cy: number, size: number): string {
  const s = size / 2;
  return `M ${cx} ${cy + s * 0.85} C ${cx - s * 1.25} ${cy - s * 0.05} ${cx - s * 0.75} ${cy - s * 1.05} ${cx} ${cy - s * 0.35} C ${cx + s * 0.75} ${cy - s * 1.05} ${cx + s * 1.25} ${cy - s * 0.05} ${cx} ${cy + s * 0.85} Z`;
}

/** Casilla circular (para listas de pendientes). */
export function checkCircle(ctx: LayoutContext, cx: number, cy: number, r: number): Prim {
  return circle(cx, cy, r, { stroke: ctx.stroke('rule', 'ink', { width: ptToMm(0.5) }) });
}

/** Casilla cuadrada. */
export function checkBox(ctx: LayoutContext, x: number, y: number, size: number): Prim {
  return { t: 'rect', x, y, w: size, h: size, stroke: ctx.stroke('rule', 'ink', { width: ptToMm(0.5) }) };
}

/**
 * Lista con casillas sobre renglones. Sin más opciones dibuja viñetas circulares; `square` pone
 * casillas cuadradas, `none` ninguna, y `labels` escribe un texto sobre cada renglón.
 */
export function checklist(ctx: LayoutContext, r: Rect, pitch: number, opts: { circles?: boolean; max?: number; square?: boolean; labels?: readonly string[] } = {}): Prim[] {
  const out: Prim[] = [];
  const n = Math.min(opts.max ?? Infinity, Math.floor((r.h + 1e-6) / pitch));
  const marked = opts.circles !== false;
  for (let i = 1; i <= n; i++) {
    const y = r.y + i * pitch;
    if (marked) out.push(opts.square ? checkBox(ctx, r.x + 0.2, y - 3.5, 3) : checkCircle(ctx, r.x + 1.6, y - 1.9, 1.5));
    const text = opts.labels?.[i - 1];
    if (text) out.push(...ctx.textIn(text, { x: r.x + (marked ? 5 : 0.5), y: y - pitch + 0.4, w: r.w - (marked ? 5.5 : 1), h: pitch - 0.8 }, { role: 'body', size: ctx.theme.sizes.small, valign: 'bottom', fit: true, wrap: false }).prims);
    out.push(line(r.x + (marked ? 4.5 : 0), y, r.x + r.w, y, ctx.stroke('hair', undefined, { use: 'writing' })));
  }
  return out;
}

/**
 * Renglones de importes: una línea por fila, con la moneda al pie de una columna de cifras (el
 * 30 % derecho). El balance del mes y el elemento «finanzas» se dibujan con esto.
 */
export function amountLines(ctx: LayoutContext, area: Rect, pitch: number): Prim[] {
  const out: Prim[] = [];
  const n = Math.floor(area.h / pitch);
  for (let k = 1; k <= n; k++) {
    const y = area.y + k * pitch;
    out.push(line(area.x, y, area.x + area.w, y, ctx.stroke('hair', undefined, { use: 'table' })));
    out.push(line(area.x + area.w * 0.7, y - pitch + 1, area.x + area.w * 0.7, y, ctx.stroke('hair', 'ruleSoft', { use: 'table' })));
    out.push(ctx.textAt(ctx.doc.currency, area.x + area.w * 0.7 + 1, y - 1.2, { role: 'label', size: 'labelSmall', color: '#9a9a9a' }).prim);
  }
  return out;
}

/**
 * Tabla: marco, filas y columnas iguales y, si se pide, una fila de títulos sombreada arriba
 * (`headers` son los títulos de las columnas, de izquierda a derecha; los que faltan quedan vacíos).
 */
export function tableGrid(ctx: LayoutContext, r: Rect, o: { rows: number; cols: number; header: boolean; headers: readonly string[] }): Prim[] {
  const total = o.rows + (o.header ? 1 : 0);
  const rowH = r.h / total;
  const colW = r.w / o.cols;
  const grid = ctx.stroke('grid', 'ink', { use: 'table' });
  const out: Prim[] = [];
  if (o.header) out.push(rect({ x: r.x, y: r.y, w: r.w, h: rowH }, { fill: ctx.fill('weekend') }));
  for (let i = 1; i < total; i++) out.push(line(r.x, r.y + i * rowH, r.x + r.w, r.y + i * rowH, grid));
  for (let j = 1; j < o.cols; j++) out.push(line(r.x + j * colW, r.y, r.x + j * colW, r.y + r.h, grid));
  out.push(rect(r, { stroke: ctx.stroke('rule', 'ink', { use: 'table' }) }));
  if (o.header) {
    for (let j = 0; j < o.cols; j++) {
      const text = o.headers[j];
      if (text) out.push(...ctx.textIn(text, { x: r.x + j * colW + 0.8, y: r.y, w: colW - 1.6, h: rowH }, { role: 'labelStrong', size: 'labelSmall', upper: true, tracking: true, align: 'center', valign: 'middle', fit: true, wrap: false }).prims);
    }
  }
  return out;
}

/**
 * Seguimiento de hábitos: una fila por hábito (con su nombre a la izquierda) y una columna por día,
 * con los números de los días arriba.
 */
export function habitGrid(ctx: LayoutContext, r: Rect, o: { rows: number; days: number; names: readonly string[] }): Prim[] {
  const headH = Math.min(6, r.h / (o.rows + 1));
  const nameW = Math.min(34, r.w * 0.3);
  const dayW = (r.w - nameW) / o.days;
  const rowH = (r.h - headH) / o.rows;
  const grid = ctx.stroke('grid', 'ink', { use: 'table' });
  const out: Prim[] = [];
  for (let d = 0; d < o.days; d++) {
    out.push(...ctx.textIn(String(d + 1), { x: r.x + nameW + d * dayW, y: r.y, w: dayW, h: headH }, { role: 'labelStrong', size: Math.min(ctx.theme.sizes.labelSmall, dayW * 1.5), align: 'center', valign: 'middle', features: TABULAR_FEATURES }).prims);
  }
  for (let i = 0; i <= o.rows; i++) out.push(line(r.x, r.y + headH + i * rowH, r.x + r.w, r.y + headH + i * rowH, grid));
  for (let d = 0; d <= o.days; d++) out.push(line(r.x + nameW + d * dayW, r.y, r.x + nameW + d * dayW, r.y + r.h, grid));
  out.push(line(r.x, r.y, r.x, r.y + r.h, grid), line(r.x, r.y, r.x + r.w, r.y, grid));
  for (let i = 0; i < o.rows; i++) {
    const name = o.names[i];
    if (name) out.push(...ctx.textIn(name, { x: r.x + 0.8, y: r.y + headH + i * rowH, w: nameW - 1.6, h: rowH }, { role: 'body', size: ctx.theme.sizes.small, valign: 'middle', fit: true, wrap: false }).prims);
  }
  return out;
}

/** Figuras de una valoración (estrellas, círculos, corazones o cuadrados vacíos). */
export const RATING_SHAPES = ['star', 'circle', 'heart', 'square'] as const;
export type RatingShape = (typeof RATING_SHAPES)[number];

export function ratingShape(ctx: LayoutContext, shape: RatingShape, cx: number, cy: number, size: number): Prim {
  const stroke = ctx.stroke('rule', 'ink', { width: ptToMm(0.6) });
  const h = size / 2;
  switch (shape) {
    case 'circle':
      return circle(cx, cy, h, { stroke });
    case 'square':
      return rect({ x: cx - h, y: cy - h, w: size, h: size }, { stroke });
    case 'heart':
      return { t: 'path', d: heartPath(cx, cy, size), stroke };
    case 'star': {
      // Cinco puntas: los vértices externos e internos se alternan cada 36°.
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? h : h * 0.42;
        return `${(cx + Math.cos(a) * rad).toFixed(3)} ${(cy + Math.sin(a) * rad).toFixed(3)}`;
      });
      return { t: 'path', d: `M ${pts.join(' L ')} Z`, stroke };
    }
  }
}

/** Hemisferio sur según el país (para orientar los íconos lunares). */
export function isSouthern(country: string | null, setting: 'auto' | 'north' | 'south' = 'auto'): boolean {
  if (setting !== 'auto') return setting === 'south';
  const south = new Set(['AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'BR', 'ZA', 'AU', 'NZ', 'NA', 'BW', 'MZ', 'MG', 'ZW', 'ZM', 'AO', 'LS', 'SZ', 'MW', 'FJ', 'PG']);
  return country ? south.has(country) : false;
}
