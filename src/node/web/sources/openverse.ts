/**
 * Openverse (api.openverse.org): imágenes con licencias abiertas (Creative Commons y dominio público),
 * sin clave. Los archivos originales están en miles de sitios; solo se bajan de los dominios permitidos
 * (Wikimedia, Flickr…): de los demás se usa la copia reducida que sirve el propio Openverse.
 */
import { hostAllowed } from '../guard';
import { httpsUrl, int, isObject, licenseAllowed, str, type ImageHit, type ImageSource, type LicenseKind, type SearchRequest, type SourceContext } from './types';

const API = 'https://api.openverse.org/v1/images/';

const LICENSE_PARAM: Record<SearchRequest['license'], string | null> = { any: null, free: 'cc0,pdm,by', cc0: 'cc0,pdm', by: 'by' };

function kindOf(license: string): LicenseKind {
  switch (license.toLowerCase()) {
    case 'cc0':
      return 'cc0';
    case 'pdm':
      return 'pdm';
    case 'by':
      return 'by';
    case 'by-sa':
      return 'by-sa';
    case 'by-nc':
    case 'by-nc-sa':
    case 'by-nc-nd':
      return 'by-nc';
    default:
      return 'cc-other';
  }
}

function licenseName(license: string, version: string): string {
  const l = license.toLowerCase();
  if (l === 'cc0') return 'CC0 1.0';
  if (l === 'pdm') return 'Public Domain Mark 1.0';
  return `CC ${license.toUpperCase()}${version ? ` ${version}` : ''}`;
}

function licenseUrl(license: string, version: string, given: string | null): string | null {
  if (given) return given;
  const l = license.toLowerCase();
  if (l === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  if (l === 'pdm') return 'https://creativecommons.org/publicdomain/mark/1.0/';
  return /^[a-z-]+$/.test(l) && /^[\d.]+$/.test(version) ? `https://creativecommons.org/licenses/${l}/${version}/` : null;
}

/** Una imagen de la respuesta de Openverse; `null` si le falta lo indispensable. */
export function openverseHit(raw: unknown, fileHosts: readonly string[]): ImageHit | null {
  if (!isObject(raw)) return null;
  const rawId = str(raw.id, 80);
  if (!/^[0-9a-f-]{8,}$/i.test(rawId)) return null;
  const license = str(raw.license, 20);
  if (!license) return null;
  const version = str(raw.license_version, 10);
  const original = httpsUrl(raw.url);
  const thumb = httpsUrl(raw.thumbnail);
  const host = original ? new URL(original).hostname : '';
  const full = original !== null && hostAllowed(host, fileHosts);
  // La copia reducida también tiene que estar en un dominio permitido (si no, el resultado se listaría y no se podría importar).
  const thumbOk = thumb !== null && hostAllowed(new URL(thumb).hostname, fileHosts);
  const fileUrl = full ? original : thumbOk ? thumb : null;
  if (!fileUrl) return null;
  const type = str(raw.filetype, 10).toLowerCase();
  const format = type === 'jpg' || type === 'jpeg' ? 'jpeg' : type === 'png' ? 'png' : type === 'svg' ? 'svg' : 'other';
  const title = str(raw.title);
  const creator = str(raw.creator, 200);
  const name = licenseName(license, version);
  const landing = httpsUrl(raw.foreign_landing_url);
  return {
    id: `openverse:${rawId}`,
    provider: 'openverse',
    title,
    creator,
    creatorUrl: httpsUrl(raw.creator_url),
    license: name,
    licenseKind: kindOf(license),
    licenseUrl: licenseUrl(license, version, httpsUrl(raw.license_url)),
    landingUrl: landing,
    width: int(raw.width),
    height: int(raw.height),
    thumbUrl: thumb,
    fileUrl,
    fileKind: full ? 'full' : 'preview',
    // La copia reducida de Openverse puede tener otro formato que el original.
    format: full ? format : 'other',
    attribution: `${title ? `“${title}”` : 'Imagen'}${creator ? ` de ${creator}` : ''} (${name})${landing ? `, ${landing}` : ''}`,
  };
}

function params(q: SearchRequest): URLSearchParams {
  const p = new URLSearchParams({ q: q.query, page: String(q.page), page_size: '20', mature: 'false' });
  const license = LICENSE_PARAM[q.license];
  if (license) p.set('license', license);
  if (q.orientation) p.set('aspect_ratio', q.orientation === 'vertical' ? 'tall' : q.orientation === 'horizontal' ? 'wide' : 'square');
  if (q.type === 'vector') p.set('extension', 'svg');
  return p;
}

async function getJson(url: string, ctx: SourceContext): Promise<unknown> {
  const res = await ctx.http.get(url, { allow: ['api.openverse.org'], headers: { accept: 'application/json' }, maxBytes: 2 * 1024 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('json') });
  try {
    return JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('Openverse devolvió una respuesta que no es JSON.');
  }
}

export const openverse: ImageSource = {
  id: 'openverse',
  needs: 'nada: funciona sin clave',
  ready: () => true,
  async search(q, ctx) {
    const body = await getJson(`${API}?${params(q)}`, ctx);
    const results = isObject(body) && Array.isArray(body.results) ? body.results : [];
    const hits = results
      .map((r) => openverseHit(r, ctx.fileHosts))
      .filter((h): h is ImageHit => h !== null)
      .filter((h) => licenseAllowed(q.license, h.licenseKind))
      .filter((h) => q.minWidth === undefined || h.width === 0 || h.width >= q.minWidth)
      .filter((h) => q.type !== 'photo' || h.format !== 'svg');
    return { hits, total: isObject(body) && typeof body.result_count === 'number' ? body.result_count : null };
  },
  async fetchOne(rawId, ctx) {
    if (!/^[0-9a-f-]{8,}$/i.test(rawId)) throw new Error('Identificador de Openverse inválido.');
    const hit = openverseHit(await getJson(`${API}${rawId}/`, ctx), ctx.fileHosts);
    if (!hit) throw new Error('Openverse no devolvió la ficha de esa imagen.');
    return hit;
  },
};
