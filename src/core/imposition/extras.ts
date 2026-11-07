/**
 * Hojas auxiliares: calibración de impresión (escala 100 %, volteo del
 * dúplex, registro frente/dorso, zona no imprimible, muestras de línea, punto y
 * gris), plantilla de perforado para coser los cuadernillos y tapa.
 */
import type { AgendaStrings } from '../i18n';
import { fmt } from '../i18n';
import type { DocContext } from '../layout/context';
import { circle, line, rect, type Prim } from '../layout/prims';
import { assetPrims } from '../document/assets';
import type { PageFormat } from '../document/context';
import type { FontFace } from '../text/fonts';
import { shapeText, type ShapedRun } from '../text/shape';
import { compose, ptToMm, rotateAround, translate, type Matrix, type Rect } from '../util/geometry';
import { backRotates } from './impose';
import type { SheetRender } from './compose';
import type { SignaturePlan } from './signatures';

interface TextKit {
  run(text: string, size: number, bold?: boolean): ShapedRun;
}

function kit(sans: FontFace, bold: FontFace): TextKit {
  return { run: (t, size, b) => shapeText(b ? bold : sans, t, size, { tracking: 0.02 }) };
}

const txt = (k: TextKit, s: string, x: number, y: number, size: number, opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; color?: string } = {}): Prim => {
  const run = k.run(s, size, opts.bold);
  const x0 = opts.align === 'center' ? x - run.width / 2 : opts.align === 'right' ? x - run.width : x;
  return { t: 'text', run, x: x0, y, color: opts.color ?? '#000000' };
};

function wrapLines(k: TextKit, text: string, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line0 = '';
  for (const w of words) {
    const cand = line0 ? `${line0} ${w}` : w;
    if (k.run(cand, size).width > maxW && line0) {
      out.push(line0);
      line0 = w;
    } else line0 = cand;
  }
  if (line0) out.push(line0);
  return out;
}

function arrowUp(cx: number, cy: number, size: number): Prim {
  const s = size / 2;
  return { t: 'path', d: `M ${cx} ${cy - s} L ${cx + s * 0.7} ${cy} L ${cx + s * 0.25} ${cy} L ${cx + s * 0.25} ${cy + s} L ${cx - s * 0.25} ${cy + s} L ${cx - s * 0.25} ${cy} L ${cx - s * 0.7} ${cy} Z`, fill: { color: '#000000' } };
}

function crossMark(cx: number, cy: number, r: number): Prim[] {
  const s = { color: '#000000', width: ptToMm(0.35) };
  return [line(cx - r, cy, cx + r, cy, s), line(cx, cy - r, cx, cy + r, s), circle(cx, cy, r * 0.55, { stroke: s })];
}

