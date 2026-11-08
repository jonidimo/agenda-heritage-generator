/**
 * Búsqueda y descarga de imágenes en los servicios de la lista: reparte la búsqueda entre los que están
 * listos, junta los resultados, guarda en la caché lo que ya se pidió, y baja y limpia el archivo de la
 * imagen elegida. Nada de acá escribe en una agenda: eso lo decide la herramienta que lo llama.
 */
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { sanitizeSvg } from '../../core/assets/sanitizeSvg';
import { areaResize } from '../../core/assets/resample';
import { rasterInfo } from '../../core/assets/image';
import { sniffImage } from './prepareImage';
import type { Cache } from './cache';
import { extraHosts, IMAGE_FILE_HOSTS, WebError } from './guard';
import type { HttpClient } from './http';
import { openverse } from './sources/openverse';
import { pixabay } from './sources/pixabay';
import { unsplash } from './sources/unsplash';
import { PROVIDER_IDS, type ImageHit, type ImageSource, type ProviderId, type SearchRequest, type SourceContext } from './sources/types';

export const SOURCES: Readonly<Record<ProviderId, ImageSource>> = { openverse, pixabay, unsplash };

/** El contexto de los servicios: el cliente web, las variables de entorno, la caché y los dominios de archivos. */
export function sourceContext(deps: { http: HttpClient; env: Readonly<Record<string, string | undefined>>; cache: Cache }): SourceContext {
  return { ...deps, fileHosts: [...IMAGE_FILE_HOSTS, ...extraHosts(deps.env.AGENDA_IMAGE_HOSTS)] };
}

export interface SearchReport {
  hits: ImageHit[];
  /** Cómo le fue a cada servicio. */
  services: Array<{ provider: ProviderId; found: number; total: number | null; cached: boolean; error?: string }>;
  /** Servicios que no se usaron porque les falta la clave. */
  notConfigured: Array<{ provider: ProviderId; needs: string }>;
}

function cacheKey(provider: ProviderId, q: SearchRequest): string {
  return JSON.stringify([provider, q.query.toLowerCase(), q.license, q.orientation ?? '', q.minWidth ?? 0, q.type, q.limit, q.page, q.lang ?? '']);
}

