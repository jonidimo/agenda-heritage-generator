/**
 * Wikimedia Commons (commons.wikimedia.org): millones de archivos con la licencia que declara cada uno, sin clave. La
 * licencia, el autor y la descripción salen de los metadatos del archivo (`extmetadata`).
 */
import { decodeEntities } from '../../../core/assets/xml';
import { httpsUrl, int, isObject, licenseAllowed, str, type ImageHit, type ImageSource, type LicenseKind, type SearchRequest, type SourceContext } from './types';

const API = 'https://commons.wikimedia.org/w/api.php';
const PROPS = 'url|size|mime|extmetadata';

/** El texto de un campo de `extmetadata` (viene con HTML). */
function meta(info: Record<string, unknown>, key: string, max = 300): string {
  const ext = isObject(info.extmetadata) ? info.extmetadata : {};
  const field = isObject(ext[key]) ? ext[key] : {};
  const value = typeof field.value === 'string' ? field.value : '';
  return str(decodeEntities(value.replace(/<[^>]*>/g, ' ')), max);
}

function kindOf(name: string): LicenseKind {
  const n = name.toLowerCase().replace(/[\s_-]+/g, ' ');
  if (/\bcc0\b|cc zero/.test(n)) return 'cc0';
  if (/public domain|\bpd\b|dominio p/.test(n)) return 'pdm';
  if (/\bcc by sa\b/.test(n)) return 'by-sa';
  if (/\bcc by nc\b/.test(n)) return 'by-nc';
  if (/\bcc by\b/.test(n)) return 'by';
  return n ? 'cc-other' : 'unknown';
}

export function wikimediaHit(raw: unknown): ImageHit | null {
  if (!isObject(raw)) return null;
  const pageId = typeof raw.pageid === 'number' ? String(Math.trunc(raw.pageid)) : '';
  const info = Array.isArray(raw.imageinfo) && isObject(raw.imageinfo[0]) ? raw.imageinfo[0] : null;
  const file = info ? httpsUrl(info.url) : null;
  const mime = info && typeof info.mime === 'string' ? info.mime : '';
  if (!/^\d+$/.test(pageId) || !info || !file) return null;
  if (!/^image\/(?:jpeg|png|svg\+xml)$/.test(mime)) return null;
  const licenseName = meta(info, 'LicenseShortName', 100) || meta(info, 'UsageTerms', 100);
  const title = meta(info, 'ObjectName') || str(raw.title, 300).replace(/^File:/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const creator = meta(info, 'Artist', 200);
  const landing = httpsUrl(info.descriptionurl);
  return {
    id: `wikimedia:${pageId}`,
    provider: 'wikimedia',
    title,
    creator,
    creatorUrl: null,
    license: licenseName || 'Licencia no indicada',
    licenseKind: kindOf(licenseName),
    licenseUrl: httpsUrl(meta(info, 'LicenseUrl', 500)),
    landingUrl: landing,
    width: int(info.width),
    height: int(info.height),
    thumbUrl: httpsUrl(info.thumburl),
    fileUrl: file,
    fileKind: 'full',
    format: mime === 'image/png' ? 'png' : mime === 'image/svg+xml' ? 'svg' : 'jpeg',
    attribution: `${title ? `“${title}”` : 'Imagen'}${creator ? ` de ${creator}` : ''} (${licenseName || 'licencia no indicada'})${landing ? `, ${landing}` : ''}`,
  };
}

async function getJson(params: URLSearchParams, ctx: SourceContext): Promise<unknown> {
  params.set('format', 'json');
  params.set('formatversion', '2');
  const res = await ctx.http.get(`${API}?${params}`, { allow: ['commons.wikimedia.org'], headers: { accept: 'application/json' }, maxBytes: 3 * 1024 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('json') });
  try {
    return JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('Wikimedia Commons devolvió una respuesta que no es JSON.');
  }
}

/** Las páginas de la respuesta, en el orden de la búsqueda. */
function pagesOf(body: unknown): unknown[] {
  const pages = isObject(body) && isObject(body.query) && Array.isArray(body.query.pages) ? body.query.pages : [];
  return [...pages].sort((a, b) => (isObject(a) && typeof a.index === 'number' ? a.index : 0) - (isObject(b) && typeof b.index === 'number' ? b.index : 0));
}

export const wikimedia: ImageSource = {
  id: 'wikimedia',
  needs: 'nada: funciona sin clave',
  ready: () => true,
  async search(q: SearchRequest, ctx) {
    const kind = q.type === 'vector' ? 'drawing' : 'bitmap';
    const p = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `${q.query} filetype:${kind}`,
      gsrnamespace: '6',
      gsrlimit: '30',
      gsroffset: String((q.page - 1) * 30),
      prop: 'imageinfo',
      iiprop: PROPS,
      iiurlwidth: '320',
    });
    const body = await getJson(p, ctx);
    const hits = pagesOf(body)
      .map(wikimediaHit)
      .filter((h): h is ImageHit => h !== null)
      .filter((h) => licenseAllowed(q.license, h.licenseKind))
      .filter((h) => q.minWidth === undefined || h.width >= q.minWidth)
      .filter((h) => q.orientation === undefined || (h.width > 0 && h.height > 0 && (q.orientation === 'square' ? Math.abs(h.width / h.height - 1) < 0.1 : q.orientation === 'vertical' ? h.height > h.width : h.width > h.height)));
    return { hits, total: null };
  },
  async fetchOne(rawId, ctx) {
    if (!/^\d+$/.test(rawId)) throw new Error('Identificador de Wikimedia Commons inválido.');
    const body = await getJson(new URLSearchParams({ action: 'query', pageids: rawId, prop: 'imageinfo', iiprop: PROPS, iiurlwidth: '320' }), ctx);
    const hit = wikimediaHit(pagesOf(body)[0]);
    if (!hit) throw new Error('Wikimedia Commons no devolvió la ficha de ese archivo (¿es un PNG, JPEG o SVG?).');
    return hit;
  },
};
