/**
 * Dibujante PDF con pdfkit (texto con las mismas fuentes y el mismo
 * conformado que la vista previa, fuentes incrustadas como subconjuntos,
 * vectores reales) y post-proceso con pdf-lib para incrustar páginas de PDF
 * importados como objetos vectoriales sin pérdida de calidad.
 *
 * Funciona igual en Node (CLI), en el navegador y en un Web Worker.
 */
import PDFDocumentCtor from 'pdfkit';
import type { FontRegistry } from '../text/fonts';
import { compose, IDENTITY, matrixScale, PT_PER_MM, type Matrix } from '../util/geometry';
import type { Fill, Prim, Stroke } from '../layout/prims';

/** Subconjunto de la API de pdfkit que usamos (tipado local, sin depender de @types/node). */
interface PdfKitDoc {
  on(ev: 'data', cb: (chunk: Uint8Array) => void): void;
  on(ev: 'end', cb: () => void): void;
  addPage(opts: { size: [number, number]; margin: number }): PdfKitDoc;
  registerFont(name: string, src: ArrayBuffer | Uint8Array): PdfKitDoc;
  save(): PdfKitDoc;
  restore(): PdfKitDoc;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): PdfKitDoc;
  moveTo(x: number, y: number): PdfKitDoc;
  lineTo(x: number, y: number): PdfKitDoc;
  rect(x: number, y: number, w: number, h: number): PdfKitDoc;
  roundedRect(x: number, y: number, w: number, h: number, r: number): PdfKitDoc;
  circle(x: number, y: number, r: number): PdfKitDoc;
  path(d: string): PdfKitDoc;
  clip(rule?: string): PdfKitDoc;
  lineWidth(w: number): PdfKitDoc;
  lineCap(c: string): PdfKitDoc;
  lineJoin(j: string): PdfKitDoc;
  dash(len: number, opts: { space: number; phase?: number }): PdfKitDoc;
  undash(): PdfKitDoc;
  fillColor(c: string, opacity?: number): PdfKitDoc;
  strokeColor(c: string, opacity?: number): PdfKitDoc;
  opacity(o: number): PdfKitDoc;
  fill(rule?: string): PdfKitDoc;
  stroke(): PdfKitDoc;
  fillAndStroke(rule?: string): PdfKitDoc;
  font(name: string): PdfKitDoc;
  fontSize(size: number): PdfKitDoc;
  text(text: string, x: number, y: number, opts: Record<string, unknown>): PdfKitDoc;
  image(src: ArrayBuffer, x: number, y: number, opts: { width: number; height: number }): PdfKitDoc;
  ref(data: Record<string, unknown>): unknown;
  end(): void;
  _root: { data: Record<string, unknown> };
}

type PdfKitCtor = new (opts: Record<string, unknown>) => PdfKitDoc;

export interface PdfPageInput {
  /** Tamaño en mm. */
  w: number;
  h: number;
  prims: Prim[];
}

export interface PdfRenderOptions {
  fonts: FontRegistry;
  /** Bytes de un recurso (PNG/JPEG o PDF). */
  assetBytes: (assetId: string) => Uint8Array | undefined;
  info?: { title?: string; author?: string; subject?: string; keywords?: string };
  duplex?: 'Simplex' | 'DuplexFlipShortEdge' | 'DuplexFlipLongEdge';
  pickTrayByPdfSize?: boolean;
  onProgress?: (done: number, total: number) => void;
}

interface PdfArtPlacement {
  pageIndex: number;
  asset: string;
  page: number;
  matrix: Matrix;
  opacity: number;
  under: boolean;
}

const toArrayBuffer = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

class PdfPainter {
  private readonly fontAlias = new Map<string, string>();
  private readonly ctmStack: Array<{ ctm: Matrix; alpha: number }> = [];
  private ctm: Matrix = IDENTITY;
  /** Opacidad acumulada de los grupos (pdfkit la reinicia en cada cambio de color). */
  private alpha = 1;
  drewSomething = false;
  readonly placements: PdfArtPlacement[] = [];
  pageIndex = 0;
  pageHeightPt = 0;

  constructor(
    private readonly doc: PdfKitDoc,
    private readonly opts: PdfRenderOptions,
  ) {}

  private save(): void {
    this.doc.save();
    this.ctmStack.push({ ctm: this.ctm, alpha: this.alpha });
  }
  private restore(): void {
    this.doc.restore();
    const prev = this.ctmStack.pop();
    this.ctm = prev?.ctm ?? IDENTITY;
    this.alpha = prev?.alpha ?? 1;
  }
  private transform(m: Matrix): void {
    this.doc.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    this.ctm = compose(this.ctm, m);
  }