/** Busca en los servicios pedidos (o en todos los que están listos). Un servicio que falla no tira a los demás. */
export async function searchImages(q: SearchRequest, providers: readonly ProviderId[] | undefined, ctx: SourceContext): Promise<SearchReport> {
  const wanted = providers && providers.length > 0 ? providers : PROVIDER_IDS.filter((id) => SOURCES[id].ready(ctx.env));
  const notConfigured = wanted.filter((id) => !SOURCES[id].ready(ctx.env)).map((id) => ({ provider: id, needs: SOURCES[id].needs }));
  const active = wanted.filter((id) => SOURCES[id].ready(ctx.env));
  const results = await Promise.all(
    active.map(async (id) => {
      const key = cacheKey(id, q);
      const cached = await ctx.cache.get<{ hits: ImageHit[]; total: number | null }>('search', key);
      if (cached) return { id, ...cached, cached: true as const };
      try {
        const found = await SOURCES[id].search(q, ctx);
        // Lo ya pedido no se vuelve a pedir; las fichas quedan para importar sin buscar de nuevo.
        await ctx.cache.set('search', key, found);
        await Promise.all(found.hits.map((h) => ctx.cache.set('hit', h.id, h)));
        return { id, ...found, cached: false as const };
      } catch (err) {
        return { id, hits: [] as ImageHit[], total: null, cached: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  // Se intercalan los resultados de cada servicio para que uno no tape a los otros.
  const merged: ImageHit[] = [];
  for (let i = 0; merged.length < q.limit && results.some((r) => i < r.hits.length); i++) {
    for (const r of results) if (i < r.hits.length && merged.length < q.limit) merged.push(r.hits[i]!);
  }
  return {
    hits: merged,
    services: results.map((r) => ({ provider: r.id, found: r.hits.length, total: r.total, cached: r.cached, ...('error' in r && r.error ? { error: r.error } : {}) })),
    notConfigured,
  };
}

/** La ficha de una imagen por su id (`servicio:identificador`): de la caché, o del servicio. */
export async function resolveHit(id: string, ctx: SourceContext): Promise<ImageHit> {
  const m = /^(openverse|pixabay|unsplash):(.{1,200})$/.exec(id.trim());
  if (!m) throw new Error('El id de la imagen tiene que ser el que devuelve search_images, como «openverse:…», «pixabay:…» o «unsplash:…».');
  const provider = m[1] as ProviderId;
  const cached = await ctx.cache.get<ImageHit>('hit', `${provider}:${m[2]}`);
  if (cached) return cached;
  const source = SOURCES[provider];
  if (!source.ready(ctx.env)) throw new Error(`${provider} necesita ${source.needs}.`);
  const hit = await source.fetchOne(m[2]!, ctx);
  await ctx.cache.set('hit', hit.id, hit);
  return hit;
}

/** El máximo que se baja de una imagen. */
export const IMAGE_DOWNLOAD_MAX_BYTES = 40 * 1024 * 1024;
export const SVG_MAX_BYTES = 4 * 1024 * 1024;

export interface Downloaded {
  bytes: Uint8Array;
  kind: 'png' | 'jpeg' | 'svg';
  /** Un SVG: lo que se sacó al limpiarlo. */
  removed: string[];
}

/** Baja el archivo de la imagen (solo de los dominios permitidos); un SVG se limpia. */
export async function downloadImage(hit: ImageHit, ctx: SourceContext): Promise<Downloaded> {
  const res = await ctx.http.get(hit.fileUrl, { allow: ctx.fileHosts, headers: { accept: 'image/png,image/jpeg,image/svg+xml,image/*;q=0.5' }, maxBytes: IMAGE_DOWNLOAD_MAX_BYTES, timeoutMs: 60_000, accept: (t) => t.startsWith('image/') || t === 'application/octet-stream' || t === '' });
  const kind = sniffImage(res.body);
  if (!kind) throw new WebError('bad-type', 'El archivo no es una imagen PNG, JPEG o SVG (los WebP, GIF y AVIF no se importan).');
  if (kind === 'svg') {
    if (res.body.length > SVG_MAX_BYTES) throw new WebError('too-large', `El SVG pesa más de ${SVG_MAX_BYTES / 1024 / 1024} MB.`);
    const clean = sanitizeSvg(new TextDecoder().decode(res.body));
    return { bytes: new TextEncoder().encode(clean.svg), kind, removed: clean.removed };
  }
  const head = rasterInfo(res.body);
  if (!head) throw new WebError('bad-type', 'La imagen está dañada.');
  return { bytes: res.body, kind, removed: [] };
}

/** Avisa al servicio de la descarga si lo pide (Unsplash). Un fallo no importa. */
export async function notifyDownload(hit: ImageHit, ctx: SourceContext): Promise<void> {
  try {
    await SOURCES[hit.provider].downloaded?.(hit, ctx);
  } catch {
    // es solo un contador del servicio
  }
}

/** Ancho de las miniaturas que se le muestran al modelo. */
export const THUMB_PX = 320;

/**
 * Una imagen PNG o JPEG achicada a `maxWidth` px de ancho como JPEG liviano (una transparencia se pone sobre
 * blanco), o `null` si no se puede leer.
 */
export function shrinkToJpeg(bytes: Uint8Array, maxWidth: number, quality = 72): Uint8Array | null {
  const kind = sniffImage(bytes);
  const head = kind === 'png' || kind === 'jpeg' ? rasterInfo(bytes) : null;
  if (!head || head.width * head.height >= 40_000_000) return null;
  try {
    const img =
      kind === 'jpeg'
        ? decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40 })
        : (() => {
            const p = PNG.sync.read(Buffer.from(bytes));
            return { data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length), width: p.width, height: p.height };
          })();
    const scale = Math.min(1, maxWidth / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const small = w === img.width ? img.data : areaResize(img.data, img.width, img.height, w, h);
    const flat = new Uint8Array(small.length);
    for (let i = 0; i < small.length; i += 4) {
      const a = small[i + 3]! / 255;
      flat[i] = Math.round(small[i]! * a + 255 * (1 - a));
      flat[i + 1] = Math.round(small[i + 1]! * a + 255 * (1 - a));
      flat[i + 2] = Math.round(small[i + 2]! * a + 255 * (1 - a));
      flat[i + 3] = 255;
    }
    return new Uint8Array(encodeJpeg({ data: flat, width: w, height: h }, quality).data);
  } catch {
    return null;
  }
}

/** La miniatura de una imagen, achicada a ~320 px (JPEG liviano), o `null` si no se pudo. */
export async function fetchThumbnail(hit: ImageHit, ctx: SourceContext): Promise<{ data: Uint8Array; mime: string } | null> {
  if (!hit.thumbUrl) return null;
  try {
    const res = await ctx.http.get(hit.thumbUrl, { allow: ctx.fileHosts, headers: { accept: 'image/jpeg,image/png,image/*;q=0.5' }, maxBytes: 3 * 1024 * 1024, timeoutMs: 15_000, accept: (t) => t.startsWith('image/') });
    const small = shrinkToJpeg(res.body, THUMB_PX);
    if (small) return { data: small, mime: 'image/jpeg' };
    // Un formato que no se decodifica acá (WebP…): se pasa tal cual si es chico.
    const type = res.headers['content-type']?.split(';')[0]?.trim() ?? '';
    return res.body.length <= 150 * 1024 && /^image\/(?:webp|gif|png|jpeg)$/.test(type) ? { data: res.body, mime: type } : null;
  } catch {
    return null;
  }
}
