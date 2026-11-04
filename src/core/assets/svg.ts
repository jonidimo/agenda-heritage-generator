/**
 * Importador SVG → vectores propios. Conserva trazados, rellenos, trazos,
 * opacidades, reglas de relleno y transformaciones (incluidos estilos por
 * clase CSS, como exporta Illustrator). Lo no soportado (texto sin convertir
 * a trazos, filtros, máscaras, imágenes incrustadas) se informa como aviso.
 */
import { compose, IDENTITY, type Matrix } from '../util/geometry';
import { findFirst, localName, parseXml, type XmlNode } from './xml';

export interface VectorPaint {
  color: string;
  opacity: number;
}

export interface VectorStroke extends VectorPaint {
  /** Grosor en unidades de usuario del SVG (antes de transformar). */
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  dash?: number[];
}

export interface VectorItem {
  d: string;
  m: Matrix;
  fill: VectorPaint | null;
  stroke: VectorStroke | null;
  rule: 'nonzero' | 'evenodd';
}

export interface VectorAsset {
  viewBox: [number, number, number, number];
  widthMm: number;
  heightMm: number;
  items: VectorItem[];
  warnings: string[];
}

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', maroon: '#800000', purple: '#800080', fuchsia: '#ff00ff', lime: '#00ff00', olive: '#808000',
  yellow: '#ffff00', navy: '#000080', teal: '#008080', aqua: '#00ffff', orange: '#ffa500', brown: '#a52a2a', pink: '#ffc0cb',
  darkgreen: '#006400', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', gold: '#ffd700',
};

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

function lengthMm(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*([+-]?[\d.]+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px|%)?\s*$/i.exec(v);
  if (!m || m[2] === '%') return null;
  return Number(m[1]) * (UNIT_MM[(m[2] ?? '').toLowerCase()] ?? UNIT_MM.px!);
}

function num(v: string | undefined, def = 0): number {
  if (v === undefined) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

export function parseTransform(src: string | undefined): Matrix {
  if (!src) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const a = match[2]!.split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (a.length >= 6) t = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        break;
      case 'translate':
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(r);
        const s = Math.sin(r);
        const cx = a[1] ?? 0;
        const cy = a[2] ?? 0;
        t = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = compose(m, t);
  }
  return m;
}

interface Paint {
  color: string;
  alpha: number;
}

function parseColor(v: string, gradients: Map<string, string>, current: string): Paint | null {
  const s = v.trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return null;
  if (s === 'currentcolor') return parseColor(current, gradients, '#000000');
  const url = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(s);
  if (url) {
    const c = gradients.get(url[1]!);
    return c ? parseColor(c, gradients, current) : { color: '#000000', alpha: 1 };
  }
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      const alphaHex = h[3];
      return {
        color: `#${h.slice(0, 3).split('').map((x) => x + x).join('')}`,
        alpha: alphaHex === undefined ? 1 : parseInt(alphaHex + alphaHex, 16) / 255,
      };
    }
    if (h.length === 6) return { color: `#${h}`, alpha: 1 };
    if (h.length === 8) return { color: `#${h.slice(0, 6)}`, alpha: parseInt(h.slice(6), 16) / 255 };
  }
  const rgb = /^rgba?\(([^)]+)\)/.exec(s);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean);
    const ch = (p: string | undefined): number => (p?.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p ?? '0'));
    const hex = [ch(parts[0]), ch(parts[1]), ch(parts[2])].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
    const alpha = parts[3] !== undefined ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    return { color: `#${hex}`, alpha };
  }
  if (NAMED[s]) return { color: NAMED[s]!, alpha: 1 };
  return { color: '#000000', alpha: 1 };
}

type Style = Record<string, string>;

const INHERITED = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'color', 'visibility',
]);

function parseDecls(s: string): Style {
  const out: Style = {};
  for (const decl of s.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    const v = decl.slice(i + 1).replace(/!important/i, '').trim();
    if (k) out[k] = v;
  }
  return out;
}

interface CssRule {
  tag?: string;
  cls?: string;
  id?: string;
  decls: Style;
}