/** Hoja de calibración (frente y dorso) para verificar escala, volteo y registro antes de imprimir la agenda. */
export function calibrationSheet(doc: DocContext, fmt0: PageFormat, s: AgendaStrings): SheetRender[] {
  const sans = doc.fonts.resolveWithFallback({ family: 'Manrope', weight: 400, style: 'normal' }, doc.theme.fallbacks);
  const bold = doc.fonts.resolveWithFallback({ family: 'Manrope', weight: 800, style: 'normal' }, doc.theme.fallbacks);
  const k = kit(sans, bold);
  const W = fmt0.sheetW;
  const H = fmt0.sheetH;
  const np = doc.binding.nonPrintable;
  const sides: SheetRender[] = [];
  const crosses: Array<[number, number]> = [
    [W * 0.25, H * 0.2],
    [W * 0.75, H * 0.2],
    [W * 0.25, H * 0.8],
    [W * 0.75, H * 0.8],
  ];
  for (const side of ['front', 'back'] as const) {
    const p: Prim[] = [];
    // Marco de zona no imprimible y separación de páginas.
    p.push(rect({ x: np, y: np, w: W - 2 * np, h: H - 2 * np }, { stroke: { color: '#000000', width: ptToMm(0.3), dash: [1, 1] } }));
    p.push(txt(k, fmt(s.calibration.nonPrintable, { n: np }), np + 1.5, np + 3.5, 5.5));
    const cells: Rect[] = fmt0.nUp === 2 ? [{ x: 0, y: 0, w: W / 2, h: H }, { x: W / 2, y: 0, w: W / 2, h: H }] : [{ x: 0, y: 0, w: W, h: H }];
    if (fmt0.nUp === 2) p.push(line(W / 2, np, W / 2, H - np, { color: '#000000', width: ptToMm(0.3), dash: [2, 1.5] }));
    const pagesFront = fmt0.nUp === 2 ? [4, 1] : [1];
    const pagesBack = fmt0.nUp === 2 ? [2, 3] : [2];
    const nums = side === 'front' ? pagesFront : pagesBack;
    cells.forEach((cell, i) => {
      const cx = cell.x + cell.w / 2;
      p.push(txt(k, fmt(s.calibration.page, { n: nums[i]! }), cx, cell.y + cell.h * 0.42, 34, { bold: true, align: 'center' }));
      p.push(arrowUp(cx, cell.y + cell.h * 0.2, 10));
      p.push(txt(k, s.calibration.up, cx, cell.y + cell.h * 0.2 + 9, 7, { bold: true, align: 'center' }));
      p.push(txt(k, side === 'front' ? s.calibration.front : s.calibration.back, cx, cell.y + cell.h * 0.5, 10, { align: 'center' }));
    });
    for (const [x, y] of crosses) p.push(...crossMark(x, y, 3));
    if (side === 'front') {
      p.push(txt(k, s.calibration.title, W / 2, np + 8, 9, { bold: true, align: 'center' }));
      // Regla de 100 mm.
      const rx = (fmt0.nUp === 2 ? W / 2 : 0) + 10;
      const ry = H * 0.6;
      p.push(line(rx, ry, rx + 100, ry, { color: '#000000', width: ptToMm(0.5) }));
      for (let mm = 0; mm <= 100; mm += 5) p.push(line(rx + mm, ry, rx + mm, ry - (mm % 10 === 0 ? 3 : 1.5), { color: '#000000', width: ptToMm(0.3) }));
      p.push(txt(k, '0', rx, ry + 3, 5.5, { align: 'center' }), txt(k, '50', rx + 50, ry + 3, 5.5, { align: 'center' }), txt(k, '100 mm', rx + 100, ry + 3, 5.5, { align: 'center' }));
      p.push(txt(k, s.calibration.ruler, rx, ry + 7, 6));
      p.push(txt(k, s.calibration.printAt100, rx, ry + 11, 6, { bold: true }));
      // Muestras de línea, puntos y grises (para elegir el tema según la impresora).
      const sx = (fmt0.nUp === 2 ? 0 : 0) + 12;
      let sy = H * 0.58;
      p.push(txt(k, s.calibration.lines, sx, sy, 6, { bold: true }));
      sy += 3;
      for (const w of [0.1, 0.2, 0.3, 0.5, 0.75]) {
        for (const color of ['#000000', '#666666', '#999999']) {
          const xx = sx + (['#000000', '#666666', '#999999'].indexOf(color) * 36);
          p.push(line(xx, sy, xx + 30, sy, { color, width: ptToMm(w) }));
        }
        p.push(txt(k, `${w} pt`, sx + 110, sy + 1, 5));
        sy += 3.2;
      }
      sy += 3;
      p.push(txt(k, s.calibration.dots, sx, sy, 6, { bold: true }));
      sy += 3;
      [0.35, 0.5, 0.7].forEach((r, i) => {
        const pts: number[] = [];
        for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) pts.push(sx + i * 36 + a * 5, sy + b * 5);
        p.push({ t: 'dots', pts, r: ptToMm(r), color: '#303030' });
        p.push(txt(k, `r ${r} pt`, sx + i * 36, sy + 13, 5));
      });
      sy += 18;
      p.push(txt(k, s.calibration.grays, sx, sy, 6, { bold: true }));
      sy += 2;
      ['#f2f2f2', '#e0e0e0', '#cccccc', '#999999', '#666666'].forEach((g, i) => {
        p.push(rect({ x: sx + i * 12, y: sy, w: 10, h: 7 }, { fill: { color: g } }));
        p.push(txt(k, g, sx + i * 12, sy + 10, 4.5));
      });
    } else {
      const lines = wrapLines(k, `${s.calibration.crosses} ${s.calibration.expected}`, 6.5, (fmt0.nUp === 2 ? W / 2 : W) - 30);
      lines.forEach((l, i) => p.push(txt(k, l, 15, H * 0.62 + i * 3.2, 6.5)));
    }
    if (side === 'back') {
      let m: Matrix = translate(0, 0);
      if (backRotates(doc.binding, fmt0.nUp)) m = compose(m, rotateAround(180, W / 2, H / 2));
      const off = doc.binding.backOffset;
      if (off.x !== 0 || off.y !== 0) m = compose(translate(off.x, off.y), m);
      sides.push({ w: W, h: H, prims: [{ t: 'group', m, children: p }] });
    } else sides.push({ w: W, h: H, prims: p });
  }
  return sides;
}

