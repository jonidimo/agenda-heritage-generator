/**
 * El motor del asistente (se carga recién la primera vez que se usa, para no pesar en el arranque):
 * arma el proveedor, el transporte y el anfitrión de herramientas, y corre un turno.
 */
import { runTurn, settleProposal, type PendingProposal, type ProposalDecision, type TurnEvent, type TurnOutcome } from '@core/ai/loop';
import type { AiMessage, AiProviderId } from '@core/ai/messages';
import { PROVIDERS } from '@core/ai/providers';
import type { ProviderConfig } from '@core/ai/providers/types';
import { appToolHost } from './host';
import { isDesktopShell } from '../desktopBridge';
import { ensureDesktopBase, sendDesktop } from './desktop';
import { sendWeb } from './transport';

export type { PendingProposal, TurnEvent, TurnOutcome };

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
    host: appToolHost(r.vision),
    signal: r.signal,
    onEvent: r.onEvent,
    sleep,
  });
}

export const settle = (history: readonly AiMessage[], pending: PendingProposal, decision: ProposalDecision): AiMessage[] => settleProposal(history, pending, decision);

/** Los modelos que ofrece el proveedor con esta clave (sirve también para comprobar la clave). */
export async function listModels(provider: AiProviderId, baseUrl: string, signal: AbortSignal): Promise<string[]> {
  const adapter = PROVIDERS[provider];
  if (desktop()) await ensureDesktopBase(provider, baseUrl);
  const wire = adapter.models({ ...(baseUrl ? { baseUrl } : {}), surface: desktop() ? 'desktop' : 'web' });
  return adapter.parseModels(await sender(provider)(wire, signal));
}
