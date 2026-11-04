/**
 * Enlaces y marcadores del PDF de páginas (para leer la agenda en una tableta o un lector de tinta
 * electrónica): cada día lleva a su página, cada mes a su mes, los títulos un nivel arriba y el
 * índice a sus páginas. Las secciones marcan zonas con destinos con sentido (un día, un mes, una
 * clave de página); acá se traducen a números de página según la agenda que haya.
 */
import { dateOrder, formatDayMonth, monthNames, weekdayNames } from '../calendar/locale';
import type { BlockLink, Design } from '../design/schema';
import { fmt } from '../i18n';
import type { DocContext } from '../layout/context';
import type { Block, LinkCategory, LinkTarget, PageModel } from '../layout/prims';
import { TOC_TITLES } from '../sections/front';
import type { PagePlan } from '../sections/types';
import { transformRect, type Rect } from '../util/geometry';

export type LinkSettings = Design['links'];

export interface ResolvedLink {
  /** Zona tocable en mm de página, con la transformación del bloque y recortada a la página. */
  rect: Rect;
  /** Página de destino (0 = la primera) o dirección web. */
  page?: number;
  url?: string;
  blockId: string;
  /** Familia automática, o `manual` si se eligió a mano en el elemento. */
  cat: LinkCategory | 'manual';
  target: LinkTarget;
}

/** Enlace a mano que no lleva a ningún lado (la página elegida ya no existe o la dirección no es válida). */
export interface BrokenLink {
  blockId: string;
  mode: 'page' | 'url';
  target: string;
}

const monthKey = (y: number, m: number): string => `${y}-${String(m).padStart(2, '0')}`;

/** Solo direcciones web, de correo o de teléfono: nada que el lector pueda ejecutar. */
export function safeUrl(href: string): string | null {
  const v = href.trim();
  if (!v || v.length > 2000) return null;
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d][\d\s().-]*)$/i.test(v) ? v : null;
}

/** El enlace a mano de un elemento: el de la página manda sobre el de su tipo. */
export function findBlockLink(list: readonly BlockLink[], page: { key: string; type: string }, blockId: string): BlockLink | undefined {
  return (
    list.find((l) => l.blockId === blockId && l.pageType === page.type && l.pageKey === page.key) ??
    list.find((l) => l.blockId === blockId && l.pageType === page.type && l.pageKey === null)
  );
}

export function categoryOn(s: LinkSettings, cat: LinkCategory): boolean {
  switch (cat) {
    case 'days':
      return s.days;
    case 'months':
      return s.months;
    case 'up':
      return s.up;
    case 'toc':
      return s.toc;
    case 'pageNumber':
      return s.pageNumber !== 'none';
  }
}

/** Traduce destinos con sentido a páginas de esta agenda. */
export class LinkResolver {
  private readonly byKey = new Map<string, number>();
  private readonly daily = new Map<string, number>();
  private readonly week = new Map<string, number>();
  private readonly first = new Map<string, number>();
  private readonly log = new Map<string, number>();
  private readonly grid = new Map<string, number>();
  private readonly gridDay = new Map<string, number>();
  private readonly years: Array<{ y: number; months: number[]; index: number }> = [];
  private toc: number | undefined;

