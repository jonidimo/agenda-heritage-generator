/** El asistente en el escritorio: claves cifradas por el sistema, destinos permitidos y cabeceras depuradas. */
import fc from 'fast-check';
import * as fsp from 'node:fs/promises';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiSettingsStore, aiTargetAllowed, cleanBaseUrl, parseChatRequest, sanitizeHeaders } from '../electron/lib/ai.mjs';

/** Un `safeStorage` falso: «cifra» invirtiendo los bytes con un prefijo (lo que importa es que no quede en claro). */
const fakeSafe = (available = true, backend = 'gnome_libsecret') => ({
  isEncryptionAvailable: () => available,
  encryptString: (s: string) => Buffer.from(`enc:${[...s].reverse().join('')}`),
  decryptString: (b: Buffer) => {
    const t = b.toString();
    if (!t.startsWith('enc:')) throw new Error('no');
    return [...t.slice(4)].reverse().join('');
  },
  getSelectedStorageBackend: () => backend,
});

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'hs-ai-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('claves', () => {
  it('se guardan cifradas, solo para su dueño, y se leen de vuelta; quitar las borra', async () => {
    const file = path.join(dir, 'ai.json');
    const store = new AiSettingsStore({ file, fs: fsp, safeStorage: fakeSafe() });
    await store.setKey('anthropic', 'sk-ant-secreta');
    const disk = await readFile(file, 'utf8');
    expect(disk).not.toContain('sk-ant-secreta');
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    // Otra instancia (la aplicación abierta de nuevo) la lee.
    const again = new AiSettingsStore({ file, fs: fsp, safeStorage: fakeSafe() });
    expect(await again.getKey('anthropic')).toBe('sk-ant-secreta');
    expect((await again.status()).hasKey).toEqual({ anthropic: true, gemini: false, openai: false });
    await again.setKey('anthropic', null);
    expect(await again.getKey('anthropic')).toBeNull();
  });

  it('sin llavero la clave no se escribe nunca en claro: vale mientras la aplicación siga abierta', async () => {
    const file = path.join(dir, 'ai.json');
    const store = new AiSettingsStore({ file, fs: fsp, safeStorage: fakeSafe(false) });
    await store.setKey('openai', 'sk-abierta');
    expect(await store.getKey('openai')).toBe('sk-abierta');
    expect(await readFile(file, 'utf8')).not.toContain('sk-abierta');
    expect((await store.status()).encryption).toMatchObject({ available: false });
    expect(await new AiSettingsStore({ file, fs: fsp, safeStorage: fakeSafe(false) }).getKey('openai')).toBeNull();
  });

  it('dice si la protección es débil (Linux sin llavero), y un archivo dañado arranca vacío', async () => {
    const store = new AiSettingsStore({ file: path.join(dir, 'ai.json'), fs: fsp, safeStorage: fakeSafe(true, 'basic_text') });
    expect((await store.status()).encryption).toEqual({ available: true, backend: 'basic_text', weak: true });
    await fsp.writeFile(path.join(dir, 'roto.json'), '{no es json');
    const broken = new AiSettingsStore({ file: path.join(dir, 'roto.json'), fs: fsp, safeStorage: fakeSafe() });
    expect((await broken.status()).hasKey).toEqual({ anthropic: false, gemini: false, openai: false });
  });
});

