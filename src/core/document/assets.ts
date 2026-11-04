/**
 * Convierte un recurso (imagen, vector o PDF) en primitivas ubicadas en una
 * caja, con ajuste (contener/cubrir/estirar), opacidad, espejado y rotación.
 */
import { fitRect } from '../layout/box';
import type { AssetInfo } from '../layout/context';
import type { Prim } from '../layout/prims';
import { compose, composeAll, matrixScale, rotateAround, scale, translate, type Matrix, type Rect } from '../util/geometry';
import { ptToMm } from '../util/geometry';

export interface AssetPlacement {
  fit?: 'contain' | 'cover' | 'fill';
  opacity?: number;
  /** Rotación en grados alrededor del centro de la caja. */
  rotation?: number;
  mirror?: boolean;
  /** Grosor mínimo de trazo (pt) para vectores reducidos. */
  minStrokePt?: number;
  /** Recortar a la caja (útil con `cover`). */
  clip?: boolean;
}

/** Caja real que ocupa el recurso dentro de `box` según el ajuste. */
export function assetBox(info: AssetInfo | undefined, box: Rect, fit: AssetPlacement['fit'] = 'contain'): Rect {
  return fitRect(box, info?.aspect ?? box.w / box.h, fit);
}

export function assetPrims(info: AssetInfo | undefined, box: Rect, opts: AssetPlacement = {}): Prim[] {
  if (!info) {
    // Recurso faltante: marco punteado para que se note en la vista previa.
    return [{ t: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, stroke: { color: '#b0b0b0', width: 0.2, dash: [1, 1] } }];
  }
  const r = assetBox(info, box, opts.fit);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let outer: Matrix = translate(0, 0);
  if (opts.mirror) outer = compose(outer, composeAll(translate(cx, cy), scale(-1, 1), translate(-cx, -cy)));
  if (opts.rotation) outer = compose(outer, rotateAround(opts.rotation, cx, cy));
  let children: Prim[];
  if (info.kind === 'vector' && info.vector) {
    const v = info.vector;
    const sx = r.w / v.viewBox[2];
    const sy = r.h / v.viewBox[3];
    const place: Matrix = composeAll(translate(r.x, r.y), scale(sx, sy), translate(-v.viewBox[0], -v.viewBox[1]));
    const minMm = ptToMm(opts.minStrokePt ?? 0);
    children = v.items.map((it) => {
      const total = matrixScale(compose(place, it.m)) * matrixScale(outer);
      const widthMm = it.stroke ? Math.max(it.stroke.width * total, minMm) : 0;
      return {
        t: 'path',
        d: it.d,
        m: compose(place, it.m),
        rule: it.rule,
        ...(it.fill ? { fill: { color: it.fill.color, opacity: it.fill.opacity } } : {}),
        ...(it.stroke
          ? {
              stroke: {
                color: it.stroke.color,
                // El grosor se expresa en mm de página: el dibujante lo divide por la escala local.
                width: widthMm,
                opacity: it.stroke.opacity,
                cap: it.stroke.cap,
                join: it.stroke.join,
                ...(it.stroke.dash ? { dash: it.stroke.dash.map((x) => x * total) } : {}),
              },
            }
          : {}),
      } satisfies Prim;
    });
  } else if (info.kind === 'pdf') {
    children = [{ t: 'pdf', asset: info.id, page: 1, x: r.x, y: r.y, w: r.w, h: r.h }];
  } else {
    children = [{ t: 'image', asset: info.id, x: r.x, y: r.y, w: r.w, h: r.h }];
  }
  const groupExtras: { m?: Matrix; opacity?: number; clip?: Rect } = {};
  if (opts.mirror || opts.rotation) groupExtras.m = outer;
  if (opts.opacity !== undefined && opts.opacity < 1) groupExtras.opacity = opts.opacity;
  if (opts.clip) groupExtras.clip = box;
  return [{ t: 'group', children, ...groupExtras }];
}