  constructor(
    pages: readonly PagePlan[],
    private readonly settings: Pick<LinkSettings, 'dayTarget' | 'monthTarget'>,
  ) {
    const once = (map: Map<string, number>, k: string, v: number): void => {
      if (!map.has(k)) map.set(k, v);
    };
    for (const p of pages) {
      once(this.byKey, p.key, p.index);
      if (p.type === 'filler') continue;
      const g = /^month:(\d{4}-\d{2})$/.exec(p.group);
      if (g) once(this.first, g[1]!, p.index);
      const month = p.params?.month as { y: number; m: number } | undefined;
      const days = Array.isArray(p.params?.days) ? (p.params.days as unknown[]).filter((d): d is string => typeof d === 'string') : [];
      if (p.type === 'daily') for (const iso of days) once(this.daily, iso, p.index);
      if (p.type === 'weekLeft' || p.type === 'weekRight') for (const iso of days) once(this.week, iso, p.index);
      if (p.type === 'monthLog' && month) once(this.log, monthKey(month.y, month.m), p.index);
      if (p.type === 'monthGrid' && month) once(this.grid, monthKey(month.y, month.m), p.index);
      // En la vista mensual en dos páginas, cada día está en una de las dos.
      if (p.type === 'monthGrid') for (const iso of days) once(this.gridDay, iso, p.index);
      if (p.type === 'yearOverview') {
        const y = Number(p.params?.year);
        const perPage = Number(p.params?.perPage) === 12 ? 12 : 6;
        const part = Number(p.params?.part ?? 0);
        const months = perPage === 12 ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 6 }, (_, i) => part * 6 + i + 1);
        if (Number.isFinite(y)) this.years.push({ y, months, index: p.index });
      }
      if (p.type === 'toc' && this.toc === undefined) this.toc = p.index;
    }
  }

  /** Página de destino (o dirección web); `null` si en esta agenda no hay adónde ir. */
  resolve(t: LinkTarget): number | string | null {
    switch (t.kind) {
      case 'url':
        return safeUrl(t.href);
      case 'page':
        return this.byKey.get(t.key) ?? null;
      case 'toc':
        // Sin índice, el calendario anual hace de página de inicio.
        return this.toc ?? this.years[0]?.index ?? null;
      case 'year': {
        const hit = this.years.find((e) => e.y === t.y && (t.m === undefined || e.months.includes(t.m))) ?? this.years.find((e) => e.y === t.y) ?? this.years[0];
        return hit?.index ?? null;
      }
      case 'month': {
        const k = monthKey(t.y, t.m);
        const first = this.first.get(k);
        if (this.settings.monthTarget === 'log') return this.log.get(k) ?? first ?? null;
        if (this.settings.monthTarget === 'grid') return this.grid.get(k) ?? first ?? null;
        return first ?? null;
      }
      case 'date': {
        const [y, m] = t.iso.split('-').map(Number);
        const k = monthKey(y!, m!);
        const d = this.daily.get(t.iso);
        const w = this.week.get(t.iso);
        const l = this.log.get(k);
        const g = this.gridDay.get(t.iso) ?? this.grid.get(k);
        const f = this.first.get(k);
        // La primera página del mes es el último recurso: sin registro ni vista mensual, mejor la página del día.
        const order = this.settings.dayTarget === 'week' ? [w, d, l, g, f] : this.settings.dayTarget === 'month' ? [l, g, d, w, f] : [d, w, l, g, f];
        return order.find((v) => v !== undefined) ?? null;
      }
    }
  }
}

function clip(r: Rect, box: Rect): Rect | null {
  const x0 = Math.max(r.x, box.x);
  const y0 = Math.max(r.y, box.y);
  const x1 = Math.min(r.x + r.w, box.x + box.w);
  const y1 = Math.min(r.y + r.h, box.y + box.h);
  return x1 - x0 > 0.3 && y1 - y0 > 0.3 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Enlaces de una página ya maquetada, listos para el PDF y para mostrarlos en el editor. */
export function pageLinks(page: PageModel, resolver: LinkResolver, settings: LinkSettings): { links: ResolvedLink[]; broken: BrokenLink[] } {
  const links: ResolvedLink[] = [];
  const broken: BrokenLink[] = [];
  if (!settings.enabled) return { links, broken };
  const box = { x: 0, y: 0, w: page.w, h: page.h };
  const seen = new Set<string>();
  const push = (b: Block, area: Rect, target: LinkTarget, cat: ResolvedLink['cat']): boolean => {
    const r = resolver.resolve(target);
    if (r === null) return false;
    // Un enlace a la misma página no lleva a ningún lado: no se agrega (pero tampoco está roto).
    if (r === page.index) return true;
    const rect = clip(b.m ? transformRect(b.m, area) : area, box);
    if (!rect) return true;
    const id = `${rect.x.toFixed(2)},${rect.y.toFixed(2)},${rect.w.toFixed(2)},${rect.h.toFixed(2)}>${r}`;
    if (seen.has(id)) return true;
    seen.add(id);
    links.push({ rect, ...(typeof r === 'number' ? { page: r } : { url: r }), blockId: b.id, cat, target });
    return true;
  };
  for (const b of page.blocks) {
    const manual = findBlockLink(settings.blocks, page, b.id);
    if (manual && manual.mode !== 'auto') {
      if (manual.mode === 'none') continue;
      const target: LinkTarget = manual.mode === 'url' ? { kind: 'url', href: manual.url } : { kind: 'page', key: manual.page };
      if (!push(b, b.bbox, target, 'manual')) broken.push({ blockId: b.id, mode: manual.mode, target: manual.mode === 'url' ? manual.url : manual.page });
      continue;
    }
    for (const l of b.links ?? []) if (categoryOn(settings, l.cat)) push(b, l, l.to, l.cat);
  }
  return { links, broken };
}

/* ---------- Títulos de las páginas en el idioma de la agenda ---------- */

const cap = (s: string, locale: string): string => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);
const sentence = (s: string, locale: string): string => cap(s.toLocaleLowerCase(locale), locale);

/** «Marzo 2027». */
export function monthLabel(doc: DocContext, y: number, m: number): string {
  return `${monthNames(doc.locale)[m - 1] ?? ''} ${y}`;
}

