/**
 * Resumen de una agenda armada: tamaño, páginas, hojas y cuadernillos, enlaces y avisos agrupados.
 * Lo muestran la línea de comandos (`agenda info`, `agenda check`) y el servidor MCP.
 */
import { describeSignatures } from '../imposition/signatures';
import { PROSE_ROLES, punctuationOf } from '../text/punctuation';
import { fixFor } from './fixes';
import type { AgendaDocument } from './index';
import { buildOutline } from './links';

export interface SummaryWarning {
  code: string;
  message: string;
  /** Páginas donde aparece (desde 1); vacío si es de toda la agenda. */
  pages: number[];
  /** Cómo se corrige desde el JSON (ver `WARNING_FIXES`). */
  fix?: string;
}

/** La fuente de un tipo de texto del tema, tal como se dibuja. */
export interface FontRoleReport {
  role: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** De dónde sale: integrada, propia (subida o en `userFonts`), o no está cargada (se dibuja con `drawnWith`). */
  source: 'builtin' | 'user' | 'missing';
  /** La familia con la que se dibuja de verdad (otra, si la pedida no está). */
  drawnWith: string;
  /** En los tipos de texto con frases: la puntuación básica que le falta, y de qué fuente sale. */
  punctuation?: { missing: string[]; from: string | null };
}

export interface DocumentSummary {
  name: string;
  locale: string;
  country: string | null;
  year: number;
  startMonth: number;
  monthCount: number;
  pages: { total: number; content: number; parityFillers: number; signatureFillers: number };
  /** Página y hoja en mm; `perSide`: páginas por cara de hoja. */
  pageSize: { w: number; h: number };
  sheet: { w: number; h: number; perSide: number };
  sheets: number;
  signatures: string;
  links: { links: number; pagesWithLinks: number; bookmarks: number } | null;
  /** Las fuentes de cada tipo de texto, y cuántas propias trae el archivo. */
  fonts: { roles: FontRoleReport[]; embedded: number };
  warnings: SummaryWarning[];
}

/** Las fuentes de cada tipo de texto del tema: cuál se pidió, con cuál se dibuja y si le falta la puntuación. */
export function fontReport(doc: AgendaDocument): FontRoleReport[] {
  const { fonts, theme } = doc.ctx;
  return Object.entries(theme.fonts).map(([role, spec]) => {
    const face = fonts.resolve(spec);
    const drawn = face ?? fonts.resolveWithFallback(spec, theme.fallbacks);
    const report: FontRoleReport = { role, family: spec.family, weight: spec.weight, style: spec.style, source: face ? face.source : 'missing', drawnWith: drawn.family };
    if (PROSE_ROLES.has(role)) {
      const p = punctuationOf(fonts, drawn, theme.fallbacks);
      if (p.missing.length > 0) report.punctuation = p;
    }
    return report;
  });
}

const mm = (v: number): number => Math.round(v * 10) / 10;

/** Arma el resumen (maqueta todas las páginas, que quedan en la caché del documento). */
export function documentSummary(doc: AgendaDocument, extraErrors: readonly string[] = []): DocumentSummary {
  const d = doc.design;
  const p = doc.plan;
  let links: DocumentSummary['links'] = null;
  if (d.links.enabled || d.links.bookmarks) {
    let count = 0;
    let withLinks = 0;
    for (let i = 0; i < doc.pageCount; i++) {
      const n = doc.links(i).length;
      count += n;
      if (n > 0) withLinks++;
    }
    const bookmarks = d.links.bookmarks ? buildOutline(doc.ctx, p.pages).reduce((s, o) => s + 1 + o.children.length, 0) : 0;
    links = { links: count, pagesWithLinks: withLinks, bookmarks };
  }
  const withFix = (w: SummaryWarning): SummaryWarning => {
    const fix = fixFor(w.code);
    return fix ? { ...w, fix } : w;
  };
  const warnings: SummaryWarning[] = [
    ...extraErrors.map((message) => withFix({ code: 'resource', message, pages: [] })),
    ...doc.documentWarnings().map((w) => withFix({ code: w.code, message: w.message, pages: [] })),
  ];
  const grouped = new Map<string, SummaryWarning>();
  for (const w of doc.warnings()) {
    const hit = grouped.get(w.message);
    if (hit) hit.pages.push(w.page + 1);
    else grouped.set(w.message, withFix({ code: w.code, message: w.message, pages: [w.page + 1] }));
  }
  warnings.push(...grouped.values());
  return {
    name: d.name,
    locale: d.locale,
    country: d.holidays.country,
    year: d.calendar.year,
    startMonth: d.calendar.startMonth,
    monthCount: d.calendar.monthCount,
    pages: { total: p.pages.length, content: p.contentPages, parityFillers: p.parityFillers, signatureFillers: p.signatureFillers },
    pageSize: { w: mm(doc.format.w), h: mm(doc.format.h) },
    sheet: { w: mm(doc.format.sheetW), h: mm(doc.format.sheetH), perSide: doc.format.nUp },
    sheets: p.signatures.totalSheets,
    signatures: describeSignatures(p.signatures),
    links,
    fonts: { roles: fontReport(doc), embedded: d.userFonts?.length ?? 0 },
    warnings,
  };
}

/** El resumen en texto, como lo imprime la línea de comandos. */
export function formatSummary(s: DocumentSummary): string[] {
  const out = [
    `${s.name} — ${s.locale}, ${s.country ?? 'sin país'}, ${s.year}`,
    `Páginas: ${s.pages.total} (contenido ${s.pages.content}, relleno de paridad ${s.pages.parityFillers}, relleno de cuadernillo ${s.pages.signatureFillers})`,
    `Página: ${s.pageSize.w.toFixed(1)} × ${s.pageSize.h.toFixed(1)} mm · hoja ${s.sheet.w.toFixed(1)} × ${s.sheet.h.toFixed(1)} mm · ${s.sheet.perSide} por cara`,
    `Hojas de papel: ${s.sheets} · ${s.signatures}`,
  ];
  if (s.links) out.push(`Enlaces del PDF de páginas: ${s.links.links} en ${s.links.pagesWithLinks} páginas · marcadores: ${s.links.bookmarks}`);
  if (s.fonts.embedded > 0) out.push(`Fuentes propias en el archivo: ${s.fonts.embedded}`);
  // Solo lo que conviene saber: una fuente que no está, o una sin puntuación en un texto con frases.
  for (const f of s.fonts.roles) {
    if (f.source === 'missing') out.push(`  · Fuente de «${f.role}»: ${f.family} no está cargada; se usa ${f.drawnWith}.`);
    else if (f.punctuation) out.push(`  · Fuente de «${f.role}»: ${f.family} no tiene ${f.punctuation.missing.join(' ')}${f.punctuation.from ? ` (salen de ${f.punctuation.from})` : ''}.`);
  }
  out.push(`Avisos: ${s.warnings.length}`);
  for (const w of s.warnings) out.push(`  · ${w.message}${w.pages.length > 0 ? ` (págs. ${w.pages.slice(0, 12).join(', ')}${w.pages.length > 12 ? '…' : ''})` : ''}`);
  return out;
}
