/**
 * Anthropic (Claude), por la API de mensajes (`POST /v1/messages`).
 *
 * - El texto de sistema y las herramientas van marcados para la caché: no cambian en toda la sesión, así
 *   cada pedido siguiente paga solo lo nuevo.
 * - Las respuestas del modelo se reenvían tal como llegaron (`raw`): los bloques de razonamiento solo
 *   valen si vuelven idénticos y en la misma conversación.
 * - En los modelos de la familia 5, razonamiento adaptativo con esfuerzo medio (lo justo para editar una
 *   agenda sin hacer esperar), y si se acorta el historial la API descarta los bloques que dejaron de valer
 *   en lugar de rechazar el pedido (`prefix_mismatch_behavior: drop_block`).
 * - Contra la API de Anthropic, si el modelo declina un pedido por sus filtros, la misma llamada lo
 *   resuelve un modelo de respaldo (`fallbacks: "default"`).
 * - La elección de herramienta es siempre `auto`: los modelos actuales no aceptan forzarla.
 */
import type { AiMessage, AiPart, AiReply, AiRequest, AiStop, AiToolCall } from '../messages';
import { asArray, asRecord, baseOf, type ProviderAdapter, type ProviderConfig, type WireRequest } from './types';

const DEFAULT_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const BETA_BINDING = 'thinking-binding-controls-2026-08-01';
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

/** Modelos de la familia 5: razonamiento adaptativo, esfuerzo configurable y control de los bloques de razonamiento. */
const MODERN = /^claude-(opus|sonnet|haiku|fable|mythos)-5(-|$)/;
/** Modelos que aceptan el respaldo del servidor ante un rechazo (`fallbacks: "default"`). */
const WITH_FALLBACK = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;

type Block = Record<string, unknown>;

function partBlock(p: AiPart): Block {
  return p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data } };
}

/** Las partes de un mensaje de la persona (un texto vacío no se manda: la API lo rechaza). */
const userBlocks = (parts: readonly AiPart[]): Block[] => parts.filter((p) => p.type !== 'text' || p.text.trim() !== '').map(partBlock);

function assistantBlocks(m: Extract<AiMessage, { role: 'assistant' }>): Block[] {
  // Lo que devolvió Claude vuelve idéntico (con sus bloques de razonamiento y de respaldo).
  if (m.raw?.provider === 'anthropic' && Array.isArray(m.raw.content)) return m.raw.content as Block[];
  const out: Block[] = [];
  if (m.text.trim()) out.push({ type: 'text', text: m.text });
  for (const c of m.toolCalls) out.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input && typeof c.input === 'object' ? c.input : {} });
  return out;
}

function toWire(messages: readonly AiMessage[]): Block[] {
  const out: Block[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: userBlocks(m.parts) });
    else if (m.role === 'assistant') out.push({ role: 'assistant', content: assistantBlocks(m) });
    else
      out.push({
        role: 'user',
        content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.callId, content: r.content.map(partBlock), ...(r.isError ? { is_error: true } : {}) })),
      });
  }
  return out;
}

const STOPS: Record<string, AiStop> = { end_turn: 'end', stop_sequence: 'end', tool_use: 'tool', max_tokens: 'length', refusal: 'refusal' };

export const anthropic: ProviderAdapter = {
  id: 'anthropic',
  defaultBase: DEFAULT_BASE,
  auth: { header: 'x-api-key', prefix: '' },
  defaultModel: 'claude-opus-5-5',
  suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],

  chat(req: AiRequest, cfg: ProviderConfig): WireRequest {
    const base = baseOf(cfg, DEFAULT_BASE);
    const official = base === DEFAULT_BASE;
    const modern = MODERN.test(cfg.model);
    const betas: string[] = [];
    const body: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: req.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
      tool_choice: { type: 'auto' },
      messages: toWire(req.messages),
    };
    if (modern) {
      body.output_config = { effort: 'medium' };
      if (official) {
        body.thinking = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } };
        betas.push(BETA_BINDING);
      }
    }
    if (official && WITH_FALLBACK.test(cfg.model)) {
      body.fallbacks = 'default';
      betas.push(BETA_FALLBACK);
    }
    return { url: `${base}/v1/messages`, method: 'POST', headers: headers(cfg, betas), body: JSON.stringify(body) };
  },

  parseChat(json: unknown): AiReply {
    const r = asRecord(json, 'mensaje');
    const content = asArray(r.content);
    const texts: string[] = [];
    const toolCalls: AiToolCall[] = [];
    for (const raw of content) {
      const b = asRecord(raw, 'bloque');
      if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
      else if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') toolCalls.push({ id: b.id, name: b.name, input: b.input ?? {} });
    }
    const usage = r.usage && typeof r.usage === 'object' ? (r.usage as Record<string, unknown>) : null;
    return {
      text: texts.join('\n').trim(),
      toolCalls,
      stop: STOPS[String(r.stop_reason)] ?? 'other',
      raw: { provider: 'anthropic', content },
      ...(typeof r.model === 'string' ? { model: r.model } : {}),
      ...(usage ? { usage: { input: Number(usage.input_tokens) || 0, output: Number(usage.output_tokens) || 0 } } : {}),
    };
  },

  models(cfg) {
    return { url: `${baseOf(cfg, DEFAULT_BASE)}/v1/models?limit=100`, method: 'GET', headers: headers(cfg, []) };
  },

  parseModels(json: unknown): string[] {
    return asArray(asRecord(json, 'modelos').data)
      .map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string');
  },
};

function headers(cfg: Pick<ProviderConfig, 'surface'>, betas: readonly string[]): Record<string, string> {
  return {
    'content-type': 'application/json',
    'anthropic-version': API_VERSION,
    ...(betas.length > 0 ? { 'anthropic-beta': betas.join(',') } : {}),
    // Desde una página web, Anthropic exige decir que la clave la puso la propia persona en su navegador.
    ...(cfg.surface === 'web' ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
  };
}