/** «Miércoles 31 de marzo» (con su mes: una página del día puede caer en la sección del mes siguiente). */
function dayLabel(doc: DocContext, iso: string, withMonth = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
  if (withMonth) {
    return cap(formatDayMonth(doc.locale, iso, dateOrder(doc.locale, doc.design.calendar.dateFormat), { weekday: true }), doc.locale);
  }
  const dow = ((date.getUTCDay() + 6) % 7) + 1;
  return `${cap(weekdayNames(doc.locale, 'long')[dow - 1] ?? '', doc.locale)} ${d}`;
}

function weekLabel(doc: DocContext, p: PagePlan): string {
  const week = doc.cal.weeks.find((w) => w.key === p.params?.week);
  if (doc.cal.options.numbering !== 'none' && typeof p.params?.weekNumber === 'number') return sentence(fmt(doc.strings.week.label, { n: p.params.weekNumber }), doc.locale);
  if (!week) return p.title;
  const a = week.days[0]!;
  const b = week.days[week.days.length - 1]!;
  const short = monthNames(doc.locale, 'short');
  return a.m === b.m ? `${a.d}–${b.d} ${short[b.m - 1]}` : `${a.d} ${short[a.m - 1]} – ${b.d} ${short[b.m - 1]}`;
}

/** Título breve de una página (dentro de su mes, si es una página del mes). Vacío: no lleva marcador. */
export function pageShortTitle(doc: DocContext, p: PagePlan): string {
  const s = doc.strings;
  const c = { s, doc: { locale: doc.locale } };
  switch (p.type) {
    case 'filler':
      return '';
    case 'titlePage':
      return s.outline.cover;
    case 'dedication':
      return s.outline.dedication;
    case 'toc':
      return s.toc.title;
    case 'yearOverview':
      return `${TOC_TITLES.yearOverview!(c)} ${String(p.params?.year ?? '')}`.trim();
    case 'monthCover': {
      const month = p.params?.month as { y: number; m: number } | undefined;
      return month ? monthLabel(doc, month.y, month.m) : p.title;
    }
    case 'monthLog':
      return s.outline.monthLog;
    case 'monthGrid':
      return s.monthGrid.title;
    case 'weekLeft':
    case 'weekRight':
      return weekLabel(doc, p);
    case 'daily': {
      const days = Array.isArray(p.params?.days) ? (p.params.days as string[]) : [];
      return days.map((iso) => dayLabel(doc, iso)).join(' – ') || p.title;
    }
    case 'habits':
      return s.habits.title;
    case 'balance':
      return s.balance.title;
    case 'review':
      return s.review.title;
    case 'custom':
      return p.title;
    default:
      return TOC_TITLES[p.type]?.(c) ?? p.title;
  }
}

/** Título con su mes (para describir el destino de un enlace). */
export function pageFullTitle(doc: DocContext, p: PagePlan): string {
  const short = pageShortTitle(doc, p);
  const month = p.params?.month as { y: number; m: number } | undefined;
  // Las páginas del día ya dicen su fecha completa (pueden caer en la sección de otro mes).
  if (!month || p.type === 'monthCover' || p.type === 'daily') return short;
  const ml = monthLabel(doc, month.y, month.m);
  return short ? `${short} · ${ml}` : ml;
}

/* ---------- Marcadores del lector ---------- */

export interface OutlineItem {
  title: string;
  page: number;
  children: OutlineItem[];
}

/**
 * Índice lateral del lector: las secciones del principio y del final, y cada mes con sus páginas
 * (registro, vista mensual, cada semana o día, hábitos, balance, resumen…).
 */
export function buildOutline(doc: DocContext, pages: readonly PagePlan[]): OutlineItem[] {
  const out: OutlineItem[] = [];
  const months = new Map<string, OutlineItem>();
  const seen = new Set<string>();
  for (const p of pages) {
    if (p.type === 'filler') continue;
    const g = /^month:(\d{4})-(\d{2})$/.exec(p.group);
    if (g) {
      let node = months.get(p.group);
      if (!node) {
        node = { title: monthLabel(doc, Number(g[1]), Number(g[2])), page: p.index, children: [] };
        months.set(p.group, node);
        out.push(node);
      }
      // La portada es el mes mismo y cada semana se marca en su página izquierda.
      if (p.type === 'monthCover' || p.type === 'weekRight') continue;
      const each = p.type === 'weekLeft' || p.type === 'daily' || p.type === 'custom';
      const k = `${p.group}|${p.type}`;
      if (!each && seen.has(k)) continue;
      seen.add(k);
      const title = pageShortTitle(doc, p);
      if (title) node.children.push({ title, page: p.index, children: [] });
      continue;
    }
    const k = p.type === 'yearOverview' ? `year:${String(p.params?.year)}` : p.type === 'custom' ? p.key : p.type;
    if (seen.has(k)) continue;
    seen.add(k);
    const title = pageShortTitle(doc, p);
    if (title) out.push({ title, page: p.index, children: [] });
  }
  return out;
}
