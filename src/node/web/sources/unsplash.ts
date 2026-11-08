/**
 * Unsplash (api.unsplash.com): fotos con la licencia de Unsplash. Pide una clave de acceso en
 * `UNSPLASH_ACCESS_KEY`. Sus condiciones piden avisar cada descarga y nombrar al fotógrafo.
 */
import { httpsUrl, int, isObject, licenseAllowed, str, type ImageHit, type ImageSource, type SearchRequest, type SourceContext } from './types';

const API = 'https://api.unsplash.com';
const LICENSE_URL = 'https://unsplash.com/license';
/** Lo más ancho que se pide al servidor de imágenes. */
const MAX_WIDTH = 4000;
const UTM = { utm_source: 'heritage_studio', utm_medium: 'referral' } as const;

const withUtm = (url: string | null): string | null => {
  if (!url) return null;
  const u = new URL(url);
  for (const [k, v] of Object.entries(UTM)) u.searchParams.set(k, v);
  return u.toString();
};

export function unsplashHit(raw: unknown): ImageHit | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id, 40);
  const urls = isObject(raw.urls) ? raw.urls : {};
  const raws = httpsUrl(urls.raw);
  if (!/^[\w-]+$/.test(id) || !raws) return null;
  const w = int(raw.width);
  const h = int(raw.height);
  const k = Math.min(1, MAX_WIDTH / Math.max(w, 1));
  const file = new URL(raws);
  file.searchParams.set('w', String(Math.min(MAX_WIDTH, w || MAX_WIDTH)));
  file.searchParams.set('fm', 'jpg');
  file.searchParams.set('q', '90');
  file.searchParams.set('fit', 'max');
  const user = isObject(raw.user) ? raw.user : {};
  const links = isObject(raw.links) ? raw.links : {};
  const userLinks = isObject(user.links) ? user.links : {};
  const name = str(user.name, 200) || str(user.username, 100);
  const description = str(raw.description, 200) || str(raw.alt_description, 200);
  const landing = withUtm(httpsUrl(links.html));
  return {
    id: `unsplash:${id}`,
    provider: 'unsplash',
    title: description,
    creator: name,
    creatorUrl: withUtm(httpsUrl(userLinks.html)),
    license: 'Unsplash License',
    licenseKind: 'unsplash',
    licenseUrl: LICENSE_URL,
    landingUrl: landing,
    width: Math.round(w * k),
    height: Math.round(h * k),
    thumbUrl: httpsUrl(urls.small) ?? httpsUrl(urls.thumb),
    fileUrl: file.toString(),
    fileKind: 'full',
    format: 'jpeg',
    attribution: `Foto de ${name || 'un autor'} en Unsplash${landing ? `, ${landing}` : ''}`,
    downloadPing: httpsUrl(links.download_location),
  };
}

const headers = (ctx: SourceContext): Record<string, string> => {
  const k = ctx.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!k) throw new Error('Falta la clave de Unsplash: ponela en la variable de entorno UNSPLASH_ACCESS_KEY.');
  return { authorization: `Client-ID ${k}`, 'accept-version': 'v1', accept: 'application/json' };
};

async function getJson(url: string, ctx: SourceContext): Promise<unknown> {
  const res = await ctx.http.get(url, { allow: ['api.unsplash.com'], headers: headers(ctx), maxBytes: 2 * 1024 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('json') });
  try {
    return JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('Unsplash devolvió una respuesta que no es JSON.');
  }
}

export const unsplash: ImageSource = {
  id: 'unsplash',
  needs: 'la variable de entorno UNSPLASH_ACCESS_KEY',
  ready: (env) => Boolean(env.UNSPLASH_ACCESS_KEY?.trim()),
  async search(q: SearchRequest, ctx) {
    // Unsplash tiene fotos, no dibujos vectoriales.
    if (q.type === 'vector') return { hits: [], total: 0 };
    const p = new URLSearchParams({ query: q.query, page: String(q.page), per_page: String(Math.min(30, Math.max(1, q.limit * 2))), content_filter: 'high' });
    if (q.orientation) p.set('orientation', q.orientation === 'horizontal' ? 'landscape' : q.orientation === 'vertical' ? 'portrait' : 'squarish');
    const body = await getJson(`${API}/search/photos?${p}`, ctx);
    const rows = isObject(body) && Array.isArray(body.results) ? body.results : [];
    const hits = rows
      .map(unsplashHit)
      .filter((h): h is ImageHit => h !== null)
      .filter((h) => licenseAllowed(q.license, h.licenseKind))
      .filter((h) => q.minWidth === undefined || h.width >= q.minWidth);
    return { hits, total: isObject(body) && typeof body.total === 'number' ? body.total : null };
  },
  async fetchOne(rawId, ctx) {
    if (!/^[\w-]+$/.test(rawId)) throw new Error('Identificador de Unsplash inválido.');
    const hit = unsplashHit(await getJson(`${API}/photos/${rawId}`, ctx));
    if (!hit) throw new Error('Unsplash no devolvió la ficha de esa foto.');
    return hit;
  },
  async downloaded(hit, ctx) {
    if (!hit.downloadPing) return;
    // Solo cuenta la descarga: la respuesta no se usa.
    await ctx.http.get(hit.downloadPing, { allow: ['api.unsplash.com'], headers: headers(ctx), maxBytes: 64 * 1024, timeoutMs: 8_000 });
  },
};
