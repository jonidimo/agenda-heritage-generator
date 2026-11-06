/**
 * OpenAI y los servicios que hablan su API de chat (`POST <base>/chat/completions`): OpenAI,
 * OpenRouter, Groq, Mistral, y los modelos locales de Ollama y LM Studio.
 *
 * - Un texto solo va como texto (algunos servidores locales no entienden la lista de partes).
 * - El resultado de una herramienta es solo texto en esta API: si trae imágenes, van en un mensaje de la
 *   persona inmediatamente después, que dice de qué llamada son.
 * - Los argumentos de una llamada llegan como texto JSON; si vienen rotos, la llamada no se ejecuta y el
 *   modelo recibe el error para corregirse (no es un fallo de la conversación).
 */
import type { AiImagePart, AiMessage, AiPart, AiReply, AiRequest, AiStop, AiToolCall } from '../messages';
import { textOfParts } from '../messages';
import { asArray, asRecord, baseOf, parseArguments, type ProviderAdapter, type ProviderConfig, type WireRequest } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

type Msg = Record<string, unknown>;

function userContent(parts: readonly AiPart[]): unknown {
  if (parts.every((p) => p.type === 'text')) return textOfParts(parts);
  return parts.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}` } }));
}

function toWire(system: string, messages: readonly AiMessage[]): Msg[] {
  const out: Msg[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: userContent(m.parts) });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length > 0
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input && typeof c.input === 'object' ? c.input : {}) } })) }
          : {}),
      });
    } else {
      for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.callId, content: (r.isError ? 'ERROR: ' : '') + (textOfParts(r.content) || '(sin texto)') });
      // Las imágenes de los resultados, en un mensaje aparte (la API no las acepta en un mensaje de herramienta).
      const images = m.results.flatMap((r) => r.content.filter((p): p is AiImagePart => p.type === 'image').map((p) => ({ callId: r.callId, p })));
      if (images.length > 0) {
        out.push({
          role: 'user',
          content: images.flatMap(({ callId, p }) => [
            { type: 'text', text: `Imagen devuelta por la llamada ${callId}:` },
            { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}` } },
          ]),
        });
      }
    }
  }
  return out;
}

const STOPS: Record<string, AiStop> = { stop: 'end', tool_calls: 'tool', function_call: 'tool', length: 'length', content_filter: 'refusal' };

export const openai: ProviderAdapter = {
  id: 'openai',
  defaultBase: DEFAULT_BASE,
  auth: { header: 'authorization', prefix: 'Bearer ' },
  defaultModel: 'gpt-5-mini',
  suggestedModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini'],

  chat(req: AiRequest, cfg: ProviderConfig): WireRequest {
    const base = baseOf(cfg, DEFAULT_BASE);
    // OpenAI cambió el nombre del tope de salida; los servicios compatibles siguen con el de siempre.
    const limit = /^https:\/\/api\.openai\.com\//.test(`${base}/`) ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens };
    const body = {
      model: cfg.model,
      messages: toWire(req.system, req.messages),
      tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      tool_choice: 'auto',
      ...limit,
    };
    return { url: `${base}/chat/completions`, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  },

  parseChat(json: unknown): AiReply {
    const r = asRecord(json, 'respuesta');
    const choice = asArray(r.choices)[0];
    if (!choice) throw new Error('Respuesta inesperada del proveedor (sin opciones).');
    const c = asRecord(choice, 'opción');
    const msg = c.message && typeof c.message === 'object' ? (c.message as Record<string, unknown>) : {};
    const toolCalls: AiToolCall[] = [];
    asArray(msg.tool_calls).forEach((raw, i) => {
      const t = asRecord(raw, 'llamada');
      const f = t.function && typeof t.function === 'object' ? (t.function as Record<string, unknown>) : {};
      if (typeof f.name !== 'string') return;
      const args = parseArguments(f.arguments);
      toolCalls.push({ id: typeof t.id === 'string' && t.id ? t.id : `call-${i}`, name: f.name, input: args.input, ...(args.inputError ? { inputError: args.inputError } : {}) });
    });
    const usage = r.usage && typeof r.usage === 'object' ? (r.usage as Record<string, unknown>) : null;
    // Algunos servidores dicen «stop» aunque traigan llamadas: mandan las llamadas.
    const stop: AiStop = toolCalls.length > 0 ? 'tool' : (STOPS[String(c.finish_reason)] ?? 'other');
    return {
      text: typeof msg.content === 'string' ? msg.content.trim() : '',
      toolCalls,
      stop,
      ...(typeof r.model === 'string' ? { model: r.model } : {}),
      ...(usage ? { usage: { input: Number(usage.prompt_tokens) || 0, output: Number(usage.completion_tokens) || 0 } } : {}),
    };
  },

  models(cfg) {
    return { url: `${baseOf(cfg, DEFAULT_BASE)}/models`, method: 'GET', headers: {} };
  },

  parseModels(json: unknown): string[] {
    const r = asRecord(json, 'modelos');
    // `data: [{ id }]` es lo de OpenAI (y llama.cpp, LM Studio, vLLM); `models: [{ name | model }]`, lo de Ollama y otros.
    const ids = [
      ...asArray(r.data).map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined)),
      ...asArray(r.models).map((m) => (m && typeof m === 'object' ? ((m as { name?: unknown; model?: unknown }).name ?? (m as { model?: unknown }).model) : undefined)),
    ];
    return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))].sort();
  },
};
