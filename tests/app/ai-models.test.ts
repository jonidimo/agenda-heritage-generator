/**
 * Elegir el modelo con un servidor local: la lista sale del servidor (en sus dos formatos), una dirección
 * sin `/v1` se prueba también con `/v1`, y en una dirección que no es la oficial nunca se usa un modelo
 * de OpenAI que nadie eligió.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openai } from '../../src/core/ai/providers/openai';
import { PROVIDER_IDS } from '../../src/core/ai/providers';
import { listModels, withV1 } from '../../src/app/state/ai/engine';
import { AI_SETTINGS_DEFAULT, activeProvider, modelForBase, normalizeAiSettings, type AiSettings } from '../../src/app/state/ai/settings';

const withOpenai = (model: string, baseUrl: string): AiSettings => ({ ...AI_SETTINGS_DEFAULT, provider: 'openai', perProvider: { ...AI_SETTINGS_DEFAULT.perProvider, openai: { model, baseUrl } } });

afterEach(() => vi.unstubAllGlobals());

describe('proveedores y modelo', () => {
  it('lo compatible con OpenAI va primero y es el de siempre', () => {
    expect(PROVIDER_IDS[0]).toBe('openai');
    expect(AI_SETTINGS_DEFAULT.provider).toBe('openai');
  });

  it('en la dirección oficial, sin elegir, vale el modelo de siempre; en una local, ninguno', () => {
    expect(activeProvider(withOpenai('', '')).model).toBe(openai.defaultModel);
    expect(activeProvider(withOpenai('', 'http://localhost:8080')).model).toBe('');
    // El modelo de siempre que la 2.4.0 dejó guardado junto a un servidor local se olvida al leer los ajustes…
    expect(activeProvider(normalizeAiSettings(withOpenai('gpt-5-mini', 'http://localhost:8080/v1'))).model).toBe('');
    // …pero lo que la persona elige después se respeta, aunque se llame igual que uno de OpenAI (un proxy).
    expect(activeProvider(withOpenai('gpt-5-mini', 'https://proxy.example/v1')).model).toBe('gpt-5-mini');
    expect(activeProvider(withOpenai('qwen3-27b', 'http://localhost:8080/v1')).model).toBe('qwen3-27b');
    // Al cambiar de dirección, un modelo sugerido para la oficial se borra; uno elegido, no.
    expect(modelForBase('openai', 'gpt-5', 'http://localhost:11434/v1')).toBe('');
    expect(modelForBase('openai', 'qwen3', 'http://localhost:11434/v1')).toBe('qwen3');
    expect(modelForBase('openai', 'gpt-5', '')).toBe('gpt-5');
  });

  it('lee la lista de modelos en el formato de OpenAI y en el de Ollama', () => {
    expect(openai.parseModels({ object: 'list', data: [{ id: 'qwen3-27b' }, { id: 'llama' }] })).toEqual(['llama', 'qwen3-27b']);
    expect(openai.parseModels({ models: [{ name: 'qwen3:27b' }, { model: 'gemma3' }, { name: '' }] })).toEqual(['gemma3', 'qwen3:27b']);
  });

  it('`withV1` agrega `/v1` solo cuando falta', () => {
    expect(withV1('http://localhost:8080')).toBe('http://localhost:8080/v1');
    expect(withV1('http://localhost:8080/')).toBe('http://localhost:8080/v1');
    expect(withV1('http://localhost:8080/v1')).toBeNull();
    expect(withV1('')).toBeNull();
    expect(withV1('no es una dirección')).toBeNull();
  });
});

describe('buscar los modelos de un servidor local', () => {
  const serve = (routes: Record<string, { status: number; body: unknown }>) => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const r = routes[url] ?? { status: 404, body: '<html>Not found</html>' };
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
    });
    return asked;
  };

  it('una dirección que contesta da sus modelos, sin clave', async () => {
    serve({ 'http://localhost:8080/v1/models': { status: 200, body: { data: [{ id: 'qwen3-27b' }] } } });
    expect(await listModels('openai', 'http://localhost:8080/v1', new AbortController().signal)).toEqual({ models: ['qwen3-27b'] });
  });

  it('sin `/v1`, si la dirección no contesta como API, prueba con `/v1` y lo propone', async () => {
    const asked = serve({ 'http://localhost:8080/v1/models': { status: 200, body: { data: [{ id: 'qwen3-27b' }] } } });
    const out = await listModels('openai', 'http://localhost:8080', new AbortController().signal);
    expect(out).toEqual({ models: ['qwen3-27b'], suggestedBase: 'http://localhost:8080/v1' });
    expect(asked).toEqual(['http://localhost:8080/models', 'http://localhost:8080/v1/models']);
  });

  it('si ninguna de las dos contesta, el error es el de la dirección escrita', async () => {
    serve({});
    await expect(listModels('openai', 'http://localhost:8080', new AbortController().signal)).rejects.toMatchObject({ kind: 'notFound' });
  });
});
