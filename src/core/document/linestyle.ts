/**
 * Estilo de las líneas según su uso (renglones, separadores, tablas, marcos), tal como lo pide el
 * tema: lisa, a guiones, de puntos, doble, con un ornamento repetido a lo largo o con un ornamento
 * al centro, y ornamentos en las esquinas de los marcos. Se aplica una sola vez, a las primitivas
 * de la página: la vista previa, las miniaturas y el PDF salen iguales. Si el tema no tiene
 * estilos especiales, no hace nada (ni copia nada).
 */
import { LINE_USES, type LineStyle, type LineUse } from '../design/themes';
import type { AssetInfo } from '../layout/context';
import { builtinOrnament, parseOrnamentRef } from '../layout/ornaments';
import { line, type LinePrim, type Prim, type RectPrim, type Stroke } from '../layout/prims';
import { composeAll, rotateAround, translate, type Rect } from '../util/geometry';
import { assetPrims } from './assets';

type Lines = Record<LineUse, LineStyle>;
type Assets = ReadonlyMap<string, AssetInfo>;

/** Tope de módulos por línea (una guarda muy chica en una línea muy larga no dispara el tamaño del PDF). */
const MAX_TILES = 400;

export function hasLineStyles(lines: Lines | undefined): lines is Lines {
  return Boolean(lines) && LINE_USES.some((u) => {
    const s = lines![u];
    return s.pattern !== 'solid' || s.corner !== '' || s.color !== '';
  });
}

/** Aplica el estilo de líneas a un conjunto de primitivas (entra en los grupos). */
export function applyLineStyles(prims: Prim[], lines: Lines | undefined, assets: Assets): Prim[] {
  if (!hasLineStyles(lines)) return prims;
  const walk = (ps: Prim[]): Prim[] =>
    ps.flatMap((p): Prim[] => {
      if (p.t === 'group') return [{ ...p, children: walk(p.children) }];
      if (p.t === 'line' && p.stroke.use) return styledLine(p, lines[p.stroke.use], assets);
      if (p.t === 'rect' && p.stroke?.use === 'frame') return styledFrame(p, lines.frame, assets);
      return [p];
    });
  return walk(prims);
}

/** Proporción (ancho / alto) de un ornamento. */
function aspectOf(ref: string, assets: Assets): number {
  const r = parseOrnamentRef(ref);
  if (!r) return 1;
  if (r.source === 'builtin') return builtinOrnament(r.id)?.aspect ?? 1;
  return assets.get(r.id)?.aspect ?? 1;
}

/** Grosor de los trazos de un ornamento integrado: proporcional a su alto, nunca tan fino que no se imprima. */
const ornamentStroke = (h: number): number => Math.max(0.12, h * 0.055);

/**
 * Ornamentos en una o varias cajas: los integrados se juntan en un solo trazado por modo (relleno y
 * línea), así una guarda de cien módulos son dos primitivas; las imágenes van una por caja.
 */
function ornamentPrims(ref: string, boxes: Rect[], color: string, assets: Assets): Prim[] {
  const r = parseOrnamentRef(ref);
  if (!r || boxes.length === 0) return [];
  if (r.source === 'asset') return boxes.flatMap((b) => assetPrims(assets.get(r.id), b, { fit: 'contain' }));
  const o = builtinOrnament(r.id);
  if (!o) return [];
  const fills: string[] = [];
  const strokes: string[] = [];
  for (const b of boxes) for (const s of o.draw(b.x, b.y, b.w, b.h)) (s.mode === 'fill' ? fills : strokes).push(s.d);
  const out: Prim[] = [];
  if (fills.length > 0) out.push({ t: 'path', d: fills.join(' '), fill: { color } });
  if (strokes.length > 0) out.push({ t: 'path', d: strokes.join(' '), stroke: { color, width: ornamentStroke(boxes[0]!.h), cap: 'round', join: 'round' } });
  return out;
}

/** Trazo con el patrón pedido (para los que se resuelven con el trazo mismo). */
function patterned(base: Stroke, pattern: LineStyle['pattern']): Stroke {
  const w = base.width;
  if (pattern === 'dashed') return { ...base, dash: [Math.max(1.2, 6 * w), Math.max(0.8, 3.5 * w)] };
  if (pattern === 'dotted') {
    const dw = Math.max(w, 0.3);
    return { ...base, width: dw, cap: 'round', dash: [0.001, Math.max(0.9, 3 * dw)] };
  }
  return base;
}

