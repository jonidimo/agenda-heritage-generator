/**
 * Un turno del asistente: la persona pide algo, el modelo mira la agenda con las herramientas que
 * necesite y termina con una respuesta o con **una** propuesta de cambio. La propuesta no se aplica acá:
 * el turno termina esperando que la persona decida, y esa decisión se le cuenta al modelo
 * (`settleProposal`) antes del turno siguiente, porque los proveedores exigen una respuesta para cada
 * llamada a herramienta.
 *
 * La conversación solo crece hacia adelante. Si algo falla a mitad de un turno, se descarta el turno
 * entero (quien llama conserva la conversación de antes): nunca queda una llamada sin su respuesta.
 */
import { trimHistory, type HistoryBudget } from './budget';
import { AiError, fetchFailure } from './errors';
import type { AiMessage, AiReply, AiToolCall, AiToolResult } from './messages';
import { contextBlock, systemPrompt } from './prompt';
import { withRetry, type Sleep } from './retry';
import type { ProviderAdapter, ProviderConfig, WireRequest } from './providers/types';
import { executeTool, isReadOnlyTool, toolSpecs, type Proposal, type ToolHost } from './tools';

/** Más vueltas que estas en un pedido es un modelo que no encuentra la salida. */
export const MAX_ROUNDS = 8;
/** Tope de salida por respuesta (razonamiento incluido, en los modelos que razonan). */
export const MAX_OUTPUT_TOKENS = 16_000;

/** Manda un pedido y devuelve el JSON de la respuesta, o lanza un `AiError`. */
export type Send = (wire: WireRequest, signal: AbortSignal) => Promise<unknown>;

export type TurnEvent = { type: 'thinking'; round: number } | { type: 'tool'; name: string; input: unknown };

/** La llamada a `propose_change` que espera la decisión de la persona, con las demás respuestas de su misma ronda. */
export interface PendingProposal {
  callId: string;
  name: string;
  /** Las respuestas de las otras llamadas que el modelo hizo en la misma ronda. */
  others: AiToolResult[];
}

export type TurnOutcome =
  | { kind: 'answer'; text: string; history: AiMessage[] }
  | { kind: 'proposal'; text: string; proposal: Proposal; pending: PendingProposal; history: AiMessage[] };

export interface TurnInput {
  history: readonly AiMessage[];
  userText: string;
  adapter: ProviderAdapter;
  cfg: ProviderConfig;
  send: Send;
  host: ToolHost;
  signal: AbortSignal;
  onEvent?: (e: TurnEvent) => void;
  budget?: HistoryBudget;
  /** Para esperar entre reintentos cuando el proveedor está saturado; sin ella, no se reintenta. */
  sleep?: Sleep;
}

const textResult = (call: AiToolCall, text: string, isError = false): AiToolResult => ({ callId: call.id, name: call.name, content: [{ type: 'text', text }], ...(isError ? { isError } : {}) });

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new AiError('aborted', 'Cancelado.');
}

function parseReply(adapter: ProviderAdapter, json: unknown): AiReply {
  try {
    return adapter.parseChat(json);
  } catch (err) {
    throw new AiError('protocol', (err as Error).message);
  }
}

export async function runTurn(input: TurnInput): Promise<TurnOutcome> {
  const { adapter, cfg, send, host, signal, onEvent } = input;
  const last = input.history.at(-1);
  if (last?.role === 'assistant' && last.toolCalls.length > 0) throw new AiError('protocol', 'Hay una propuesta sin decidir: se decide antes de pedir otra cosa.');
  const ctx = host.context();
  const system = systemPrompt(ctx.uiLanguage, host.render !== undefined);
  const tools = toolSpecs(host);
  const messages: AiMessage[] = [...input.history, { role: 'user', parts: [{ type: 'text', text: contextBlock(ctx) }, { type: 'text', text: input.userText }] }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    checkAbort(signal);
    onEvent?.({ type: 'thinking', round });
    const wire = adapter.chat({ system, messages: trimHistory(messages, input.budget), tools, maxTokens: MAX_OUTPUT_TOKENS }, cfg);
    const json = input.sleep ? await withRetry(() => send(wire, signal), signal, input.sleep) : await send(wire, signal).catch((err: unknown) => Promise.reject(fetchFailure(err)));
    const reply = parseReply(adapter, json);
    if (reply.stop === 'refusal') throw new AiError('refusal', reply.text || 'El modelo no quiso hacer este pedido.');
    messages.push({ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls, ...(reply.raw ? { raw: reply.raw } : {}) });
    if (reply.toolCalls.length === 0) {
      if (reply.stop === 'length') throw new AiError('length', 'La respuesta se cortó por larga.');
      return { kind: 'answer', text: reply.text, history: messages };
    }

    // Las llamadas que solo leen van juntas; las que mueven la vista o proponen, en orden.
    const results = new Map<string, AiToolResult>();
    const found: { proposal: Proposal; call: AiToolCall }[] = [];
    const run = async (call: AiToolCall): Promise<void> => {
      checkAbort(signal);
      if (call.inputError) return void results.set(call.id, textResult(call, call.inputError, true));
      if (call.name === 'propose_change' && found.length > 0) return void results.set(call.id, textResult(call, 'Solo una propuesta por turno: esperá a que la persona decida la primera.', true));
      onEvent?.({ type: 'tool', name: call.name, input: call.input });
      const out = await executeTool(call.name, call.input, host);
      if ('proposal' in out) found.push({ proposal: out.proposal, call });
      else results.set(call.id, { callId: call.id, name: call.name, content: out.content, ...(out.isError ? { isError: true } : {}) });
    };
    const parallel = reply.toolCalls.filter((c) => isReadOnlyTool(c.name) && !c.inputError);
    await Promise.all(parallel.map(run));
    for (const call of reply.toolCalls) if (!parallel.includes(call)) await run(call);
    checkAbort(signal);

    const ordered = reply.toolCalls.map((c) => results.get(c.id)).filter((r): r is AiToolResult => r !== undefined);
    const chosen = found[0];
    if (chosen) {
      return { kind: 'proposal', text: reply.text, proposal: chosen.proposal, pending: { callId: chosen.call.id, name: chosen.call.name, others: ordered }, history: messages };
    }
    messages.push({ role: 'tool', results: ordered });
  }
  throw new AiError('rounds', `El modelo no terminó en ${MAX_ROUNDS} vueltas.`);
}

export type ProposalDecision = { applied: true; revision: number } | { applied: false; reason: 'discarded' | 'stale' | 'cancelled' };

/** Le cuenta al modelo qué decidió la persona sobre la propuesta (y las respuestas de su misma ronda). */
export function settleProposal(history: readonly AiMessage[], pending: PendingProposal, decision: ProposalDecision): AiMessage[] {
  const text = JSON.stringify(decision.applied ? { applied: true, revision: decision.revision } : { applied: false, reason: decision.reason });
  const result: AiToolResult = { callId: pending.callId, name: pending.name, content: [{ type: 'text', text }] };
  const last = history.at(-1);
  // El resultado va en el orden de las llamadas de esa ronda.
  const order = last?.role === 'assistant' ? last.toolCalls.map((c) => c.id) : [];
  const all = [...pending.others, result].sort((a, b) => order.indexOf(a.callId) - order.indexOf(b.callId));
  return [...history, { role: 'tool', results: all }];
}
