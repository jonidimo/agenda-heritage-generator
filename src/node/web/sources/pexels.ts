/**
 * Pexels (api.pexels.com): fotos con la licencia de Pexels. Pide una clave gratuita en `PEXELS_API_KEY`
 * (se manda tal cual en el encabezado `Authorization`).
 */
import { httpsUrl, int, isObject, licenseAllowed, str, type ImageHit, type ImageSource, type SearchRequest, type SourceContext } from './types';

const API = 'https://api.pexels.com/v1';

export function pexelsHit(raw: unknown): ImageHit | null {
  if (!isObject(raw)) return null;
  const id = typeof raw.id === 'number' ? String(Math.trunc(raw.id)) : str(raw.id, 20);
  const src = isObject(raw.src) ? raw.src : {};
  const file = httpsUrl(src.original) ?? httpsUrl(src.large2x);
  if (!/^\d+$/.test(id) || !file) return null;
  const photographer = str(raw.photographer, 200);
  const landing = httpsUrl(raw.url);
  const alt = str(raw.alt, 200);
  return {
    id: `pexels:${id}`,
    provider: 'pexels',
    title: alt,
    creator: photographer,
    creatorUrl: httpsUrl(raw.photographer_url),
    license: 'Licencia de Pexels',
    licenseKind: 'pexels',
    licenseUrl: 'https://www.pexels.com/license/',
    landingUrl: landing,
    width: int(raw.width),
    height: int(raw.height),
    thumbUrl: httpsUrl(src.medium) ?? httpsUrl(src.small),
    fileUrl: file,
    fileKind: 'full',
    format: /\.png(?:$|\?)/i.test(file) ? 'png' : 'jpeg',
    attribution: `Foto de ${photographer || 'un autor'} en Pexels${landing ? `, ${landing}` : ''}`,
  };
}

async function getJson(url: string, ctx: SourceContext): Promise<unknown> {
  const key = ctx.env.PEXELS_API_KEY?.trim();
  if (!key) throw new Error('Falta la clave de Pexels: ponela en la variable de entorno PEXELS_API_KEY.');
  const res = await ctx.http.get(url, { allow: ['api.pexels.com'], headers: { authorization: key, accept: 'application/json' }, maxBytes: 2 * 1024 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('json') });
  try {
    return JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('Pexels devolvió una respuesta que no es JSON.');
  }
}

export const pexels: ImageSource = {
  id: 'pexels',
  needs: 'la variable de entorno PEXELS_API_KEY',
  ready: (env) => Boolean(env.PEXELS_API_KEY?.trim()),
  async search(q: SearchRequest, ctx) {
    if (q.type === 'vector') return { hits: [], total: 0 };
    const p = new URLSearchParams({ query: q.query, page: String(q.page), per_page: String(Math.min(80, Math.max(1, q.limit * 2))) });
    if (q.orientation) p.set('orientation', q.orientation === 'horizontal' ? 'landscape' : q.orientation === 'vertical' ? 'portrait' : 'square');
    if (q.lang) p.set('locale', q.lang);
    const body = await getJson(`${API}/search?${p}`, ctx);
    const rows = isObject(body) && Array.isArray(body.photos) ? body.photos : [];
    const hits = rows
      .map(pexelsHit)
      .filter((h): h is ImageHit => h !== null)
      .filter((h) => licenseAllowed(q.license, h.licenseKind))
      .filter((h) => q.minWidth === undefined || h.width >= q.minWidth);
    return { hits, total: isObject(body) && typeof body.total_results === 'number' ? body.total_results : null };
  },
  async fetchOne(rawId, ctx) {
    if (!/^\d+$/.test(rawId)) throw new Error('Identificador de Pexels inválido.');
    const hit = pexelsHit(await getJson(`${API}/photos/${rawId}`, ctx));
    if (!hit) throw new Error('Pexels no devolvió la ficha de esa foto.');
    return hit;
  },
};
