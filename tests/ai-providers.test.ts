/** Los adaptadores de proveedor: qué pedido arman y cómo leen lo que contesta cada API. */
import { describe, expect, it } from 'vitest';
import { AiError, httpError, retryAfterMs } from '../src/core/ai/errors';
import type { AiMessage, AiRequest } from '../src/core/ai/messages';
import { anthropic } from '../src/core/ai/providers/anthropic';
import { gemini } from '../src/core/ai/providers/gemini';
import { connectableBase, isLocalUrl, listensOnAll, presetOf } from '../src/core/ai/providers';
import { openai } from '../src/core/ai/providers/openai';
import { retryDelay, withRetry } from '../src/core/ai/retry';

const IMG = { type: 'image', mime: 'image/png', data: 'iVBORw0KGgo=' } as const;

/** Una conversación con todo: texto e imagen, una llamada, su resultado con imagen, y la respuesta final. */
const conversation: AiMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: '<context>{}</context>' }, { type: 'text', text: 'Agrandá el título' }, IMG] },
  { role: 'assistant', text: 'Miro la página.', toolCalls: [{ id: 'c1', name: 'render_page', input: { page: 3 } }] },
  { role: 'tool', results: [{ callId: 'c1', name: 'render_page', content: [IMG, { type: 'text', text: '{"page":3}' }] }] },
];

const req: AiRequest = {
  system: 'Sos el asistente.',
  messages: conversation,
  tools: [{ name: 'render_page', description: 'Dibuja', inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { page: { type: 'integer' } }, required: ['page'], additionalProperties: false }, readOnly: true }],
  maxTokens: 16000,
};

const body = (w: { body?: string }) => JSON.parse(w.body!) as Record<string, unknown>;

describe('Anthropic', () => {
  it('arma el pedido con caché, razonamiento adaptativo, respaldo y la cabecera del navegador solo en la web', () => {
    const web = anthropic.chat(req, { model: 'claude-opus-5-5', surface: 'web' });
    expect(web.url).toBe('https://api.anthropic.com/v1/messages');
    expect(web.headers['anthropic-version']).toBe('2023-06-01');
    expect(web.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(web.headers['anthropic-beta']).toBe('thinking-binding-controls-2026-08-01,server-side-fallback-2026-07-01');
    // La clave nunca la pone el adaptador.
    expect(Object.keys(web.headers).map((h) => h.toLowerCase())).not.toContain('x-api-key');
    const b = body(web);
    expect(b.system).toEqual([{ type: 'text', text: 'Sos el asistente.', cache_control: { type: 'ephemeral' } }]);
    expect(b.tool_choice).toEqual({ type: 'auto' });
    expect(b.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(b.output_config).toEqual({ effort: 'medium' });
    expect(b.fallbacks).toBe('default');
    expect(b).not.toHaveProperty('temperature');
    const messages = b.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0]!.content[2]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG.data } });
    expect(messages[1]!.content[1]).toEqual({ type: 'tool_use', id: 'c1', name: 'render_page', input: { page: 3 } });
    // El resultado de una herramienta lleva su imagen adentro.
    expect(messages[2]!.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'c1', content: [{ type: 'image' }, { type: 'text', text: '{"page":3}' }] });
    const desk = anthropic.chat(req, { model: 'claude-opus-5-5', surface: 'desktop' });
    expect(desk.headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();
  });

  it('un modelo anterior o una dirección propia no reciben lo que no entienden', () => {
    const old = body(anthropic.chat(req, { model: 'claude-haiku-4-5', surface: 'desktop' }));
    expect(old).not.toHaveProperty('thinking');
    expect(old).not.toHaveProperty('fallbacks');
    expect(old).not.toHaveProperty('output_config');
    const proxy = anthropic.chat(req, { model: 'claude-opus-5-5', surface: 'desktop', baseUrl: 'https://proxy.example/' });
    expect(proxy.url).toBe('https://proxy.example/v1/messages');
    expect(proxy.headers['anthropic-beta']).toBeUndefined();
    expect(body(proxy)).not.toHaveProperty('fallbacks');
  });

  it('lee texto, llamadas y razones de parada; guarda lo que vino para devolverlo igual', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Propongo esto.' },
      { type: 'tool_use', id: 'tu1', name: 'propose_change', input: { patch: [] } },
    ];
    const reply = anthropic.parseChat({ model: 'claude-opus-5-5', stop_reason: 'tool_use', content, usage: { input_tokens: 10, output_tokens: 5 } });
    expect(reply).toMatchObject({ text: 'Propongo esto.', stop: 'tool', toolCalls: [{ id: 'tu1', name: 'propose_change' }], usage: { input: 10, output: 5 } });
    // La respuesta vuelve idéntica, con su bloque de razonamiento.
    const again = body(anthropic.chat({ ...req, messages: [conversation[0]!, { role: 'assistant', text: reply.text, toolCalls: reply.toolCalls, raw: reply.raw! }] }, { model: 'claude-opus-5-5', surface: 'web' }));
    expect((again.messages as Array<{ content: unknown }>)[1]!.content).toEqual(content);
    expect(anthropic.parseChat({ stop_reason: 'refusal', content: [] }).stop).toBe('refusal');
    expect(anthropic.parseChat({ stop_reason: 'max_tokens', content: [] }).stop).toBe('length');
    expect(anthropic.parseModels({ data: [{ id: 'claude-opus-5-5' }, { id: 'claude-haiku-5-5' }] })).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
  });
});