function styledLine(l: LinePrim, st: LineStyle, assets: Assets): Prim[] {
  const color = st.color || l.stroke.color;
  const base: Stroke = { ...l.stroke, color };
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len = Math.hypot(dx, dy);
  if (st.pattern === 'solid' || st.pattern === 'dashed' || st.pattern === 'dotted' || len < 0.5) return [{ ...l, stroke: patterned(base, st.pattern) }];
  // Las demás se dibujan sobre el eje de la línea (de 0 a `len`, en y = 0) y se ubican con una transformación.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const place = (children: Prim[]): Prim[] => [{ t: 'group', m: angle === 0 ? translate(l.x1, l.y1) : composeAll(translate(l.x1, l.y1), rotateAround(angle, 0, 0)), children }];
  if (st.pattern === 'double') {
    const off = Math.max(0.3, 1.2 * base.width);
    const thin = { ...base, width: Math.max(0.08, base.width * 0.7) };
    return place([line(0, -off, len, -off, thin), line(0, off, len, off, thin)]);
  }
  if (!st.ornament) return [{ ...l, stroke: base }];
  const h = st.size;
  const ow = h * aspectOf(st.ornament, assets);
  if (st.pattern === 'repeat') {
    const n = Math.min(MAX_TILES, Math.floor(len / ow));
    if (n < 1) return [{ ...l, stroke: base }];
    const start = (len - n * ow) / 2;
    return place(ornamentPrims(st.ornament, Array.from({ length: n }, (_, i) => ({ x: start + i * ow, y: -h / 2, w: ow, h })), color, assets));
  }
  // Al centro: la línea se corta y el ornamento ocupa el medio (en una línea corta, se achica).
  const gap = h * 0.3;
  if (len < ow + 2 * gap + 2) {
    const k = Math.min(1, (len * 0.9) / ow);
    return place(ornamentPrims(st.ornament, [{ x: (len - ow * k) / 2, y: (-h * k) / 2, w: ow * k, h: h * k }], color, assets));
  }
  const a = len / 2 - ow / 2 - gap;
  const b = len / 2 + ow / 2 + gap;
  return place([line(0, 0, a, 0, base), ...ornamentPrims(st.ornament, [{ x: len / 2 - ow / 2, y: -h / 2, w: ow, h }], color, assets), line(b, 0, len, 0, base)]);
}

function styledFrame(r: RectPrim, st: LineStyle, assets: Assets): Prim[] {
  const stroke = r.stroke!;
  const base: Stroke = { ...stroke, color: st.color || stroke.color };
  const out: Prim[] = [];
  switch (st.pattern) {
    case 'solid':
    case 'dashed':
    case 'dotted':
      out.push({ ...r, stroke: patterned(base, st.pattern) });
      break;
    case 'double': {
      const gap = Math.max(0.6, 2.5 * base.width);
      const thin = { ...base, width: Math.max(0.08, base.width * 0.8) };
      out.push({ ...r, stroke: thin });
      if (r.w > 4 * gap && r.h > 4 * gap) out.push({ t: 'rect', x: r.x + gap, y: r.y + gap, w: r.w - 2 * gap, h: r.h - 2 * gap, ...(r.r ? { r: Math.max(0, r.r - gap) } : {}), stroke: thin });
      break;
    }
    default: {
      // Ornamento a lo largo o al centro de cada lado; el relleno, si lo hay, queda debajo.
      if (r.fill) out.push({ ...r, stroke: undefined } as RectPrim);
      const { x, y, w, h } = r;
      const edges: Array<[number, number, number, number]> = [
        [x, y, x + w, y],
        [x + w, y, x + w, y + h],
        [x + w, y + h, x, y + h],
        [x, y + h, x, y],
      ];
      for (const [x1, y1, x2, y2] of edges) out.push(...styledLine({ t: 'line', x1, y1, x2, y2, stroke: base }, st, assets));
    }
  }
  if (st.corner) {
    const s = Math.min(st.size, r.w / 2, r.h / 2);
    const corners: Array<[number, number]> = [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ];
    // La esquina está dibujada para arriba a la izquierda; las otras tres son la misma girada.
    corners.forEach(([cx, cy], k) => {
      const children = ornamentPrims(st.corner, [{ x: 0, y: 0, w: s, h: s }], base.color, assets);
      if (children.length > 0) out.push({ t: 'group', m: composeAll(translate(cx, cy), rotateAround(90 * k, 0, 0)), children });
    });
  }
  return out;
}
