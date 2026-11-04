/**
 * Dibujante SVG. El texto se dibuja como contornos de glifos calculados por
 * el mismo conformador que alimenta al PDF, así la vista previa es idéntica a
 * la impresión en cualquier navegador y sistema (sin depender de fuentes
 * instaladas ni del motor de texto del navegador).
 */
import { glyphPath } from '../text/shape';
import type { FontRegistry } from '../text/fonts';
import { fmt, isIdentity, matrixScale, matrixToString, type Matrix } from '../util/geometry';
import type { Block, Fill, PageModel, Prim, Stroke } from '../layout/prims';

export interface SvgRenderOptions {
  fonts: FontRegistry;
  /** URL para un recurso raster/PDF (p. ej. un blob: o data:). */
  assetHref?: (assetId: string, kind: 'image' | 'pdf') => string | undefined;
  /** Prefijo para los id de glifos (`sprite` comparte un `<defs>` global). */
  glyphPrefix?: string;
  /** Si se pasa, los glifos usados se registran aquí en lugar de incrustarse. */
  glyphSink?: GlyphSink;
  /** Atributos `data-block` para selección en el editor. */
  blockAttrs?: boolean;
}

/** Registro de glifos usados (para construir un único `<defs>` compartido). */
export class GlyphSink {
  readonly used = new Map<string, Set<number>>();
  private readonly faceIds = new Map<string, number>();

  faceIndex(faceKey: string): number {
    let i = this.faceIds.get(faceKey);
    if (i === undefined) {
      i = this.faceIds.size;
      this.faceIds.set(faceKey, i);
    }
    return i;
  }

  add(faceKey: string, gid: number): string {
    const fi = this.faceIndex(faceKey);
    let set = this.used.get(faceKey);
    if (!set) {
      set = new Set();
      this.used.set(faceKey, set);
    }
    set.add(gid);
    return `f${fi}g${gid}`;
  }

  /** `<path id>` por glifo, en unidades de diseño (Y hacia arriba). */
  defs(fonts: FontRegistry, prefix = 'g'): string {
    let out = '';
    for (const [faceKey, gids] of this.used) {
      const face = fonts.get(faceKey);
      if (!face) continue;
      const fi = this.faceIndex(faceKey);
      for (const gid of gids) out += `<path id="${prefix}f${fi}g${gid}" d="${glyphPath(face, gid)}"/>`;
    }
    return out;
  }
}

let clipCounter = 0;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function strokeAttrs(s: Stroke | undefined, localScale = 1, alpha = 1): string {
  if (!s) return ' stroke="none"';
  let a = ` stroke="${s.color}" stroke-width="${fmt(s.width / localScale, 4)}"`;
  if (s.dash && s.dash.length > 0) a += ` stroke-dasharray="${s.dash.map((d) => fmt(d / localScale, 3)).join(' ')}"`;
  if (s.cap && s.cap !== 'butt') a += ` stroke-linecap="${s.cap}"`;
  if (s.join && s.join !== 'miter') a += ` stroke-linejoin="${s.join}"`;
  const o = (s.opacity ?? 1) * alpha;
  if (o < 1) a += ` stroke-opacity="${fmt(o, 3)}"`;
  return a;
}

function fillAttrs(f: Fill | undefined, alpha = 1): string {
  if (!f) return ' fill="none"';
  const o = (f.opacity ?? 1) * alpha;
  return ` fill="${f.color}"${o < 1 ? ` fill-opacity="${fmt(o, 3)}"` : ''}`;
}

function transformAttr(m: Matrix | undefined): string {
  return m && !isIdentity(m) ? ` transform="matrix(${matrixToString(m)})"` : '';
}

/**
 * La opacidad de grupos y bloques se multiplica en cada elemento (no se compone el grupo),
 * exactamente como lo hace el PDF: la vista previa coincide con la impresión.
 */