  beginPage(wMm: number, hMm: number): void {
    this.doc.addPage({ size: [wMm * PT_PER_MM, hMm * PT_PER_MM], margin: 0 });
    this.pageHeightPt = hMm * PT_PER_MM;
    this.ctm = IDENTITY;
    this.alpha = 1;
    this.ctmStack.length = 0;
    this.drewSomething = false;
    this.save();
    this.transform([PT_PER_MM, 0, 0, PT_PER_MM, 0, 0]);
  }

  endPage(): void {
    this.restore();
    this.pageIndex++;
  }

  private alias(faceKey: string): string {
    let a = this.fontAlias.get(faceKey);
    if (a) return a;
    const face = this.opts.fonts.get(faceKey);
    if (!face) throw new Error(`Fuente no cargada: ${faceKey}`);
    a = `F${this.fontAlias.size}`;
    this.doc.registerFont(a, face.bytes);
    this.fontAlias.set(faceKey, a);
    return a;
  }

  private applyStroke(s: Stroke, localScale = 1): void {
    this.doc.lineWidth(s.width / localScale);
    this.doc.strokeColor(s.color, (s.opacity ?? 1) * this.alpha);
    this.doc.lineCap(s.cap ?? 'butt');
    this.doc.lineJoin(s.join ?? 'miter');
    if (s.dash && s.dash.length >= 2) this.doc.dash(s.dash[0]! / localScale, { space: s.dash[1]! / localScale });
    else if (s.dash && s.dash.length === 1) this.doc.dash(s.dash[0]! / localScale, { space: s.dash[0]! / localScale });
    else this.doc.undash();
  }

  private paint(fill: Fill | undefined, stroke: Stroke | undefined, rule: 'nonzero' | 'evenodd' = 'nonzero', localScale = 1): void {
    const r = rule === 'evenodd' ? 'even-odd' : 'non-zero';
    if (fill) this.doc.fillColor(fill.color, (fill.opacity ?? 1) * this.alpha);
    if (stroke) this.applyStroke(stroke, localScale);
    if (fill && stroke) this.doc.fillAndStroke(r);
    else if (fill) this.doc.fill(r);
    else if (stroke) this.doc.stroke();
    this.drewSomething = true;
  }

  draw(prims: Prim[]): void {
    for (const p of prims) this.drawOne(p);
  }