describe('Gemini', () => {
  it('arma el pedido con JSON Schema completo, respuestas de función y las imágenes después', () => {
    const w = gemini.chat(req, { model: 'gemini-2.5-flash', surface: 'web' });
    expect(w.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    const b = body(w);
    expect(b.systemInstruction).toEqual({ parts: [{ text: 'Sos el asistente.' }] });
    const decl = (b.tools as Array<{ functionDeclarations: Array<Record<string, unknown>> }>)[0]!.functionDeclarations[0]!;
    expect(decl.parametersJsonSchema).not.toHaveProperty('$schema');
    expect(decl.parametersJsonSchema).toMatchObject({ type: 'object', required: ['page'] });
    const contents = b.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(contents[1]!.parts[1]).toEqual({ functionCall: { name: 'render_page', args: { page: 3 }, id: 'c1' } });
    expect(contents[2]!.parts[0]).toEqual({ functionResponse: { name: 'render_page', id: 'c1', response: { result: '{"page":3}' } } });
    expect(contents[2]!.parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: IMG.data } });
  });

  it('pone ids propias a las llamadas que no traen, no las devuelve, y respeta las firmas de razonamiento', () => {
    const parts = [{ text: 'pensando', thought: true }, { functionCall: { name: 'get_context', args: {} }, thoughtSignature: 'firma' }];
    const reply = gemini.parseChat({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] });
    expect(reply.stop).toBe('tool');
    expect(reply.text).toBe('');
    const call = reply.toolCalls[0]!;
    expect(call.id).toMatch(/^gemini-call-/);
    const next = body(
      gemini.chat(
        { ...req, messages: [conversation[0]!, { role: 'assistant', text: '', toolCalls: reply.toolCalls, raw: reply.raw! }, { role: 'tool', results: [{ callId: call.id, name: 'get_context', content: [{ type: 'text', text: '{}' }] }] }] },
        { model: 'gemini-2.5-flash', surface: 'web' },
      ),
    );
    const contents = next.contents as Array<{ parts: Array<Record<string, unknown>> }>;
    expect(contents[1]!.parts).toEqual(parts);
    expect(contents[2]!.parts[0]).toEqual({ functionResponse: { name: 'get_context', response: { result: '{}' } } });
  });

  it('un pedido bloqueado o cortado se dice', () => {
    expect(gemini.parseChat({ promptFeedback: { blockReason: 'SAFETY' } }).stop).toBe('refusal');
    expect(gemini.parseChat({ candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'MAX_TOKENS' }] }).stop).toBe('length');
    expect(gemini.parseModels({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }] })).toEqual(['gemini-2.5-flash']);
  });
});