/** Plantilla de perforado para coser: estaciones de cadeneta en los extremos y pares (punto francés). */
export function sewingTemplate(doc: DocContext, fmt0: PageFormat, s: AgendaStrings): SheetRender {
  const sans = doc.fonts.resolveWithFallback({ family: 'Manrope', weight: 400, style: 'normal' }, doc.theme.fallbacks);
  const bold = doc.fonts.resolveWithFallback({ family: 'Manrope', weight: 800, style: 'normal' }, doc.theme.fallbacks);
  const k = kit(sans, bold);
  const sw = doc.binding.sewing;
  const pageH = doc.pageH;
  // Hoja vertical del papel elegido.
  const W = Math.min(fmt0.sheetW, fmt0.sheetH);
  const H = Math.max(fmt0.sheetW, fmt0.sheetH);
  const p: Prim[] = [];
  const x = W / 2;
  const y0 = (H - pageH) / 2;
  p.push(txt(k, s.sewing.title, W / 2, Math.max(doc.binding.nonPrintable + 6, y0 - 12), 10, { bold: true, align: 'center' }));
  p.push(line(x, y0, x, y0 + pageH, { color: '#000000', width: ptToMm(0.4), dash: [2, 1.5] }));
  p.push(line(x - 6, y0, x + 6, y0, { color: '#000000', width: ptToMm(0.4) }), line(x - 6, y0 + pageH, x + 6, y0 + pageH, { color: '#000000', width: ptToMm(0.4) }));
  // Estaciones.
  const stations: number[] = [sw.endInset, pageH - sw.endInset];
  const inner = Math.max(0, sw.stations - 2);
  if (sw.pairs && inner >= 2) {
    const pairs = Math.floor(inner / 2);
    const span = pageH - 2 * sw.endInset;
    for (let i = 1; i <= pairs; i++) {
      const c = sw.endInset + (span * i) / (pairs + 1);
      stations.push(c - sw.pairGap / 2, c + sw.pairGap / 2);
    }
  } else {
    const span = pageH - 2 * sw.endInset;
    for (let i = 1; i <= inner; i++) stations.push(sw.endInset + (span * i) / (inner + 1));
  }
  stations.sort((a, b) => a - b);
  stations.forEach((st, i) => {
    const y = y0 + st;
    p.push(circle(x, y, 0.8, { fill: { color: '#000000' } }));
    p.push(line(x - 4, y, x + 4, y, { color: '#000000', width: ptToMm(0.3) }));
    p.push(txt(k, `${st.toFixed(1)} mm`, x + 6, y + 1, 6));
    p.push(txt(k, String(i + 1), x - 6, y + 1, 6, { align: 'right', bold: true }));
  });
  const info = [fmt(s.sewing.stations, { n: stations.length }), s.sewing.kettle, s.sewing.instructions];
  info.forEach((l, i) => {
    const lines = wrapLines(k, l, 7, W - 30);
    lines.forEach((ll, j) => p.push(txt(k, ll, 15, Math.min(H - doc.binding.nonPrintable - 20, y0 + pageH + 10) + i * 8 + j * 3.4, 7)));
  });
  return { w: W, h: H, prims: p };
}

