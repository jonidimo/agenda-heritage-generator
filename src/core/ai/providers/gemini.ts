/**
 * Google Gemini, por `generateContent` de la API de Gemini (`/v1beta/models/<modelo>:generateContent`).
 *
 * - Las herramientas se describen con JSON Schema completo (`parametersJsonSchema`): el subconjunto de
 *   OpenAPI de `parameters` no puede decir «cualquier valor», que es lo que lleva una operación de parche.
 * - Lo que contesta el modelo vuelve tal cual (`raw`): sus firmas de razonamiento (`thoughtSignature`)
 *   tienen que volver idénticas para que una llamada a herramienta siga valiendo.
 * - Gemini no siempre identifica sus llamadas: si no trae id, se le pone una propia y la respuesta va
 *   solo por nombre, en el mismo orden.
 * - Las imágenes que devuelve una herramienta van como partes de imagen después de las respuestas.
 */
import type { AiMessage, AiPart, AiReply, AiRequest, AiStop, AiToolCall } from '../messages';
import { asArray, asRecord, baseOf, type ProviderAdapter, type ProviderConfig, type WireRequest } from './types';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
/** Prefijo de las ids que inventamos (las que Gemini no dio no se le mandan de vuelta). */
const OWN_ID = 'gemini-call-';

type Part = Record<string, unknown>;

const partOf = (p: AiPart): Part => (p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mime, data: p.data } });

/** Esquema JSON aceptable: sin `$schema` (lo demás de JSON Schema vale tal cual). */
export function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _drop, ...rest } = schema;
  return rest;
}

function toWire(messages: readonly AiMessage[]): Part[] {
  const out: Part[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const parts = m.parts.filter((p) => p.type !== 'text' || p.text.trim() !== '').map(partOf);
      if (parts.length > 0) out.push({ role: 'user', parts });
    } else if (m.role === 'assistant') {
      if (m.raw?.provider === 'gemini' && m.raw.content && typeof m.raw.content === 'object') {
        out.push(m.raw.content as Part);
        continue;
      }
      const parts: Part[] = [];
      if (m.text.trim()) parts.push({ text: m.text });
      for (const c of m.toolCalls) parts.push({ functionCall: { name: c.name, args: c.input && typeof c.input === 'object' ? c.input : {}, ...(c.id.startsWith(OWN_ID) ? {} : { id: c.id }) } });
      out.push({ role: 'model', parts });
    } else {
      const responses: Part[] = m.results.map((r) => {
        const text = r.content
          .filter((p) => p.type === 'text')
          .map((p) => (p.type === 'text' ? p.text : ''))
          .join('\n');
        return { functionResponse: { name: r.name, ...(r.callId.startsWith(OWN_ID) ? {} : { id: r.callId }), response: r.isError ? { error: text } : { result: text } } };
      });
      const images = m.results.flatMap((r) => r.content.filter((p) => p.type === 'image').map(partOf));
      out.push({ role: 'user', parts: [...responses, ...images] });
    }
  }
  return out;
}

const REFUSALS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE']);

export const gemini: ProviderAdapter = {
  id: 'gemini',
  defaultBase: DEFAULT_BASE,
  auth: { header: 'x-goog-api-key', prefix: '' },
  defaultModel: 'gemini-2.5-flash',
  suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest'],

  chat(req: AiRequest, cfg: ProviderConfig): WireRequest {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: toWire(req.messages),
      tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: geminiSchema(t.inputSchema) })) }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { maxOutputTokens: req.maxTokens },
    };
    const model = encodeURIComponent(cfg.model.replace(/^models\//, ''));
    return { url: `${baseOf(cfg, DEFAULT_BASE)}/v1beta/models/${model}:generateContent`, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  },

  parseChat(json: unknown): AiReply {
    const r = asRecord(json, 'respuesta');
    const feedback = r.promptFeedback && typeof r.promptFeedback === 'object' ? (r.promptFeedback as Record<string, unknown>) : null;
    const candidate = asArray(r.candidates)[0];
    if (!candidate) return { text: '', toolCalls: [], stop: feedback?.blockReason ? 'refusal' : 'other' };
    const c = asRecord(candidate, 'candidato');
    const content = c.content && typeof c.content === 'object' ? (c.content as Record<string, unknown>) : { role: 'model', parts: [] };
    const texts: string[] = [];
    const toolCalls: AiToolCall[] = [];
    let n = 0;
    for (const raw of asArray(content.parts)) {
      const p = asRecord(raw, 'parte');
      // Las partes de razonamiento (`thought: true`) no son la respuesta.
      if (typeof p.text === 'string' && p.thought !== true) texts.push(p.text);
      if (p.functionCall && typeof p.functionCall === 'object') {
        const f = p.functionCall as Record<string, unknown>;
        if (typeof f.name === 'string') toolCalls.push({ id: typeof f.id === 'string' && f.id ? f.id : `${OWN_ID}${n++}`, name: f.name, input: f.args ?? {} });
      }
    }
    const reason = String(c.finishReason ?? '');
    const stop: AiStop = toolCalls.length > 0 ? 'tool' : reason === 'STOP' ? 'end' : reason === 'MAX_TOKENS' ? 'length' : REFUSALS.has(reason) ? 'refusal' : 'other';
    const usage = r.usageMetadata && typeof r.usageMetadata === 'object' ? (r.usageMetadata as Record<string, unknown>) : null;
    return {
      text: texts.join('').trim(),
      toolCalls,
      stop,
      raw: { provider: 'gemini', content: { role: 'model', parts: asArray(content.parts) } },
      ...(typeof r.modelVersion === 'string' ? { model: r.modelVersion } : {}),
      ...(usage ? { usage: { input: Number(usage.promptTokenCount) || 0, output: Number(usage.candidatesTokenCount) || 0 } } : {}),
    };
  },

  models(cfg) {
    return { url: `${baseOf(cfg, DEFAULT_BASE)}/v1beta/models?pageSize=200`, method: 'GET', headers: {} };
  },

  parseModels(json: unknown): string[] {
    return asArray(asRecord(json, 'modelos').models)
      .map((m) => (m && typeof m === 'object' ? (m as { name?: unknown; supportedGenerationMethods?: unknown }) : {}))
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => (typeof m.name === 'string' ? m.name.replace(/^models\//, '') : ''))
      .filter(Boolean);
  },
};
