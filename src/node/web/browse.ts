/**
 * Leer una página web de un dominio de confianza (`AGENDA_TRUSTED_HOSTS`) y sacar de su HTML las imágenes y los
 * enlaces, para que un modelo "navegue": mira qué hay, elige y pide importar una. No ejecuta JavaScript: una galería
 * que carga sus imágenes con scripts sale vacía o incompleta. Lo que dice la página es texto no confiable: acá solo
 * se extraen direcciones y textos cortos y limpios.
 */
import { decodeEntities } from '../../core/assets/xml';
import type { SourceContext } from './sources/types';
import { str } from './sources/types';

export interface PageImage {
  url: string;
  /** El texto alternativo (limpio y corto). */
  alt: string;
  width: number;
  height: number;
  /** De dónde se sacó: una etiqueta `img`, un `srcset`, un enlace directo a un archivo, o los metadatos de la página. */
  via: 'img' | 'srcset' | 'anchor' | 'meta';
  format: 'jpeg' | 'png' | 'svg' | 'other';
}

export interface PageLink {
  url: string;
  text: string;
}

export interface PageContents {
  title: string;
  images: PageImage[];
  links: PageLink[];
}

export const PAGE_MAX_BYTES = 3 * 1024 * 1024;
const MAX_TAGS = 30_000;
const MAX_IMAGES = 300;
const MAX_LINKS = 80;

/** Las propiedades de una etiqueta, con los nombres en minúsculas y los valores sin entidades. */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  // Se salta el nombre de la etiqueta.
  const body = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[1]!.toLowerCase();
    if (!(name in out)) out[name] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

function resolve(raw: string | undefined, base: URL): string | null {
  const v = (raw ?? '').trim();
  if (!v || /^(?:data|javascript|mailto|tel|blob):/i.test(v) || v.startsWith('#')) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function formatOf(url: string): PageImage['format'] {
  const ext = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(new URL(url).pathname + new URL(url).search)?.[1]?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : ext === 'svg' ? 'svg' : 'other';
}

const IMAGE_EXT = /\.(?:jpe?g|png|svg|webp|gif|avif)$/i;

/** El candidato más grande de un `srcset` («a.jpg 480w, b.jpg 1080w»). */
function largestOfSrcset(srcset: string): string | null {
  let best: { url: string; size: number } | null = null;
  for (const part of srcset.split(/,\s+(?=\S)|,$/)) {
    const [url, desc] = part.trim().split(/\s+/);
    if (!url) continue;
    const size = desc ? parseFloat(desc) : 1;
    if (!best || size > best.size) best = { url, size: Number.isFinite(size) ? size : 1 };
  }
  return best?.url ?? null;
}

/** Saca de un HTML las imágenes y los enlaces (con direcciones absolutas), en el orden de la página y sin repetir. */
export function extractPage(html: string, pageUrl: URL): PageContents {
  let base = pageUrl;
  const title = str(decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''), 160);
  const images = new Map<string, PageImage>();
  const links = new Map<string, PageLink>();
  const add = (raw: string | undefined, via: PageImage['via'], extra: Partial<Pick<PageImage, 'alt' | 'width' | 'height'>> = {}): void => {
    const url = resolve(raw, base);
    if (!url || images.has(url) || images.size >= MAX_IMAGES) return;
    images.set(url, { url, alt: extra.alt ?? '', width: extra.width ?? 0, height: extra.height ?? 0, via, format: formatOf(url) });
  };
  const dim = (v: string | undefined): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : 0;
  };

  let count = 0;
  const tagRe = /<(img|source|a|meta|link|base)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  // Primero el <base>, que cambia cómo se resuelve todo lo demás.
  const baseTag = /<base\b[^>]*>/i.exec(html);
  if (baseTag) {
    const href = resolve(attributes(baseTag[0]).href, pageUrl);
    if (href) base = new URL(href);
  }
  while ((m = tagRe.exec(html)) && count++ < MAX_TAGS) {
    const name = m[1]!.toLowerCase();
    const a = attributes(m[0]);
    if (name === 'img' || name === 'source') {
      const alt = str(a.alt, 120);
      const srcset = a.srcset ?? a['data-srcset'];
      const fromSet = srcset ? largestOfSrcset(srcset) : null;
      const plain = a.src ?? a['data-src'] ?? a['data-original'] ?? a['data-lazy-src'];
      if (fromSet) add(fromSet, 'srcset', { alt, width: dim(a.width), height: dim(a.height) });
      if (plain && name === 'img') add(plain, 'img', { alt, width: dim(a.width), height: dim(a.height) });
    } else if (name === 'meta') {
      const prop = (a.property ?? a.name ?? '').toLowerCase();
      if (prop === 'og:image' || prop === 'og:image:url' || prop === 'twitter:image' || prop === 'twitter:image:src') add(a.content, 'meta');
    } else if (name === 'link') {
      if ((a.rel ?? '').toLowerCase().includes('image_src')) add(a.href, 'meta');
    } else if (name === 'a') {
      const href = resolve(a.href, base);
      if (!href) continue;
      if (IMAGE_EXT.test(new URL(href).pathname)) add(href, 'anchor');
      else if (links.size < MAX_LINKS && !links.has(href)) {
        // El texto del enlace: lo que sigue hasta el cierre, sin etiquetas.
        const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
        const text = str(decodeEntities(after.split(/<\/a\s*>/i)[0]!.replace(/<[^>]*>/g, ' ')), 100);
        links.set(href, { url: href, text });
      }
    }
  }
  return { title, images: [...images.values()], links: [...links.values()] };
}

/** Baja una página de un dominio de confianza y saca sus imágenes y enlaces. */
export async function browsePage(rawUrl: string, ctx: SourceContext): Promise<PageContents & { finalUrl: string }> {
  const res = await ctx.http.get(rawUrl, { allow: [], trusted: ctx.trusted, headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }, maxBytes: PAGE_MAX_BYTES, timeoutMs: 20_000, accept: (t) => t === '' || t.includes('html') || t.includes('xml') });
  const html = new TextDecoder('utf-8').decode(res.body);
  const raw = new URL(rawUrl);
  const final = new URL(res.url);
  // Sin redirección, la dirección pedida (con su consulta) es la base; con ella, la final (sin consulta).
  const base = raw.host === final.host && raw.pathname === final.pathname ? raw : final;
  return { ...extractPage(html, base), finalUrl: res.url };
}