/** Tapa: tamaño y guías según el estilo (cartón con margen de doblez, o tapa blanda envolvente). */
export function coverSheet(doc: DocContext, plan: SignaturePlan): SheetRender {
  const c = doc.design.cover;
  const pw = doc.pageW;
  const ph = doc.pageH;
  const caliper = doc.binding.creep.caliper;
  const leavesPerSheet = doc.binding.method === 'single' || doc.binding.method === 'cut-stack' ? 1 : 2;
  const spine = c.spine === 'auto' ? Math.max(3, plan.totalSheets * leavesPerSheet * caliper + 2) : c.spine;
  const p: Prim[] = [];
  const guide = { color: '#888888', width: ptToMm(0.3), dash: [1.5, 1] };
  const sans = doc.fonts.resolveWithFallback(doc.theme.fonts.label, doc.theme.fallbacks);
  const title = doc.fonts.resolveWithFallback(doc.theme.fonts.title, doc.theme.fallbacks);
  const display = doc.fonts.resolveWithFallback(doc.theme.fonts.display, doc.theme.fallbacks);
  const info = c.imageAssetId ? doc.assets.get(c.imageAssetId) : undefined;
  const addTexts = (area: Rect): void => {
    const cx = area.x + area.w / 2;
    let y = area.y + area.h * 0.45;
    if (c.showYear) {
      const r = shapeText(display, String(doc.design.calendar.year), doc.theme.sizes.hero * 0.75, { fallback: doc.fonts.glyphFallback(display, doc.theme.fallbacks) });
      p.push({ t: 'text', run: r, x: cx - r.width / 2, y, color: '#000000' });
      y += 14;
    }
    if (c.showName && doc.design.persona.name) {
      const r = shapeText(title, doc.design.persona.name, doc.theme.sizes.title, { fallback: doc.fonts.glyphFallback(title, doc.theme.fallbacks) });
      p.push({ t: 'text', run: r, x: cx - r.width / 2, y, color: '#000000' });
      y += 10;
    }
    if (c.showTitle) {
      const r = shapeText(sans, (doc.design.persona.title || doc.strings.titlePage.title).toLocaleUpperCase(doc.locale), doc.theme.sizes.label + 1, { tracking: 0.15, fallback: doc.fonts.glyphFallback(sans, doc.theme.fallbacks) });
      p.push({ t: 'text', run: r, x: cx - r.width / 2, y, color: '#000000' });
    }
  };
  if (c.style === 'wrap') {
    const b = c.bleed;
    const W = 2 * pw + spine + 2 * b;
    const H = ph + 2 * b;
    const front: Rect = { x: b + pw + spine, y: b, w: pw, h: ph };
    if (info) p.push(...assetPrims(info, { x: 0, y: 0, w: W, h: H }, { fit: 'cover', clip: true }));
    p.push(line(b + pw, 0, b + pw, H, guide), line(b + pw + spine, 0, b + pw + spine, H, guide));
    p.push(rect({ x: b, y: b, w: W - 2 * b, h: H - 2 * b }, { stroke: guide }));
    addTexts(front);
    return { w: W, h: H, prims: p };
  }
  const ov = c.boardOverhang;
  const boardW = pw + ov;
  const boardH = ph + 2 * ov;
  const turn = c.style === 'board' ? c.turnIn : 0;
  const W = boardW + 2 * turn;
  const H = boardH + 2 * turn;
  const board: Rect = { x: turn, y: turn, w: boardW, h: boardH };
  if (info) p.push(...assetPrims(info, { x: 0, y: 0, w: W, h: H }, { fit: 'cover', clip: true }));
  if (turn > 0) p.push(rect(board, { stroke: guide }));
  addTexts(board);
  return { w: W, h: H, prims: p };
}