  private drawOne(p: Prim): void {
    const doc = this.doc;
    switch (p.t) {
      case 'line':
        doc.moveTo(p.x1, p.y1).lineTo(p.x2, p.y2);
        this.paint(undefined, p.stroke);
        break;
      case 'rect':
        if (p.r) doc.roundedRect(p.x, p.y, p.w, p.h, p.r);
        else doc.rect(p.x, p.y, p.w, p.h);
        this.paint(p.fill, p.stroke);
        break;
      case 'circle':
        doc.circle(p.cx, p.cy, p.r);
        this.paint(p.fill, p.stroke);
        break;
      case 'path': {
        if (p.m) {
          this.save();
          this.transform(p.m);
          doc.path(p.d);
          this.paint(p.fill, p.stroke, p.rule, matrixScale(p.m) || 1);
          this.restore();
        } else {
          doc.path(p.d);
          this.paint(p.fill, p.stroke, p.rule);
        }
        break;
      }
      case 'dots': {
        if (p.pts.length === 0) break;
        let d = '';
        for (let i = 0; i < p.pts.length; i += 2) d += `M${p.pts[i]!.toFixed(3)} ${p.pts[i + 1]!.toFixed(3)} l0 0 `;
        this.save();
        doc.path(d);
        doc.lineCap('round');
        doc.lineWidth(p.r * 2);
        doc.strokeColor(p.color, (p.opacity ?? 1) * this.alpha);
        doc.undash();
        doc.stroke();
        this.restore();
        this.drewSomething = true;
        break;
      }
      case 'text': {
        const run = p.run;
        if (!run.text || run.glyphs.length === 0) break;
        doc.font(this.alias(run.face));
        doc.fontSize(run.size);
        doc.fillColor(p.color, (p.opacity ?? 1) * this.alpha);
        doc.text(run.text, p.x, p.y, {
          lineBreak: false,
          baseline: 'alphabetic',
          characterSpacing: run.tracking,
          features: [...run.features],
        });
        this.drewSomething = true;
        break;
      }
      case 'image': {
        const bytes = this.opts.assetBytes(p.asset);
        if (!bytes) break;
        this.save();
        doc.opacity((p.opacity ?? 1) * this.alpha);
        doc.image(toArrayBuffer(bytes), p.x, p.y, { width: p.w, height: p.h });
        this.restore();
        this.drewSomething = true;
        break;
      }
      case 'pdf': {
        // Se registra la ubicación; pdf-lib incrusta la página vectorial después.
        const flip: Matrix = [1, 0, 0, -1, 0, this.pageHeightPt];
        const W = 1;
        const H = 1;
        const local: Matrix = [p.w / W, 0, 0, -p.h / H, p.x, p.y + p.h];
        this.placements.push({
          pageIndex: this.pageIndex,
          asset: p.asset,
          page: p.page,
          matrix: compose(flip, compose(this.ctm, local)),
          opacity: (p.opacity ?? 1) * this.alpha,
          under: !this.drewSomething,
        });
        break;
      }
      case 'group': {
        const needsState = p.m || p.clip || (p.opacity !== undefined && p.opacity < 1);
        if (!needsState) {
          this.draw(p.children);
          break;
        }
        this.save();
        if (p.m) this.transform(p.m);
        if (p.opacity !== undefined && p.opacity < 1) this.alpha *= p.opacity;
        if (p.clip) doc.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h).clip();
        this.draw(p.children);
        this.restore();
        break;
      }
    }
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Renderiza páginas a un PDF. Las páginas de PDF importados se incrustan como vectores. */
export async function renderPdf(pages: PdfPageInput[], opts: PdfRenderOptions): Promise<Uint8Array> {
  const Ctor = PDFDocumentCtor as unknown as PdfKitCtor;
  const doc = new Ctor({
    autoFirstPage: false,
    compress: true,
    pdfVersion: '1.7',
    info: {
      Title: opts.info?.title ?? 'Agenda',
      Author: opts.info?.author ?? '',
      Subject: opts.info?.subject ?? '',
      Keywords: opts.info?.keywords ?? '',
      Creator: 'Agenda Heritage Studio',
      Producer: 'Agenda Heritage Studio (pdfkit)',
    },
  });
  const chunks: Uint8Array[] = [];
  doc.on('data', (c) => chunks.push(c instanceof Uint8Array ? c : new Uint8Array(c as ArrayBuffer)));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
  const painter = new PdfPainter(doc, opts);
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]!;
    painter.beginPage(pg.w, pg.h);
    painter.draw(pg.prims);
    painter.endPage();
    opts.onProgress?.(i + 1, pages.length);
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }
  doc._root.data.ViewerPreferences = doc.ref({
    DisplayDocTitle: true,
    PrintScaling: 'None',
    ...(opts.duplex ? { Duplex: opts.duplex } : {}),
    ...(opts.pickTrayByPdfSize ? { PickTrayByPDFSize: true } : {}),
  });
  doc.end();
  await done;
  const bytes = concat(chunks);
  if (painter.placements.length === 0) return bytes;
  return embedPdfArt(bytes, painter.placements, opts);
}

async function embedPdfArt(base: Uint8Array, placements: PdfArtPlacement[], opts: PdfRenderOptions): Promise<Uint8Array> {
  const lib = await import('@cantoo/pdf-lib');
  const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject, setGraphicsState, PDFName } = lib;
  const out = await PDFDocument.load(base);
  const cache = new Map<string, Awaited<ReturnType<typeof out.embedPdf>>[number]>();
  for (const pl of placements) {
    const key = `${pl.asset}#${pl.page}`;
    let emb = cache.get(key);
    if (!emb) {
      const src = opts.assetBytes(pl.asset);
      if (!src) continue;
      const [e] = await out.embedPdf(src, [Math.max(0, pl.page - 1)]);
      if (!e) continue;
      emb = e;
      cache.set(key, e);
    }
    const page = out.getPage(pl.pageIndex);
    const xName = page.node.newXObject('Art', emb.ref);
    const [a, b, c, d, e, f] = pl.matrix;
    // La página incrustada mide emb.width × emb.height puntos: se normaliza a 1×1.
    const ops = [pushGraphicsState()];
    if (pl.opacity < 1) {
      const gs = out.context.obj({ Type: 'ExtGState', ca: pl.opacity, CA: pl.opacity });
      const gsName = page.node.newExtGState('GS', out.context.register(gs));
      ops.push(setGraphicsState(gsName));
    }
    ops.push(concatTransformationMatrix(a, b, c, d, e, f), concatTransformationMatrix(1 / emb.width, 0, 0, 1 / emb.height, 0, 0), drawObject(xName), popGraphicsState());
    const ref = out.context.register(out.context.contentStream(ops));
    const contents = page.node.normalizedEntries().Contents;
    if (!contents) continue;
    if (pl.under) contents.insert(0, ref);
    else contents.push(ref);
    void PDFName;
  }
  out.setProducer('Agenda Heritage Studio (pdfkit + pdf-lib)');
  out.setCreator('Agenda Heritage Studio');
  return out.save({ useObjectStreams: true });
}
