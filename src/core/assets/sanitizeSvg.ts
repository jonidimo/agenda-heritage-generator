/**
 * Limpieza de un SVG que viene de internet: se vuelve a escribir solo con los elementos y atributos
 * de dibujo conocidos. No quedan scripts, `foreignObject`, enlaces ni referencias a archivos o
 * direcciones de afuera (`href`, `url(...)` que no apunte a un elemento del mismo archivo, `@import`),
 * manejadores de eventos (`onload`…), ni la declaración DOCTYPE con sus entidades. Lo que se saca se
 * cuenta en `removed`, para decírselo a la persona.
 */
import { localName, parseXml, type XmlNode } from './xml';

/** Elementos de dibujo que se conservan (por su nombre local). */
const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'title', 'desc',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'style', 'image', 'filter',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow',
  'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
]);
/** Elementos que se dejan de lado pero cuyo contenido de dibujo se conserva (un enlace `<a>` envuelve formas). */
const UNWRAP = new Set(['a', 'switch']);
/** Elementos que llevan texto. */
const TEXTUAL = new Set(['text', 'tspan', 'textPath', 'title', 'desc', 'style']);

const MAX_DEPTH = 100;
const MAX_NODES = 200_000;

export interface SanitizedSvg {
  svg: string;
  /** Qué se sacó, agrupado («script ×2», «enlace externo ×1»). */
  removed: string[];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => esc(s).replace(/"/g, '&quot;');

/** ¿Es una referencia interna (`#id`)? */
const internal = (v: string): boolean => /^\s*#[^\s]*\s*$/.test(v);
/** Una imagen incrustada en datos: solo mapas de bits (un SVG adentro podría traer scripts). */
const safeDataImage = (v: string): boolean => /^\s*data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(v);

/**
 * ¿Es un valor CSS que no carga nada de afuera ni ejecuta nada? Estricto a propósito: nada de escapes (`\72l(` es
 * `url(`), arrobas (`@import`), `image-set`, `image(`, `src(`, ni un `url(` que no sea `url(#elemento)` bien cerrado.
 * Lo que no pasa se saca entero (un estilo menos es mejor que uno que rastrea).
 */
export function safeCss(css: string): boolean {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/[\\@]|image-set|image\(|src\(|expression|javascript|behavior|binding|<!--|-->/i.test(text)) return false;
  const urls = text.match(/url\(/gi)?.length ?? 0;
  const safe = text.match(/url\(\s*(?:"#[^"\s)]*"|'#[^'\s)]*'|#[^'"\s)]*)\s*\)/gi)?.length ?? 0;
  return urls === safe;
}

/** Los atributos que se conservan de un elemento, ya limpios. */
function cleanAttrs(el: string, attrs: Record<string, string>, count: (what: string) => void): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [rawName, value] of Object.entries(attrs)) {
    const name = rawName;
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) {
      count('manejador de eventos');
      continue;
    }
    if (lower === 'xmlns') {
      out.push([name, 'http://www.w3.org/2000/svg']);
      continue;
    }
    if (lower === 'xmlns:xlink') {
      out.push([name, 'http://www.w3.org/1999/xlink']);
      continue;
    }
    if (lower === 'xml:space') {
      if (value === 'preserve' || value === 'default') out.push([name, value]);
      continue;
    }
    if (lower === 'href' || lower === 'xlink:href') {
      if (internal(value) || (el === 'image' && safeDataImage(value))) out.push([name, value.trim()]);
      else count(el === 'image' ? 'imagen externa' : 'enlace externo');
      continue;
    }
    // Atributos de otros espacios de nombres (inkscape:, sodipodi:…) y nombres raros.
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) continue;
    // Todo valor se mira como CSS (los atributos de presentación lo son): `fill="u\72l(https://…)"` también carga.
    if (!safeCss(value)) {
      count(lower === 'style' ? 'estilo con referencias externas o código' : 'valor con referencia externa o código');
      continue;
    }
    out.push([name, value]);
  }
  return out;
}

/**
 * Limpia un SVG. Lanza un error si no es un SVG (o es demasiado grande o profundo para revisarlo).
 */
export function sanitizeSvg(source: string): SanitizedSvg {
  const counts = new Map<string, number>();
  const count = (what: string): void => void counts.set(what, (counts.get(what) ?? 0) + 1);
  const doc = parseXml(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source, MAX_DEPTH);
  const root = doc.children.find((c) => localName(c.name).toLowerCase() === 'svg');
  if (!root) throw new Error('No es un SVG.');
  let nodes = 0;

  const write = (node: XmlNode, depth: number): string => {
    if (++nodes > MAX_NODES) throw new Error('El SVG tiene demasiados elementos.');
    if (depth > MAX_DEPTH) throw new Error('El SVG tiene elementos anidados a demasiada profundidad.');
    const name = localName(node.name);
    const prefix = node.name.includes(':') ? node.name.slice(0, node.name.indexOf(':')) : '';
    const inner = (): string => node.children.map((c) => write(c, depth + 1)).join('');
    if (UNWRAP.has(name) && (prefix === '' || prefix === 'svg')) {
      count(name === 'a' ? 'enlace' : 'elemento condicional');
      return inner();
    }
    // Solo elementos de SVG (sin prefijo, o con el de SVG): `sodipodi:namedview` y compañía no.
    if (!ELEMENTS.has(name) || (prefix !== '' && prefix !== 'svg')) {
      count(name === 'script' ? 'script' : name === 'foreignObject' ? 'foreignObject' : 'elemento no permitido');
      return '';
    }
    const attrs = cleanAttrs(name, node.attrs, count);
    if (name === 'svg' && node === root && !attrs.some(([k]) => k.toLowerCase() === 'xmlns')) attrs.unshift(['xmlns', 'http://www.w3.org/2000/svg']);
    const open = `<${name}${attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')}`;
    let text = TEXTUAL.has(name) ? node.text : '';
    if (name === 'style' && !safeCss(text)) {
      count('estilo con referencias externas o código');
      text = '';
    }
    const children = inner();
    return text === '' && children === '' ? `${open}/>` : `${open}>${esc(text)}${children}</${name}>`;
  };

  const svg = write(root, 0);
  return { svg, removed: [...counts].map(([what, n]) => (n > 1 ? `${what} ×${n}` : what)) };
}