function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const decls = parseDecls(m[2]!);
    for (const sel of m[1]!.split(',')) {
      const s = sel.trim();
      const sm = /^([a-zA-Z][\w-]*)?(?:#([\w-]+))?(?:\.([\w-]+))?$/.exec(s);
      if (!sm) continue;
      rules.push({ ...(sm[1] ? { tag: sm[1] } : {}), ...(sm[2] ? { id: sm[2] } : {}), ...(sm[3] ? { cls: sm[3] } : {}), decls });
    }
  }
  return rules;
}

const PRESENTATION = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'display', 'visibility', 'color',
];

function shapeToPath(node: XmlNode): string | null {
  const a = node.attrs;
  switch (localName(node.name)) {
    case 'path':
      return a.d ?? null;
    case 'rect': {
      const x = num(a.x);
      const y = num(a.y);
      const w = num(a.width);
      const h = num(a.height);
      if (w <= 0 || h <= 0) return null;
      let rx = a.rx !== undefined ? num(a.rx) : a.ry !== undefined ? num(a.ry) : 0;
      let ry = a.ry !== undefined ? num(a.ry) : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle': {
      const cx = num(a.cx);
      const cy = num(a.cy);
      const r = num(a.r);
      if (r <= 0) return null;
      return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
    }
    case 'ellipse': {
      const cx = num(a.cx);
      const cy = num(a.cy);
      const rx = num(a.rx);
      const ry = num(a.ry);
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const pts = (a.points ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return localName(node.name) === 'polygon' ? `${d}Z` : d;
    }
    default:
      return null;
  }
}

export function importSvg(src: string): VectorAsset {
  const doc = parseXml(src);
  const svg = findFirst(doc, 'svg');
  if (!svg) throw new Error('El archivo no contiene un elemento <svg>');
  const warnings: string[] = [];
  const vbRaw = (svg.attrs.viewBox ?? svg.attrs.viewbox ?? '').trim().split(/[\s,]+/).map(Number);
  const wMm = lengthMm(svg.attrs.width);
  const hMm = lengthMm(svg.attrs.height);
  let viewBox: [number, number, number, number];
  if (vbRaw.length === 4 && vbRaw.every(Number.isFinite) && vbRaw[2]! > 0 && vbRaw[3]! > 0) {
    viewBox = [vbRaw[0]!, vbRaw[1]!, vbRaw[2]!, vbRaw[3]!];
  } else {
    const wpx = (wMm ?? 100) / UNIT_MM.px!;
    const hpx = (hMm ?? 100) / UNIT_MM.px!;
    viewBox = [0, 0, wpx, hpx];
  }
  const widthMm = wMm ?? viewBox[2] * UNIT_MM.px!;
  const heightMm = hMm ?? viewBox[3] * UNIT_MM.px!;

  // Índices: ids, estilos CSS y color representativo de cada degradado.
  const byId = new Map<string, XmlNode>();
  const cssRules: CssRule[] = [];
  const gradients = new Map<string, string>();
  const index = (node: XmlNode): void => {
    if (node.attrs.id) byId.set(node.attrs.id, node);
    const ln = localName(node.name);
    if (ln === 'style') cssRules.push(...parseCss(node.text));
    if (ln === 'linearGradient' || ln === 'radialGradient') {
      const stop = node.children.find((c) => localName(c.name) === 'stop');
      const color = stop ? (stop.attrs['stop-color'] ?? parseDecls(stop.attrs.style ?? '')['stop-color']) : undefined;
      if (node.attrs.id && color) gradients.set(node.attrs.id, color);
      if (node.attrs.id && !color) {
        const href = (node.attrs['xlink:href'] ?? node.attrs.href ?? '').replace(/^#/, '');
        if (href) gradients.set(node.attrs.id, `url(#${href})`);
      }
    }
    node.children.forEach(index);
  };
  index(svg);
  // Resolución de degradados encadenados.
  for (const [k, v] of gradients) {
    let val = v;
    for (let i = 0; i < 5 && val.startsWith('url('); i++) {
      const id = /#([^)'"]+)/.exec(val)?.[1];
      val = (id && gradients.get(id)) || '#000000';
    }
    gradients.set(k, val);
  }

  const items: VectorItem[] = [];
  let warnedText = false;
  let warnedImage = false;
  let warnedGradient = gradients.size > 0;
  if (warnedGradient) warnings.push('Los degradados se convierten a su primer color.');

  const computeStyle = (node: XmlNode, inherited: Style): Style => {
    const style: Style = {};
    for (const [k, v] of Object.entries(inherited)) if (INHERITED.has(k)) style[k] = v;
    for (const k of PRESENTATION) if (node.attrs[k] !== undefined) style[k] = node.attrs[k]!;
    const ln = localName(node.name);
    const classes = (node.attrs.class ?? '').split(/\s+/).filter(Boolean);
    for (const rule of cssRules) {
      if (rule.tag && rule.tag !== ln) continue;
      if (rule.id && rule.id !== node.attrs.id) continue;
      if (rule.cls && !classes.includes(rule.cls)) continue;
      Object.assign(style, rule.decls);
    }
    if (node.attrs.style) Object.assign(style, parseDecls(node.attrs.style));
    // La opacidad del grupo se acumula multiplicando.
    const parentOpacity = inherited.__opacity !== undefined ? Number(inherited.__opacity) : 1;
    const own = style.opacity !== undefined ? num(style.opacity, 1) : 1;
    style.__opacity = String(parentOpacity * own);
    return style;
  };

  const walk = (node: XmlNode, inherited: Style, m: Matrix, depth: number): void => {
    if (depth > 64) return;
    const ln = localName(node.name);
    if (['defs', 'clipPath', 'mask', 'symbol', 'title', 'desc', 'metadata', 'namedview', 'style', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'script'].includes(ln)) return;
    const style = computeStyle(node, inherited);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    let local = compose(m, parseTransform(node.attrs.transform));
    if (ln === 'text' || ln === 'tspan') {
      if (!warnedText) warnings.push('Hay textos sin convertir a trazos: convertilos a curvas en tu editor (Inkscape: Trayecto → Objeto a trayecto).');
      warnedText = true;
      return;
    }
    if (ln === 'image') {
      if (!warnedImage) warnings.push('Las imágenes incrustadas en el SVG se ignoran: importalas por separado como PNG/JPG.');
      warnedImage = true;
      return;
    }
    if (ln === 'use') {
      const href = (node.attrs['xlink:href'] ?? node.attrs.href ?? '').replace(/^#/, '');
      const target = byId.get(href);
      if (!target) return;
      local = compose(local, [1, 0, 0, 1, num(node.attrs.x), num(node.attrs.y)]);
      if (localName(target.name) === 'symbol') target.children.forEach((c) => walk(c, style, local, depth + 1));
      else walk(target, style, local, depth + 1);
      return;
    }
    if (ln === 'svg' && depth > 0) local = compose(local, [1, 0, 0, 1, num(node.attrs.x), num(node.attrs.y)]);
    const d = shapeToPath(node);
    if (d) {
      const op = Number(style.__opacity ?? 1);
      const current = style.color ?? '#000000';
      const fillPaint = style.fill === undefined ? { color: '#000000', alpha: 1 } : parseColor(style.fill, gradients, current);
      const strokePaint = style.stroke === undefined ? null : parseColor(style.stroke, gradients, current);
      const isLine = ln === 'line' || ln === 'polyline';
      const fill = fillPaint && !isLine ? { color: fillPaint.color, opacity: fillPaint.alpha * num(style['fill-opacity'], 1) * op } : null;
      const width = num(style['stroke-width']?.replace(/px$/, ''), 1);
      const dash = style['stroke-dasharray'] && style['stroke-dasharray'] !== 'none' ? style['stroke-dasharray'].split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0) : undefined;
      const stroke = strokePaint && width > 0
        ? {
            color: strokePaint.color,
            opacity: strokePaint.alpha * num(style['stroke-opacity'], 1) * op,
            width,
            cap: (['butt', 'round', 'square'].includes(style['stroke-linecap'] ?? '') ? style['stroke-linecap'] : 'butt') as VectorStroke['cap'],
            join: (['miter', 'round', 'bevel'].includes(style['stroke-linejoin'] ?? '') ? style['stroke-linejoin'] : 'miter') as VectorStroke['join'],
            ...(dash && dash.length > 0 ? { dash } : {}),
          }
        : null;
      if (fill || stroke) items.push({ d, m: local, fill, stroke, rule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero' });
    }
    for (const c of node.children) walk(c, style, local, depth + 1);
  };
  walk(svg, {}, IDENTITY, 0);
  if (items.length === 0) warnings.push('El SVG no tiene formas dibujables.');
  return { viewBox, widthMm, heightMm, items, warnings };
}
