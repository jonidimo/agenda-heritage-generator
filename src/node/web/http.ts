/**
 * Pedidos web del servidor MCP (búsqueda e importación de imágenes y fuentes). Todos pasan por acá:
 * solo `https` y solo los dominios que cada pedido permite (`guard.ts`), en cada redirección también;
 * la conexión se hace a una dirección pública comprobada; hay un tiempo máximo para todo el pedido y un
 * tope de bytes (también ya descomprimido). Los mensajes de error nunca llevan la consulta de la
 * dirección, donde van las claves de las APIs.
 */
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { pipeline, type Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { request as httpRequest } from 'node:http';
import { checkUrl, guardedLookup, isTrusted, redactUrl, WebError, type TrustedHost } from './guard';

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

export interface GetOptions {
  /** Dominios permitidos para este pedido (y para sus redirecciones). */
  allow: readonly string[];
  headers?: Record<string, string>;
  /** Lo más que se acepta de cuerpo, ya descomprimido. */
  maxBytes?: number;
  /** Tiempo máximo de todo el pedido, desde que se abre la conexión hasta el último byte. */
  timeoutMs?: number;
  /** Dominios que la persona declaró de confianza: se visitan aunque sean de su red local, por http o https (ver `AGENDA_TRUSTED_HOSTS`). */
  trusted?: readonly TrustedHost[];
  /** Si no acepta el tipo de contenido que anuncia el servidor, el pedido se corta sin bajar el cuerpo. */
  accept?: (contentType: string) => boolean;
  /** Cancela el pedido (la persona detuvo lo que estaba haciendo): se corta la conexión y no se sigue bajando. */
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  /** Los encabezados, con los nombres en minúsculas. */
  headers: Record<string, string>;
  body: Uint8Array;
  /** La dirección final, sin consulta. */
  url: string;
}

export interface HttpClient {
  get(url: string, opts: GetOptions): Promise<HttpResponse>;
}

/** Lo que devuelve quien hace la conexión: el estado, los encabezados y el cuerpo, que se lee de a pedazos. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
}

/** Quien hace de verdad la conexión (las pruebas ponen uno falso). */
/** `relaxed`: la dirección es de un dominio de confianza de la persona: puede ser local o privada y puede ser `http`. */
export type Transport = (url: URL, init: { headers: Record<string, string>; signal: AbortSignal; relaxed?: boolean }) => Promise<TransportResponse>;

function flatten(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (v !== undefined) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  return out;
}

export interface TransportOptions {
  /** La resolución de nombres de la conexión (por defecto, la que solo deja pasar direcciones públicas). */
  lookup?: LookupFunction;
  /** Certificados de confianza propios (solo las pruebas, con un servidor local). */
  ca?: string;
}

/** La conexión real: `https`, con la resolución de nombres que solo deja pasar direcciones públicas. */
export function createHttpsTransport(options: TransportOptions = {}): Transport {
  const lookup = options.lookup ?? (guardedLookup() as LookupFunction);
  const lanLookup = options.lookup ?? (guardedLookup(undefined, 'lan') as LookupFunction);
  return (url, { headers, signal, relaxed }) =>
    new Promise((resolve, reject) => {
      // Un dominio de confianza se resuelve como siempre (puede ser de la red local) y puede ser http; lo demás, solo https y direcciones públicas.
      const request = relaxed && url.protocol === 'http:' ? httpRequest : httpsRequest;
      const req = request(url, { method: 'GET', headers, signal, agent: false, lookup: relaxed ? lanLookup : lookup, ...(options.ca ? { ca: options.ca } : {}) } as never, (res) => {
        const encoding = String(res.headers['content-encoding'] ?? '').trim().toLowerCase();
        const decoder = encoding === 'gzip' || encoding === 'x-gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
        // `pipeline` pasa los errores del origen al descompresor, que es lo que se lee.
        const body: Readable = decoder ? pipeline(res, decoder, () => undefined) : res;
        resolve({ status: res.statusCode ?? 0, headers: flatten(res.headers), body });
      });
      req.on('error', reject);
      req.end();
    });
}

export const httpsTransport: Transport = createHttpsTransport();

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
/** Encabezados que no viajan a otro servidor cuando una redirección cambia de dominio. */
const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie', 'proxy-authorization'];

export function createHttpClient(opts: { transport?: Transport; userAgent: string }): HttpClient {
  const transport = opts.transport ?? httpsTransport;
  return {
    async get(raw, o) {
      const maxBytes = o.maxBytes ?? DEFAULT_MAX_BYTES;
      const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      // Los dominios de confianza valen solo si el pedido EMPIEZA en uno: un tercero (una ficha, una redirección) no puede llevar a la red propia.
      let trusted: readonly TrustedHost[] | undefined = o.trusted;
      let url = checkUrl(raw, o.allow, trusted);
      if (trusted && !isTrusted(url, trusted)) trusted = undefined;
      const control = new AbortController();
      if (o.signal?.aborted) throw new WebError('aborted', 'Cancelado.');
      const timer = setTimeout(() => control.abort(), timeoutMs);
      const onAbort = (): void => control.abort();
      o.signal?.addEventListener('abort', onAbort, { once: true });
      let headers: Record<string, string> = { 'user-agent': opts.userAgent, 'accept-encoding': 'gzip, deflate, br', ...lowerKeys(o.headers) };
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          const res = await transport(url, { headers, signal: control.signal, relaxed: trusted !== undefined && isTrusted(url, trusted) });
          const location = res.headers['location'];
          if (REDIRECTS.has(res.status) && location) {
            await discard(res.body);
            const next = checkUrl(new URL(location, url).href, o.allow, trusted);
            // Una vez que un salto no es de confianza, los siguientes tampoco.
            if (trusted && !isTrusted(next, trusted)) trusted = undefined;
            if (next.host !== url.host) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !SENSITIVE_HEADERS.includes(k)));
            url = next;
            continue;
          }
          if (res.status === 401 || res.status === 403) {
            await discard(res.body);
            throw new WebError('auth', `${url.host} rechazó el pedido (${res.status}): puede ser la clave de la API, el límite de uso o que el sitio no permita la descarga.`, res.status);
          }
          if (res.status === 429) {
            await discard(res.body);
            throw new WebError('rate-limit', `${url.host} pidió esperar (límite de uso de la API): probá de nuevo más tarde.`, 429);
          }
          if (res.status < 200 || res.status >= 300) {
            await discard(res.body);
            throw new WebError('http', `${url.host} respondió ${res.status} a ${redactUrl(url)}.`, res.status);
          }
          const type = (res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
          if (o.accept && !o.accept(type)) {
            await discard(res.body);
            throw new WebError('bad-type', `${url.host} devolvió «${type || 'sin tipo'}», que no es lo que se esperaba.`);
          }
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes && !res.headers['content-encoding']) {
            await discard(res.body);
            throw new WebError('too-large', `La respuesta de ${url.host} pesa ${mb(declared)} y el máximo es ${mb(maxBytes)}.`);
          }
          const chunks: Uint8Array[] = [];
          let total = 0;
          for await (const chunk of res.body) {
            total += chunk.length;
            if (total > maxBytes) throw new WebError('too-large', `La respuesta de ${url.host} pasa del máximo de ${mb(maxBytes)}.`);
            chunks.push(chunk);
          }
          return { status: res.status, headers: res.headers, body: concat(chunks, total), url: redactUrl(url) };
        }
        throw new WebError('too-many-redirects', `${url.host} redirige demasiadas veces.`);
      } catch (err) {
        if (err instanceof WebError) throw err;
        if (o.signal?.aborted) throw new WebError('aborted', 'Cancelado.');
        if (control.signal.aborted) throw new WebError('timeout', `${url.host} no respondió en ${Math.round(timeoutMs / 1000)} s.`, undefined);
        const code = (err as NodeJS.ErrnoException).code;
        // La resolución de nombres que rechaza una dirección no pública lleva su propio error.
        const cause = (err as { cause?: unknown }).cause;
        if (cause instanceof WebError) throw cause;
        throw new WebError('network', `No se pudo conectar con ${url.host}${code ? ` (${code})` : ''}.`);
      } finally {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

function lowerKeys(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
}

const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Cierra un cuerpo que no se va a leer, para soltar la conexión. */
async function discard(body: AsyncIterable<Uint8Array>): Promise<void> {
  try {
    await body[Symbol.asyncIterator]().return?.();
  } catch {
    // ya estaba cerrado
  }
}
