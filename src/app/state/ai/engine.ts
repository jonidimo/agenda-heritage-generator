/**
 * El motor del asistente (se carga recién la primera vez que se usa, para no pesar en el arranque):
 * arma el proveedor, el transporte y el anfitrión de herramientas, y corre un turno.
 */
import { runTurn, settleProposal, type PendingProposal, type ProposalDecision, type TurnEvent, type TurnOutcome } from '@core/ai/loop';
import type { AiMessage, AiProviderId } from '@core/ai/messages';
import type { Design } from '@core/design/schema';
import { PROVIDERS } from '@core/ai/providers';
import type { ProviderConfig } from '@core/ai/providers/types';
import { AiError } from '@core/ai/errors';
import { appToolHost } from './host';
import { isDesktopShell } from '../desktopBridge';
import { ensureDesktopBase, sendDesktop } from './desktop';
import { sendWeb } from './transport';

export type { PendingProposal, ProposalDecision, TurnEvent, TurnOutcome };

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('Cancelado.'), { name: 'AbortError' }));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(Object.assign(new Error('Cancelado.'), { name: 'AbortError' }))), { once: true });
  });

export interface TurnRequest {
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  vision: boolean;
  /** La propuesta que se está ajustando, si la hay. */
  draft: Design | null;
  history: readonly AiMessage[];
  text: string;
  signal: AbortSignal;
  onEvent: (e: TurnEvent) => void;
}

/** En el escritorio los pedidos salen por el proceso principal (sin las reglas del navegador). */
const desktop = (): boolean => isDesktopShell();

const configOf = (r: { model: string; baseUrl: string }): ProviderConfig => ({ model: r.model, ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}), surface: desktop() ? 'desktop' : 'web' });

const sender = (provider: AiProviderId) => (wire: Parameters<typeof sendWeb>[1], signal: AbortSignal) => (desktop() ? sendDesktop(provider, wire, signal) : sendWeb(provider, wire, signal));

export async function turn(r: TurnRequest): Promise<TurnOutcome> {
  const adapter = PROVIDERS[r.provider];
  if (desktop()) await ensureDesktopBase(r.provider, r.baseUrl);
  return runTurn({
    history: r.history,
    userText: r.text,
    adapter,
    cfg: configOf(r),
    send: sender(r.provider),
    host: appToolHost({ vision: r.vision, signal: r.signal, draft: r.draft }),
    signal: r.signal,
    onEvent: r.onEvent,
    sleep,
  });
}

export const settle = (history: readonly AiMessage[], pending: PendingProposal, decision: ProposalDecision): AiMessage[] => settleProposal(history, pending, decision);

export interface ModelList {
  models: string[];
  /** La misma dirección con `/v1` al final, si la escrita no contestó y esa sí: conviene usarla. */
  suggestedBase?: string;
}

async function fetchModels(provider: AiProviderId, baseUrl: string, signal: AbortSignal): Promise<string[]> {
  const adapter = PROVIDERS[provider];
  if (desktop()) await ensureDesktopBase(provider, baseUrl);
  const wire = adapter.models({ ...(baseUrl ? { baseUrl } : {}), surface: desktop() ? 'desktop' : 'web' });
  return adapter.parseModels(await sender(provider)(wire, signal));
}

/** `http://host:8080` → `http://host:8080/v1` (los servidores compatibles con OpenAI suelen vivir ahí); `null` si ya lo tiene o es la oficial. */
export function withV1(baseUrl: string): string | null {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!clean || /\/v1$/i.test(clean)) return null;
  try {
    new URL(clean);
  } catch {
    return null;
  }
  return `${clean}/v1`;
}

/**
 * Los modelos que ofrece el proveedor con esta clave (sirve también para comprobar la clave). Si la
 * dirección no contesta como API (no existe, o devuelve una página), prueba la misma con `/v1`.
 */
export async function listModels(provider: AiProviderId, baseUrl: string, signal: AbortSignal): Promise<ModelList> {
  try {
    return { models: await fetchModels(provider, baseUrl, signal) };
  } catch (err) {
    const alt = withV1(baseUrl);
    const worthRetry = err instanceof AiError && (err.kind === 'notFound' || err.kind === 'protocol' || err.kind === 'badRequest');
    if (!alt || !worthRetry || signal.aborted) throw err;
    try {
      return { models: await fetchModels(provider, alt, signal), suggestedBase: alt };
    } catch {
      // Lo que falló primero es lo que le sirve a la persona.
      throw err;
    } finally {
      // En el escritorio, la dirección que vale sigue siendo la escrita hasta que la persona elija la otra.
      if (desktop()) await ensureDesktopBase(provider, baseUrl).catch(() => undefined);
    }
  }
}
