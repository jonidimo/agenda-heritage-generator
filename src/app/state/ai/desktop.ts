/**
 * El asistente en la aplicación de escritorio: la clave la guarda el proceso principal, cifrada por el
 * sistema, y los pedidos al proveedor salen por él (`app://heritage/_sys/ai/*`), que agrega la clave. La
 * página nunca vuelve a ver una clave guardada: solo sabe si la hay.
 */
import { AiError, httpError } from '@core/ai/errors';
import type { AiProviderId } from '@core/ai/messages';
import type { WireRequest } from '@core/ai/providers/types';

export interface DesktopAiStatus {
  hasKey: Record<AiProviderId, boolean>;
  baseUrls: Record<AiProviderId, string>;
  encryption: { available: boolean; backend: string; weak: boolean };
}

let cached: DesktopAiStatus | null = null;

/** Lo último que se supo (o `null` si todavía no se preguntó). */
export const desktopStatusCached = (): DesktopAiStatus | null => cached;

async function call(method: 'GET' | 'PUT', body?: unknown): Promise<DesktopAiStatus> {
  const res = await fetch('/_sys/ai/config', { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
  if (!res.ok) throw new AiError('protocol', `No se pudo guardar (HTTP ${res.status}).`);
  cached = (await res.json()) as DesktopAiStatus;
  return cached;
}

export const desktopStatus = (): Promise<DesktopAiStatus> => call('GET');
export const desktopSaveKey = (provider: AiProviderId, key: string | null): Promise<DesktopAiStatus> => call('PUT', { keys: { [provider]: key } });
export const desktopSaveBase = (provider: AiProviderId, baseUrl: string): Promise<DesktopAiStatus> => call('PUT', { baseUrls: { [provider]: baseUrl } });

/** Antes de hablar con un proveedor: el proceso principal tiene que conocer la dirección elegida (solo manda la clave ahí). */
export async function ensureDesktopBase(provider: AiProviderId, baseUrl: string): Promise<void> {
  const status = cached ?? (await desktopStatus());
  if ((status.baseUrls[provider] ?? '') !== baseUrl.replace(/\/+$/, '')) await desktopSaveBase(provider, baseUrl);
}

/** Manda un pedido al proveedor por el proceso principal; la respuesta llega tal como la dio el proveedor. */
export async function sendDesktop(provider: AiProviderId, wire: WireRequest, signal: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch('/_sys/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, url: wire.url, method: wire.method, headers: wire.headers, ...(wire.body !== undefined ? { body: wire.body } : {}) }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw new AiError('aborted', 'Cancelado.');
    throw new AiError('network', (err as Error).message);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    if (res.ok) throw new AiError('protocol', 'El proveedor no contestó con JSON.');
  }
  if (!res.ok) throw httpError(res.status, json, res.headers);
  return json;
}