describe('destinos', () => {
  it('la clave va a un solo origen: el del proveedor por https, o el de la dirección guardada', () => {
    expect(aiTargetAllowed('anthropic', 'https://api.anthropic.com/v1/messages', undefined)).toBe(true);
    expect(aiTargetAllowed('anthropic', 'http://api.anthropic.com/v1/messages', undefined)).toBe(false);
    expect(aiTargetAllowed('anthropic', 'https://generativelanguage.googleapis.com/x', undefined)).toBe(false);
    // Otro servicio compatible recibe la clave solo si es la dirección guardada (y la clave se escribió para él).
    expect(aiTargetAllowed('openai', 'https://openrouter.ai/api/v1/chat/completions', undefined)).toBe(false);
    expect(aiTargetAllowed('openai', 'https://openrouter.ai/api/v1/chat/completions', 'https://openrouter.ai/api/v1')).toBe(true);
    expect(aiTargetAllowed('openai', 'https://api.openai.com/v1/models', 'https://openrouter.ai/api/v1')).toBe(false);
    expect(aiTargetAllowed('openai', 'http://localhost:11434/v1/chat/completions', undefined)).toBe(false);
    expect(aiTargetAllowed('openai', 'http://localhost:11434/v1/chat/completions', 'http://localhost:11434/v1')).toBe(true);
    expect(aiTargetAllowed('openai', 'http://localhost:9999/v1/chat/completions', 'http://localhost:11434/v1')).toBe(false);
    // Una dirección guardada en http que no es de esta computadora no recibe claves.
    expect(aiTargetAllowed('openai', 'http://192.168.0.5:1234/v1/x', 'http://192.168.0.5:1234/v1')).toBe(false);
    expect(aiTargetAllowed('openai', 'https://evil.example/v1', undefined)).toBe(false);
    expect(aiTargetAllowed('openai', 'https://user:pass@api.openai.com/v1', undefined)).toBe(false);
    expect(aiTargetAllowed('openai', 'app://heritage/_sys/open', 'app://heritage')).toBe(false);
    expect(aiTargetAllowed('openai', 'file:///etc/passwd', undefined)).toBe(false);
  });

  it('ninguna dirección generada escapa del origen guardado (propiedades)', () => {
    const allowedOrigins = new Set(['https://mi.servicio.example']);
    fc.assert(
      fc.property(fc.webUrl({ withQueryParameters: true, withFragments: true }), (url) => {
        if (aiTargetAllowed('openai', url, 'https://mi.servicio.example/v1')) expect(allowedOrigins.has(new URL(url).origin)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('las direcciones que escribe la persona se limpian; las raras se rechazan', () => {
    expect(cleanBaseUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234/v1');
    expect(cleanBaseUrl('')).toBe('');
    expect(cleanBaseUrl('ftp://x')).toBeNull();
    expect(cleanBaseUrl('https://a:b@x.example')).toBeNull();
    expect(cleanBaseUrl('no es una dirección')).toBeNull();
    // Donde escucha llama.cpp: se guarda la dirección a la que se conecta la página.
    expect(cleanBaseUrl('http://0.0.0.0:8080/v1')).toBe('http://127.0.0.1:8080/v1');
    expect(cleanBaseUrl('http://[::]:8080')).toBe('http://[::1]:8080');
    expect(aiTargetAllowed('openai', 'http://127.0.0.1:8080/v1/chat/completions', cleanBaseUrl('http://0.0.0.0:8080/v1') ?? undefined)).toBe(true);
  });
});

describe('una clave es de un servicio', () => {
  it('cambiar la dirección a otro origen olvida la clave; la misma dirección con otra ruta, no', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ai-origen-'));
    const store = new AiSettingsStore({ file: path.join(dir, 'ai.json'), fs: fsp, safeStorage: fakeSafe() });
    await store.setKey('openai', 'sk-openai');
    expect(await store.setBaseUrl('openai', 'https://api.openai.com/v1')).toBe(false);
    expect(await store.getKey('openai')).toBe('sk-openai');
    expect(await store.setBaseUrl('openai', 'https://api.groq.com/openai/v1')).toBe(true);
    expect(await store.getKey('openai')).toBeNull();
    expect((await store.status()).hasKey.openai).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('pedidos de la página', () => {
  it('solo pasan las cabeceras del protocolo: nunca una credencial puesta por la página', () => {
    expect(sanitizeHeaders({ 'Content-Type': 'application/json', 'x-api-key': 'robada', Authorization: 'Bearer x', 'anthropic-version': '2023-06-01', Cookie: 'a=b', 'anthropic-beta': 'a\r\nX-Inyectada: 1' })).toEqual({
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    });
  });

  it('un pedido mal formado se rechaza con su motivo', () => {
    expect(parseChatRequest(null)).toMatchObject({ ok: false });
    expect(parseChatRequest({ provider: 'otro', url: 'https://x', method: 'POST' })).toMatchObject({ ok: false, error: 'provider' });
    expect(parseChatRequest({ provider: 'openai', url: 'https://x', method: 'DELETE' })).toMatchObject({ ok: false, error: 'method' });
    expect(parseChatRequest({ provider: 'openai', url: 'https://x', method: 'POST', body: {} })).toMatchObject({ ok: false, error: 'payload' });
    expect(parseChatRequest({ provider: 'openai', url: 'https://api.openai.com/v1/models', method: 'GET', headers: { authorization: 'x' } })).toEqual({ ok: true, provider: 'openai', url: 'https://api.openai.com/v1/models', method: 'GET', headers: {} });
  });
});