describe('OpenAI y compatibles', () => {
  it('manda las imágenes de un resultado en un mensaje aparte y usa el tope de salida de cada servicio', () => {
    const w = openai.chat(req, { model: 'gpt-5-mini', surface: 'web' });
    expect(w.url).toBe('https://api.openai.com/v1/chat/completions');
    const b = body(w);
    expect(b.max_completion_tokens).toBe(16000);
    expect(b.tool_choice).toBe('auto');
    const messages = b.messages as Array<Record<string, unknown>>;
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'user']);
    expect(messages[2]!.tool_calls).toEqual([{ id: 'c1', type: 'function', function: { name: 'render_page', arguments: '{"page":3}' } }]);
    expect(messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"page":3}' });
    expect(JSON.stringify(messages[4])).toContain('Imagen devuelta por la llamada c1');
    const ollama = body(openai.chat({ ...req, messages: [{ role: 'user', parts: [{ type: 'text', text: 'hola' }] }] }, { model: 'llama3.1', surface: 'web', baseUrl: 'http://localhost:11434/v1' }));
    expect(ollama.max_tokens).toBe(16000);
    // Un texto solo va como texto (algunos servidores locales no entienden la lista de partes).
    expect((ollama.messages as Array<Record<string, unknown>>)[1]!.content).toBe('hola');
  });

  it('unos argumentos rotos no rompen la conversación: la llamada vuelve al modelo como error', () => {
    const reply = openai.parseChat({ choices: [{ finish_reason: 'stop', message: { content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'propose_change', arguments: '{"patch": [' } }] } }] });
    expect(reply.stop).toBe('tool');
    expect(reply.toolCalls[0]).toMatchObject({ id: 'x', input: null, inputError: expect.stringContaining('JSON') });
    expect(openai.parseChat({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }).stop).toBe('refusal');
  });

  it('reconoce los preajustes y las direcciones locales', () => {
    expect(presetOf('http://localhost:11434/v1/').id).toBe('ollama');
    expect(presetOf('').id).toBe('openai');
    expect(presetOf('https://mi.servidor/v1').id).toBe('custom');
    expect(isLocalUrl('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLocalUrl('http://192.168.0.2:1234/v1')).toBe(false);
  });

  it('0.0.0.0 (donde escucha llama.cpp) es esta computadora: se conecta a 127.0.0.1, también para pedir los modelos', () => {
    expect(listensOnAll('http://0.0.0.0:8080')).toBe(true);
    expect(listensOnAll('http://[::]:8080/v1')).toBe(true);
    expect(listensOnAll('http://127.0.0.1:8080')).toBe(false);
    expect(listensOnAll('no es una dirección')).toBe(false);
    // Un nombre de máquina que coincide con una propiedad de cualquier objeto no es «todas las interfaces».
    expect(listensOnAll('http://constructor:8080')).toBe(false);
    expect(connectableBase('http://tostring:8080')).toBe('http://tostring:8080');
    expect(connectableBase('http://0.0.0.0:8080/v1/')).toBe('http://127.0.0.1:8080/v1');
    expect(connectableBase(' http://0.0.0.0:8080 ')).toBe('http://127.0.0.1:8080');
    expect(connectableBase('http://[::]:8080')).toBe('http://[::1]:8080');
    expect(connectableBase('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
    expect(connectableBase('a medio escribir')).toBe('a medio escribir');
    expect(isLocalUrl('http://0.0.0.0:8080')).toBe(true);
    expect(openai.models({ baseUrl: 'http://0.0.0.0:8080/v1', surface: 'web' }).url).toBe('http://127.0.0.1:8080/v1/models');
    const chat = openai.chat({ system: 's', messages: [{ role: 'user', parts: [{ type: 'text', text: 'hola' }] }], tools: [], maxTokens: 10 }, { model: 'qwen', baseUrl: 'http://0.0.0.0:8080/v1', surface: 'web' });
    expect(chat.url).toBe('http://127.0.0.1:8080/v1/chat/completions');
  });
});

describe('errores y reintentos', () => {
  it('clasifica las respuestas HTTP y lee Retry-After', () => {
    expect(httpError(401, { error: { message: 'invalid x-api-key' } }).kind).toBe('auth');
    expect(httpError(429, {}, { get: () => '3' })).toMatchObject({ kind: 'rateLimit', retryAfterMs: 3000 });
    expect(httpError(529, {}).retryable).toBe(true);
    expect(httpError(400, { error: 'mal' }).retryable).toBe(false);
    expect(retryAfterMs('Wed, 21 Oct 2015 07:28:05 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT'))).toBe(5000);
  });

  it('reintenta solo lo que conviene, con espera creciente, y nunca más de lo dicho', async () => {
    expect(retryDelay(new AiError('rateLimit', 'x', 429), 0, undefined, () => 0.5)).toBe(1000);
    expect(retryDelay(new AiError('rateLimit', 'x', 429), 1, undefined, () => 0.5)).toBe(2000);
    expect(retryDelay(new AiError('rateLimit', 'x', 429), 2)).toBeNull();
    expect(retryDelay(new AiError('badRequest', 'x', 400), 0)).toBeNull();
    expect(retryDelay(new AiError('rateLimit', 'x', 429, 120_000), 0)).toBeNull();
    let calls = 0;
    const waits: number[] = [];
    const ok = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new AiError('server', 'saturado', 503);
        return 'listo';
      },
      new AbortController().signal,
      async (ms) => void waits.push(ms),
      undefined,
      () => 0.5,
    );
    expect(ok).toBe('listo');
    expect(waits).toEqual([1000, 2000]);
    await expect(withRetry(async () => Promise.reject(new AiError('auth', 'no', 401)), new AbortController().signal, async () => undefined)).rejects.toMatchObject({ kind: 'auth' });
  });
});
