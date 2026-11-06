/**
 * Cómo salen los pedidos del asistente hacia el proveedor desde el navegador: la clave se agrega acá
 * (los adaptadores nunca la ven), con un tiempo máximo por pedido, sin cookies ni referente, y una
 * respuesta que no es 2xx se convierte en un `AiError` con su clase.
 */
import { AiError, httpError } from '@core/ai/errors';
import type { AiProviderId } from '@core/ai/messages';
import { isLocalUrl, PROVIDERS } from '@core/ai/providers';
import type { WireRequest } from '@core/ai/providers/types';
import { getKey } from './keys';

/** Ningún pedido espera más que esto (un modelo pensando mucho, o un servidor colgado). */
export const REQUEST_TIMEOUT_MS = 120_000;
/** Una respuesta más grande que esto no es una conversación: se corta. */
const MAX_RESPONSE_CHARS = 16 * 1024 * 1024;

/** La señal de la persona («Detener») y el tiempo máximo, juntos. */
function withTimeout(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length > MAX_RESPONSE_CHARS) throw new AiError('protocol', 'La respuesta del proveedor es demasiado grande.');
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Un error de un servidor intermedio suele venir en HTML: el estado alcanza para explicarlo.
    if (!res.ok) return null;
    throw new AiError('protocol', 'El proveedor no contestó con JSON.');
  }
}

/** Manda un pedido con la clave del proveedor. Un modelo local (OpenAI compatible en esta computadora) no la necesita. */
export async function sendWeb(provider: AiProviderId, wire: WireRequest, signal: AbortSignal): Promise<unknown> {
  const adapter = PROVIDERS[provider];
  const key = getKey(provider);
  if (!key && !(provider === 'openai' && isLocalUrl(wire.url))) throw new AiError('auth', 'Falta la clave de API.');
  const headers: Record<string, string> = { ...wire.headers, ...(key ? { [adapter.auth.header]: `${adapter.auth.prefix}${key}` } : {}) };
  let res: Response;
  try {
    res = await fetch(wire.url, { method: wire.method, headers, ...(wire.body !== undefined ? { body: wire.body } : {}), signal: withTimeout(signal), credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  } catch (err) {
    if (signal.aborted) throw new AiError('aborted', 'Cancelado.');
    if ((err as { name?: string }).name === 'TimeoutError') throw new AiError('timeout', 'El proveedor no contestó a tiempo.');
    // En el navegador, un pedido bloqueado por CORS o sin red llega igual: un TypeError sin detalles.
    throw new AiError('network', (err as Error).message);
  }
  const json = await readJson(res);
  if (!res.ok) throw httpError(res.status, json, res.headers);
  return json;
}
