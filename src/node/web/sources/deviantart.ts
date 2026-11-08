/**
 * DeviantArt (www.deviantart.com/api): arte de su comunidad. Pide una aplicación registrada (cliente y secreto) en
 * `DEVIANTART_CLIENT_ID` y `DEVIANTART_CLIENT_SECRET`; se entra con «client credentials». DeviantArt no declara una
 * licencia por obra en la API: queda a cargo de quien lo usa revisar la de cada una.
 */
import { httpsUrl, int, isObject, licenseAllowed, str, type ImageHit, type ImageSource, type SearchRequest, type SourceContext } from './types';

const API = 'https://www.deviantart.com/api/v1/oauth2';
const TOKEN_URL = 'https://www.deviantart.com/oauth2/token';

/** El token de acceso, por contexto (en memoria: no se guarda en la caché del disco). */
const tokens = new WeakMap<SourceContext, { token: string; until: number }>();

async function accessToken(ctx: SourceContext): Promise<string> {
  const have = tokens.get(ctx);
  if (have && have.until > Date.now() + 30_000) return have.token;
  const id = ctx.env.DEVIANTART_CLIENT_ID?.trim();
  const secret = ctx.env.DEVIANTART_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('Faltan las credenciales de DeviantArt: DEVIANTART_CLIENT_ID y DEVIANTART_CLIENT_SECRET.');
  const res = await ctx.http.get(`${TOKEN_URL}?${new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret })}`, { allow: ['www.deviantart.com'], headers: { accept: 'application/json' }, maxBytes: 64 * 1024, timeoutMs: 15_000, accept: (t) => t.includes('json') });
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('DeviantArt devolvió una respuesta que no es JSON al pedir el acceso.');
  }
  const token = isObject(body) && typeof body.access_token === 'string' ? body.access_token : '';
  if (!token) throw new Error('DeviantArt no dio el acceso: revisá DEVIANTART_CLIENT_ID y DEVIANTART_CLIENT_SECRET.');
  const seconds = isObject(body) && typeof body.expires_in === 'number' ? body.expires_in : 3000;
  tokens.set(ctx, { token, until: Date.now() + seconds * 1000 });
  return token;
}

export function deviantartHit(raw: unknown): ImageHit | null {
  if (!isObject(raw)) return null;
  const id = str(raw.deviationid, 60);
  const content = isObject(raw.content) ? raw.content : null;
  const file = content ? httpsUrl(content.src) : null;
  if (!/^[0-9A-Fa-f-]{16,}$/.test(id) || !file) return null;
  const thumbs = Array.isArray(raw.thumbs) ? raw.thumbs.filter(isObject) : [];
  const thumb = thumbs.length > 0 ? httpsUrl(thumbs[thumbs.length - 1]!.src) : null;
  const author = isObject(raw.author) ? str(raw.author.username, 100) : '';
  const title = str(raw.title, 200);
  const landing = httpsUrl(raw.url);
  return {
    id: `deviantart:${id}`,
    provider: 'deviantart',
    title,
    creator: author,
    creatorUrl: author ? `https://www.deviantart.com/${encodeURIComponent(author)}` : null,
    license: 'Según su autor (DeviantArt)',
    licenseKind: 'unknown',
    licenseUrl: null,
    landingUrl: landing,
    width: content ? int(content.width) : 0,
    height: content ? int(content.height) : 0,
    thumbUrl: thumb,
    fileUrl: file,
    fileKind: 'full',
    format: /\.png(?:$|\?)/i.test(file) ? 'png' : /\.jpe?g(?:$|\?)/i.test(file) ? 'jpeg' : 'other',
    attribution: `“${title || 'Obra'}” de ${author || 'un autor'} en DeviantArt${landing ? `, ${landing}` : ''}`,
  };
}

async function getJson(path: string, params: URLSearchParams, ctx: SourceContext): Promise<unknown> {
  const token = await accessToken(ctx);
  const res = await ctx.http.get(`${API}${path}?${params}`, { allow: ['www.deviantart.com'], headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, maxBytes: 2 * 1024 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('json') });
  try {
    return JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('DeviantArt devolvió una respuesta que no es JSON.');
  }
}

export const deviantart: ImageSource = {
  id: 'deviantart',
  needs: 'las variables de entorno DEVIANTART_CLIENT_ID y DEVIANTART_CLIENT_SECRET',
  ready: (env) => Boolean(env.DEVIANTART_CLIENT_ID?.trim() && env.DEVIANTART_CLIENT_SECRET?.trim()),
  async search(q: SearchRequest, ctx) {
    if (q.type === 'vector') return { hits: [], total: 0 };
    const p = new URLSearchParams({ q: q.query, limit: String(Math.min(24, Math.max(1, q.limit * 2))), offset: String((q.page - 1) * 24), timerange: 'alltime', mature_content: 'false' });
    const body = await getJson('/browse/popular', p, ctx);
    const rows = isObject(body) && Array.isArray(body.results) ? body.results : [];
    const hits = rows
      .map(deviantartHit)
      .filter((h): h is ImageHit => h !== null)
      .filter((h) => licenseAllowed(q.license, h.licenseKind))
      .filter((h) => q.minWidth === undefined || h.width >= q.minWidth)
      .filter((h) => q.orientation === undefined || (h.width > 0 && h.height > 0 && (q.orientation === 'square' ? Math.abs(h.width / h.height - 1) < 0.1 : q.orientation === 'vertical' ? h.height > h.width : h.width > h.height)));
    return { hits, total: null };
  },
  async fetchOne(rawId, ctx) {
    if (!/^[0-9A-Fa-f-]{16,}$/.test(rawId)) throw new Error('Identificador de DeviantArt inválido.');
    const hit = deviantartHit(await getJson(`/deviation/${rawId}`, new URLSearchParams(), ctx));
    if (!hit) throw new Error('DeviantArt no devolvió la imagen de esa obra (¿es una obra visual descargable?).');
    return hit;
  },
};
