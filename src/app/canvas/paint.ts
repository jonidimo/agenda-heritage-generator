/**
 * Dibujante Canvas 2D para miniaturas (rápido, sin DOM por glifo). Usa los
 * mismos contornos de glifos que la vista SVG y el PDF.
 */
import { BLEND_NAMES } from '@core/design/blend';
import type { Prim } from '@core/layout/prims';
import type { FontRegistry } from '@core/text/fonts';
import { glyphPath, segmentsOf } from '@core/text/shape';
import { assetHref } from '../state/assetUrls';

const pathCache = new Map<string, Path2D>();
const imgCache = new Map<string, HTMLImageElement>();

function glyph(fonts: FontRegistry, face: string, gid: number): Path2D | null {
  const k = `${face}#${gid}`;
  let p = pathCache.get(k);
  if (p) return p;
  const f = fonts.get(face);
  if (!f) return null;
  p = new Path2D(glyphPath(f, gid));
  pathCache.set(k, p);
  return p;
}

function image(href: string, onLoad: () => void): HTMLImageElement | null {
  let img = imgCache.get(href);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    img.src = href;
    imgCache.set(href, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function paintPrims(ctx: CanvasRenderingContext2D, prims: Prim[], fonts: FontRegistry, onAsync: () => void): void {
  for (const p of prims) {
    switch (p.t) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.strokeStyle = p.stroke.color;
        ctx.lineWidth = Math.max(p.stroke.width, 0.12);
        ctx.stroke();
        break;
      case 'rect':
        if (p.fill) {
          ctx.fillStyle = p.fill.color;
          ctx.globalAlpha *= p.fill.opacity ?? 1;
          ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.globalAlpha /= p.fill.opacity ?? 1;
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke.color;
          ctx.lineWidth = Math.max(p.stroke.width, 0.12);
          ctx.strokeRect(p.x, p.y, p.w, p.h);
        }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        if (p.fill) {
          ctx.fillStyle = p.fill.color;
          ctx.fill();
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke.color;
          ctx.lineWidth = Math.max(p.stroke.width, 0.12);
          ctx.stroke();
        }
        break;
      case 'path': {
        ctx.save();
        if (p.m) ctx.transform(p.m[0], p.m[1], p.m[2], p.m[3], p.m[4], p.m[5]);
        const path = new Path2D(p.d);
        if (p.fill) {
          ctx.fillStyle = p.fill.color;
          ctx.fill(path, p.rule === 'evenodd' ? 'evenodd' : 'nonzero');
        }
        if (p.stroke) {
          const k = p.m ? Math.sqrt(Math.abs(p.m[0] * p.m[3] - p.m[1] * p.m[2])) || 1 : 1;
          ctx.strokeStyle = p.stroke.color;
          ctx.lineWidth = Math.max(p.stroke.width, 0.12) / k;
          ctx.stroke(path);
        }
        ctx.restore();
        break;
      }
      case 'dots':
        ctx.fillStyle = p.color;
        for (let i = 0; i < p.pts.length; i += 2) ctx.fillRect(p.pts[i]! - p.r, p.pts[i + 1]! - p.r, p.r * 2, p.r * 2);
        break;
      case 'text': {
        ctx.fillStyle = p.color;
        for (const seg of segmentsOf(p.run)) {
          const u = seg.unit;
          for (let i = seg.from; i < seg.to; i++) {
            const g = p.run.glyphs[i]!;
            const path = glyph(fonts, seg.face, g.id);
            if (!path) continue;
            ctx.save();
            ctx.translate(p.x + g.x, p.y + g.y);
            ctx.scale(u, -u);
            ctx.fill(path);
            ctx.restore();
          }
        }
        break;
      }
      case 'image': {
        const href = assetHref(p.asset, 'image');
        const img = href ? image(href, onAsync) : null;
        if (img) ctx.drawImage(img, p.x, p.y, p.w, p.h);
        break;
      }
      case 'pdf': {
        const href = assetHref(`${p.asset}#${p.page}`, 'pdf');
        const img = href ? image(href, onAsync) : null;
        if (img) ctx.drawImage(img, p.x, p.y, p.w, p.h);
        else {
          ctx.fillStyle = '#efeae0';
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }
        break;
      }
      case 'group': {
        ctx.save();
        if (p.m) ctx.transform(p.m[0], p.m[1], p.m[2], p.m[3], p.m[4], p.m[5]);
        if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity;
        if (p.blend) ctx.globalCompositeOperation = BLEND_NAMES[p.blend].canvas;
        if (p.clip) {
          ctx.beginPath();
          ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h);
          ctx.clip();
        }
        paintPrims(ctx, p.children, fonts, onAsync);
        ctx.restore();
        break;
      }
    }
  }
}
