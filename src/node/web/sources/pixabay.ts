/**
 * Pixabay (pixabay.com/api): fotos e ilustraciones con la licencia de contenido de Pixabay. Pide una
 * clave en `PIXABAY_API_KEY`. La versión más grande que sirve sin permisos especiales mide 1280 px.
 */
import { httpsUrl, int, isObject, licenseAllowed, str, type ImageHit, type ImageSource, type SearchRequest, type SourceContext } from './types';

const API = 'https://pixabay.com/api/';
const LICENSE_URL = 'https://pixabay.com/service/license-summary/';
/** Lo más grande que sirve `largeImageURL`. */
const LARGE_SIDE = 1280;
const LANGS = new Set(['cs', 'da', 'de', 'en', 'es', 'fr', 'id', 'it', 'hu', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'fi', 'sv', 'tr', 'vi', 'th', 'bg', 'ru', 'el', 'ja', 'ko', 'zh']);

export function pixabayHit(raw: unknown): ImageHit | null {
  if (!isObject(raw)) return null;
  const id = typeof raw.id === 'number' ? String(Math.trunc(raw.id)) : str(raw.id, 20);
  const file = httpsUrl(raw.largeImageURL) ?? httpsUrl(raw.webformatURL);
  if (!/^\d+$/.test(id) || !file) return null;
  const w = int(raw.imageWidth);
  const h = int(raw.imageHeight);
  // El archivo que se baja es la versión «large»: como mucho 1280 px de lado mayor.
  const k = Math.min(1, LARGE_SIDE / Math.max(w, h, 1));
  const user = str(raw.user, 100);
  const userId = typeof raw.user_id === 'number' ? String(Math.trunc(raw.user_id)) : '';
  const tags = str(raw.tags, 200)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(', ');
  return {
    id: `pixabay:${id}`,
    provider: 'pixabay',
    title: tags,
    creator: user,
    creatorUrl: user && userId ? `https://pixabay.com/users/${encodeURIComponent(user)}-${userId}/` : null,
    license: 'Pixabay Content License',
    licenseKind: 'pixabay',
    licenseUrl: LICENSE_URL,
    landingUrl: httpsUrl(raw.pageURL),
    width: Math.round(w * k),
    height: Math.round(h * k),
    thumbUrl: httpsUrl(raw.webformatURL) ?? httpsUrl(raw.previewURL),
    fileUrl: file,
    fileKind: 'full',
    format: /\.png(?:$|\?)/i.test(file) ? 'png' : /\.jpe?g(?:$|\?)/i.test(file) ? 'jpeg' : 'other',
    attribution: `Imagen de ${user || 'un autor'} en Pixabay${httpsUrl(raw.pageURL) ? `, ${httpsUrl(raw.pageURL)}` : ''}`,
  };
}

function key(ctx: SourceContext): string {
  const k = ctx.env.PIXABAY_API_KEY?.trim();
  if (!k) throw new Error('Falta la clave de Pixabay: ponela en la variable de entorno PIXABAY_API_KEY.');
  return k;
}

async function getJson(params: URLSearchParams, ctx: SourceContext): Promise<unknown> {
  params.set('key', key(ctx));
  const res = await ctx.http.get(`${API}?${params}`, { allow: ['pixabay.com'], headers: { accept: 'application/json' }, maxBytes: 2 * 1024 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('json') });
  try {
    return JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('Pixabay devolvió una respuesta que no es JSON.');
  }
}

export const pixabay: ImageSource = {
  id: 'pixabay',
  needs: 'la variable de entorno PIXABAY_API_KEY',
  ready: (env) => Boolean(env.PIXABAY_API_KEY?.trim()),
  async search(q: SearchRequest, ctx) {
    // Los vectoriales de Pixabay solo se bajan con permisos especiales: acá serían una foto de muestra.
    if (q.type === 'vector') return { hits: [], total: 0 };
    const p = new URLSearchParams({ q: q.query, image_type: q.type === 'photo' ? 'photo' : 'all', safesearch: 'true', page: String(q.page), per_page: String(Math.min(200, Math.max(3, q.limit * 2))), order: 'popular' });
    if (q.orientation === 'horizontal' || q.orientation === 'vertical') p.set('orientation', q.orientation);
    if (q.minWidth) p.set('min_width', String(q.minWidth));
    if (q.lang && LANGS.has(q.lang)) p.set('lang', q.lang);
    const body = await getJson(p, ctx);
    const rows = isObject(body) && Array.isArray(body.hits) ? body.hits : [];
    const hits = rows
      .map(pixabayHit)
      .filter((h): h is ImageHit => h !== null)
      .filter((h) => licenseAllowed(q.license, h.licenseKind))
      .filter((h) => q.orientation !== 'square' || (h.width > 0 && Math.abs(h.width / h.height - 1) < 0.1));
    return { hits, total: isObject(body) && typeof body.totalHits === 'number' ? body.totalHits : null };
  },
  async fetchOne(rawId, ctx) {
    if (!/^\d+$/.test(rawId)) throw new Error('Identificador de Pixabay inválido.');
    const body = await getJson(new URLSearchParams({ id: rawId }), ctx);
    const hit = isObject(body) && Array.isArray(body.hits) ? pixabayHit(body.hits[0]) : null;
    if (!hit) throw new Error('Pixabay no devolvió la ficha de esa imagen.');
    return hit;
  },
};
