/**
 * Compone una cara de hoja: ubica cada página en su celda (con refile, creep y
 * recorte), gira o corre el dorso si hace falta y dibuja las marcas.
 */
import type { Design } from '../design/schema';
import type { PageFormat } from '../document/context';
import { pagePrims } from '../document/layout';
import { line, rect, type Prim } from '../layout/prims';
import type { ShapedRun } from '../text/shape';
import { compose, ptToMm, rotateAround, translate, type Matrix } from '../util/geometry';
import type { PageModel } from '../layout/prims';
import type { SheetSide } from './impose';

export interface ComposeOptions {
  fmt: PageFormat;
  binding: Design['binding'];
  /** Conformador para rótulos chicos (número de cuadernillo). */
  label?: (text: string) => ShapedRun;
  /** Dibujar el contorno de cada celda (vista previa). */
  guides?: boolean;
}

export interface SheetRender {
  w: number;
  h: number;
  prims: Prim[];
}

const MARK = { color: '#000000', width: ptToMm(0.25) };

export function composeSide(side: SheetSide, getPage: (index: number) => PageModel | null, opts: ComposeOptions): SheetRender {
  const { fmt, binding } = opts;
  const t = binding.trim;
  const np = binding.nonPrintable;
  const content: Prim[] = [];
  for (const slot of side.slots) {
    if (slot.page === null) continue;
    const page = getPage(slot.page);
    if (!page) continue;
    const recto = page.side === 'recto';
    const singleUp = fmt.nUp === 1;
    let x = slot.x + (recto ? 0 : t.outer);
    if (singleUp) x = slot.x + (recto ? 0 : t.outer);
    const y = slot.y + t.top;
    const creep = recto ? -slot.creep : slot.creep;
    const m: Matrix = translate(x + creep, y);
    content.push({ t: 'group', m, clip: { x: 0, y: 0, w: page.w, h: page.h }, children: pagePrims(page) });
    if (opts.guides) content.push(rect({ x: x + creep, y, w: page.w, h: page.h }, { stroke: { color: '#d33', width: 0.15, dash: [1, 1] } }));
  }

  const marks: Prim[] = [];
  const W = fmt.sheetW;
  const H = fmt.sheetH;
  if (fmt.nUp === 2) {
    const cx = fmt.cellW;
    const isFolded = binding.method === 'sewn' || binding.method === 'saddle';
    if ((isFolded && binding.marks.fold) || binding.method === 'cut-stack') {
      const len = 3;
      const s = binding.method === 'cut-stack' ? { ...MARK, dash: [0.8, 0.6] } : MARK;
      marks.push(line(cx, np + 0.3, cx, np + 0.3 + len, s), line(cx, H - np - 0.3 - len, cx, H - np - 0.3, s));
    }
    if (binding.method === 'sewn' && side.side === 'front' && side.sheetInSignature === 0) {
      if (binding.marks.collation) {
        const step = 5.5;
        const usable = H - 2 * (np + 6) - 5;
        const yy = np + 6 + ((side.signature * step) % Math.max(step, usable));
        marks.push({ t: 'rect', x: cx - 1, y: yy, w: 2, h: 5, fill: { color: '#000000' } });
      }
      if (binding.marks.signatureLabel && opts.label) {
        const run = opts.label(`${side.signature + 1}`);
        marks.push({ t: 'text', run, x: cx - run.width / 2, y: H - np - 1, color: '#000000' });
      }
    }
  }
  if (binding.marks.crop && (t.top > 0 || t.bottom > 0 || t.outer > 0)) {
    for (const slot of side.slots) {
      if (slot.page === null) continue;
      const page = getPage(slot.page);
      if (!page) continue;
      const recto = page.side === 'recto';
      const x0 = slot.x + (recto ? 0 : t.outer);
      const y0 = slot.y + t.top;
      const x1 = x0 + page.w;
      const y1 = y0 + page.h;
      const L = 3;
      const outerX = recto ? x1 : x0;
      const dir = recto ? 1 : -1;
      if (t.top > 0.5) marks.push(line(outerX, y0 - Math.min(L, t.top - 0.3), outerX, y0 - 0.3, MARK));
      if (t.bottom > 0.5) marks.push(line(outerX, y1 + 0.3, outerX, y1 + Math.min(L, t.bottom - 0.3), MARK));
      if (t.outer > 0.5) {
        marks.push(line(outerX + dir * 0.3, y0, outerX + dir * Math.min(L, t.outer - 0.3), y0, MARK));
        marks.push(line(outerX + dir * 0.3, y1, outerX + dir * Math.min(L, t.outer - 0.3), y1, MARK));
      }
    }
  }

  let m: Matrix = translate(0, 0);
  if (side.rotate180) m = compose(m, rotateAround(180, W / 2, H / 2));
  if (side.side === 'back' && (side.offset.x !== 0 || side.offset.y !== 0)) m = compose(translate(side.offset.x, side.offset.y), m);
  return { w: W, h: H, prims: [{ t: 'group', m, children: [...content, ...marks] }] };
}
