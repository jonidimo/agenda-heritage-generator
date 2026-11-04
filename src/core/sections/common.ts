import type { MonthInfo } from '../calendar';
import { weekOrder } from '../calendar';
import { monthNames } from '../calendar/locale';
import { takeTop } from '../layout/box';
import type { LayoutContext } from '../layout/context';
import type { Prim } from '../layout/prims';
import { line } from '../layout/prims';
import { checkCircle, pageHeader, ruledLines } from '../layout/widgets';
import type { Rect } from '../util/geometry';

/** Encabezado estándar y caja restante debajo. */
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

/** Lista con viñetas circulares sobre renglones. */
export function checklist(ctx: LayoutContext, r: Rect, pitch: number, opts: { circles?: boolean; max?: number } = {}): Prim[] {
  const out: Prim[] = [];
  const n = Math.min(opts.max ?? Infinity, Math.floor((r.h + 1e-6) / pitch));
  for (let i = 1; i <= n; i++) {
    const y = r.y + i * pitch;
    if (opts.circles !== false) out.push(checkCircle(ctx, r.x + 1.6, y - 1.9, 1.5));
    out.push(line(r.x + (opts.circles !== false ? 4.5 : 0), y, r.x + r.w, y, ctx.stroke('hair')));
  }
  return out;
}

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
  return [t.prim, line(lx, y + 0.6, x + w, y + 0.6, ctx.stroke('hair'))];
}