export function primsToSvg(prims: Prim[], opts: SvgRenderOptions, sink: GlyphSink, prefix: string, alpha = 1): string {
  let out = '';
  for (const p of prims) {
    switch (p.t) {
      case 'line':
        out += `<line x1="${fmt(p.x1)}" y1="${fmt(p.y1)}" x2="${fmt(p.x2)}" y2="${fmt(p.y2)}"${strokeAttrs(p.stroke, 1, alpha)}/>`;
        break;
      case 'rect':
        out += `<rect x="${fmt(p.x)}" y="${fmt(p.y)}" width="${fmt(p.w)}" height="${fmt(p.h)}"${p.r ? ` rx="${fmt(p.r)}"` : ''}${fillAttrs(p.fill, alpha)}${strokeAttrs(p.stroke, 1, alpha)}/>`;
        break;
      case 'circle':
        out += `<circle cx="${fmt(p.cx)}" cy="${fmt(p.cy)}" r="${fmt(p.r)}"${fillAttrs(p.fill, alpha)}${strokeAttrs(p.stroke, 1, alpha)}/>`;
        break;
      case 'path': {
        const k = p.m ? matrixScale(p.m) || 1 : 1;
        out += `<path d="${esc(p.d)}"${transformAttr(p.m)}${fillAttrs(p.fill, alpha)}${strokeAttrs(p.stroke, k, alpha)}${p.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`;
        break;
      }
      case 'dots': {
        let d = '';
        for (let i = 0; i < p.pts.length; i += 2) d += `M${fmt(p.pts[i]!)} ${fmt(p.pts[i + 1]!)}h0`;
        const o = (p.opacity ?? 1) * alpha;
        out += `<path d="${d}" stroke="${p.color}" stroke-width="${fmt(p.r * 2, 4)}" stroke-linecap="round" fill="none"${o < 1 ? ` stroke-opacity="${fmt(o, 3)}"` : ''}/>`;
        break;
      }
      case 'text': {
        const run = p.run;
        if (run.glyphs.length === 0) break;
        const u = run.unit;
        const o = (p.opacity ?? 1) * alpha;
        let g = `<g fill="${p.color}"${o < 1 ? ` fill-opacity="${fmt(o, 3)}"` : ''}>`;
        for (const gl of run.glyphs) {
          const id = sink.add(run.face, gl.id);
          g += `<use href="#${prefix}${id}" transform="matrix(${fmt(u, 7)} 0 0 ${fmt(-u, 7)} ${fmt(p.x + gl.x, 4)} ${fmt(p.y + gl.y, 4)})"/>`;
        }
        out += `${g}</g>`;
        break;
      }
      case 'image': {
        const href = opts.assetHref?.(p.asset, 'image');
        const o = (p.opacity ?? 1) * alpha;
        if (href) out += `<image href="${esc(href)}" x="${fmt(p.x)}" y="${fmt(p.y)}" width="${fmt(p.w)}" height="${fmt(p.h)}" preserveAspectRatio="none"${o < 1 ? ` opacity="${fmt(o, 3)}"` : ''}/>`;
        else out += `<rect x="${fmt(p.x)}" y="${fmt(p.y)}" width="${fmt(p.w)}" height="${fmt(p.h)}" fill="#eee" stroke="#bbb" stroke-width="0.2"/>`;
        break;
      }
      case 'pdf': {
        const href = opts.assetHref?.(`${p.asset}#${p.page}`, 'pdf');
        const o = (p.opacity ?? 1) * alpha;
        if (href) out += `<image href="${esc(href)}" x="${fmt(p.x)}" y="${fmt(p.y)}" width="${fmt(p.w)}" height="${fmt(p.h)}" preserveAspectRatio="none"${o < 1 ? ` opacity="${fmt(o, 3)}"` : ''}/>`;
        else out += `<rect x="${fmt(p.x)}" y="${fmt(p.y)}" width="${fmt(p.w)}" height="${fmt(p.h)}" fill="#f4f1ea" stroke="#bbb" stroke-width="0.2" stroke-dasharray="1 1"/>`;
        break;
      }
      case 'group': {
        let clip = '';
        let clipId = '';
        if (p.clip) {
          clipId = `${prefix}c${++clipCounter}`;
          clip = `<clipPath id="${clipId}"><rect x="${fmt(p.clip.x)}" y="${fmt(p.clip.y)}" width="${fmt(p.clip.w)}" height="${fmt(p.clip.h)}"/></clipPath>`;
        }
        out += `${clip}<g${transformAttr(p.m)}${clipId ? ` clip-path="url(#${clipId})"` : ''}>${primsToSvg(p.children, opts, sink, prefix, alpha * (p.opacity ?? 1))}</g>`;
        break;
      }
    }
  }
  return out;
}

function blockToSvg(b: Block, opts: SvgRenderOptions, sink: GlyphSink, prefix: string): string {
  const attrs = opts.blockAttrs ? ` data-block="${esc(b.id)}" data-role="${b.role}"${b.editable ? '' : ' data-locked="1"'}` : '';
  return `<g${attrs}${transformAttr(b.m)}>${primsToSvg(b.prims, opts, sink, prefix, b.opacity ?? 1)}</g>`;
}

/** Contenido interno (sin `<svg>`) de una página. */
export function pageInnerSvg(page: PageModel, opts: SvgRenderOptions): { body: string; sink: GlyphSink } {
  const sink = opts.glyphSink ?? new GlyphSink();
  const prefix = opts.glyphPrefix ?? 'g';
  let body = '';
  for (const b of page.blocks) body += blockToSvg(b, opts, sink, prefix);
  return { body, sink };
}

/** SVG autónomo de una página (con sus glifos incrustados): para exportar o depurar. */
export function pageToSvg(page: PageModel, opts: SvgRenderOptions, extra: { background?: string } = {}): string {
  const sink = new GlyphSink();
  const prefix = opts.glyphPrefix ?? 'g';
  const { body } = pageInnerSvg(page, { ...opts, glyphSink: sink });
  const defs = sink.defs(opts.fonts, prefix);
  const bg = extra.background ? `<rect width="${fmt(page.w)}" height="${fmt(page.h)}" fill="${extra.background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(page.w)}mm" height="${fmt(page.h)}mm" viewBox="0 0 ${fmt(page.w)} ${fmt(page.h)}"><defs>${defs}</defs>${bg}${body}</svg>`;
}

/** SVG autónomo de primitivas sueltas (hojas impuestas, tapa, calibración). */
export function primsToStandaloneSvg(w: number, h: number, prims: Prim[], opts: SvgRenderOptions, background = '#ffffff'): string {
  const sink = new GlyphSink();
  const prefix = opts.glyphPrefix ?? 'g';
  const body = primsToSvg(prims, opts, sink, prefix);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}"><defs>${sink.defs(opts.fonts, prefix)}</defs><rect width="${fmt(w)}" height="${fmt(h)}" fill="${background}"/>${body}</svg>`;
}
