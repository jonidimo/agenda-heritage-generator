/** Puente en vivo: dónde está cada cosa, cómo se parten los mensajes y las reglas de una conexión (sin sockets). */
import { describe, expect, it } from 'vitest';
import { appDataDir, createBrokerCore, createFrameParser, dataDirs, encodeFrame, LIVE_ERRORS, LIVE_METHODS, LIVE_PROTOCOL, liveEndpoint, MAX_FRAME_BYTES, newToken } from '../electron/lib/live.mjs';

describe('dónde está cada cosa', () => {
  it('la carpeta de datos de cada sistema, sin usar Electron', () => {
    expect(appDataDir({ APPDATA: 'C:\\Users\\yo\\AppData\\Roaming' }, 'win32', 'C:\\Users\\yo')).toBe('C:\\Users\\yo\\AppData\\Roaming');
    expect(appDataDir({}, 'win32', 'C:\\Users\\yo')).toBe('C:\\Users\\yo\\AppData\\Roaming');
    expect(appDataDir({}, 'darwin', '/Users/yo')).toBe('/Users/yo/Library/Application Support');
    expect(appDataDir({}, 'linux', '/home/yo')).toBe('/home/yo/.config');
    expect(appDataDir({ XDG_CONFIG_HOME: '/cfg' }, 'linux', '/home/yo')).toBe('/cfg');
  });

  it('la aplicación instalada primero y la de desarrollo después', () => {
    expect(dataDirs({}, 'linux', '/home/yo')).toEqual(['/home/yo/.config/Heritage Studio', '/home/yo/.config/Heritage Studio (dev)']);
    expect(dataDirs({ APPDATA: 'C:\\R' }, 'win32', 'C:\\U')[0]).toBe('C:\\R\\Heritage Studio');
  });

  it('un socket de archivo en la carpeta de datos, o en la temporal si la ruta no entra', () => {
    expect(liveEndpoint('/home/yo/.config/Heritage Studio', 'linux', '/tmp')).toBe('/home/yo/.config/Heritage Studio/live.sock');
    const long = `/home/${'x'.repeat(120)}/Heritage Studio`;
    const ep = liveEndpoint(long, 'linux', '/tmp');
    expect(ep).toMatch(/^\/tmp\/heritage-studio-[0-9a-f]{16}\.sock$/);
    expect(ep.length).toBeLessThan(100);
    // La misma carpeta da siempre el mismo socket y otra da otro.
    expect(liveEndpoint(long, 'linux', '/tmp')).toBe(ep);
    expect(liveEndpoint(`${long}2`, 'linux', '/tmp')).not.toBe(ep);
  });

  it('en Windows, una tubería con nombre propia de esa carpeta', () => {
    const ep = liveEndpoint('C:\\Users\\yo\\AppData\\Roaming\\Heritage Studio', 'win32');
    expect(ep).toMatch(/^\\\\\.\\pipe\\heritage-studio-[0-9a-f]{16}$/);
  });

  it('cada token es nuevo y largo', () => {
    expect(newToken()).not.toBe(newToken());
    expect(newToken().length).toBeGreaterThanOrEqual(43);
  });
});

describe('partir los mensajes', () => {
  function collect(maxBytes?: number) {
    const frames: unknown[] = [];
    const errors: string[] = [];
    const parser = createFrameParser({ onFrame: (f) => frames.push(f), onError: (e) => errors.push(e), ...(maxBytes ? { maxBytes } : {}) });
    return { frames, errors, parser };
  }

  it('un mensaje por línea, aunque lleguen cortados en cualquier lugar', () => {
    const { frames, parser } = collect();
    const bytes = Buffer.from(encodeFrame({ id: 1, method: 'a' }) + encodeFrame({ id: 2, method: 'ñandú ✓' }));
    for (let i = 0; i < bytes.length; i += 3) parser.push(bytes.subarray(i, i + 3));
    expect(frames).toEqual([{ id: 1, method: 'a' }, { id: 2, method: 'ñandú ✓' }]);
  });

  it('acepta \\r\\n, ignora líneas vacías y junta varios mensajes de un solo trozo', () => {
    const { frames, parser } = collect();
    parser.push('{"a":1}\r\n\r\n\n{"b":2}\n{"c":3}');
    expect(frames).toEqual([{ a: 1 }, { b: 2 }]);
    parser.push('\n');
    expect(frames).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('un mensaje que no es JSON se informa y no se sigue leyendo', () => {
    const { frames, errors, parser } = collect();
    parser.push('{"a":1}\nno es json\n{"b":2}\n');
    expect(frames).toEqual([{ a: 1 }]);
    expect(errors).toEqual(['json']);
  });

  it('una línea que pasa el tope se informa sin acumularla (aunque nunca llegue el salto de línea)', () => {
    const { errors, parser } = collect(1000);
    parser.push(Buffer.alloc(600, 0x61));
    parser.push(Buffer.alloc(600, 0x61));
    expect(errors).toEqual(['too-large']);
    parser.push('{"a":1}\n');
    expect(errors).toEqual(['too-large']);
    expect(MAX_FRAME_BYTES).toBeGreaterThan(16 * 1024 * 1024);
  });

  it('una línea completa pero demasiado larga también se informa', () => {
    const { frames, errors, parser } = collect(20);
    parser.push(`{"k":"${'x'.repeat(50)}"}\n`);
    expect(frames).toEqual([]);
    expect(errors).toEqual(['too-large']);
  });
});

describe('reglas de una conexión', () => {
  const TOKEN = 'secreto';

  function connection(handler: (m: string, p: unknown) => Promise<unknown>, timeoutMs = 50) {
    const timers: Array<{ cb: () => void; at: number }> = [];
    const sent: Array<Record<string, unknown>> = [];
    let closed = false;
    const core = createBrokerCore({
      token: TOKEN,
      handler,
      timeoutMs,
      setTimer: ((cb: () => void, ms: number) => (timers.push({ cb, at: ms }), timers.length)) as unknown as typeof setTimeout,
      clearTimer: (() => undefined) as unknown as typeof clearTimeout,
    });
    const conn = core.accept((r) => sent.push(r as Record<string, unknown>), () => (closed = true));
    const flush = () => new Promise((r) => setTimeout(r, 0));
    return { conn, sent, timers, isClosed: () => closed, flush };
  }

  const hello = { id: 1, method: 'hello', params: { token: TOKEN, protocol: LIVE_PROTOCOL } };

  it('sin saludar primero no contesta nada y cierra', async () => {
    const c = connection(async () => 1);
    c.conn.onFrame({ id: 1, method: 'design.info' });
    expect(c.sent).toEqual([{ id: 1, error: { code: LIVE_ERRORS.unauthorized, message: 'say hello first' } }]);
    expect(c.isClosed()).toBe(true);
  });

  it('con un token equivocado cierra, y con otro protocolo también', () => {
    const bad = connection(async () => 1);
    bad.conn.onFrame({ id: 1, method: 'hello', params: { token: 'otro', protocol: LIVE_PROTOCOL } });
    expect(bad.sent[0]).toMatchObject({ error: { code: LIVE_ERRORS.unauthorized } });
    expect(bad.isClosed()).toBe(true);
    const old = connection(async () => 1);
    old.conn.onFrame({ id: 1, method: 'hello', params: { token: TOKEN, protocol: 99 } });
    expect(old.sent[0]).toMatchObject({ error: { code: LIVE_ERRORS.badRequest } });
    expect(old.isClosed()).toBe(true);
    // Un token de otro largo no hace saltar la comparación.
    const short = connection(async () => 1);
    short.conn.onFrame({ id: 1, method: 'hello', params: { token: 'x', protocol: LIVE_PROTOCOL } });
    expect(short.isClosed()).toBe(true);
  });

  it('después de saludar, contesta cada pedido con su id y reenvía solo los métodos conocidos', async () => {
    const seen: Array<[string, unknown]> = [];
    const c = connection(async (m, p) => (seen.push([m, p]), { ok: m }));
    c.conn.onFrame(hello);
    c.conn.onFrame({ id: 'a', method: 'design.info', params: { x: 1 } });
    c.conn.onFrame({ id: 3, method: 'rm -rf', params: {} });
    c.conn.onFrame({ id: 4, method: 'ping' });
    await c.flush();
    expect(seen).toEqual([['design.info', { x: 1 }]]);
    expect(c.sent).toEqual([
      { id: 1, result: { protocol: LIVE_PROTOCOL } },
      { id: 3, error: { code: LIVE_ERRORS.unknownMethod, message: 'unknown method rm -rf' } },
      { id: 4, result: 'pong' },
      { id: 'a', result: { ok: 'design.info' } },
    ]);
    expect(LIVE_METHODS).toContain('design.patch');
  });

  it('un error de la página vuelve como error, con su código si lo trae', async () => {
    const c = connection(async () => {
      throw Object.assign(new Error('conflicto'), { code: 7 });
    });
    c.conn.onFrame(hello);
    c.conn.onFrame({ id: 2, method: 'design.patch' });
    await c.flush();
    expect(c.sent[1]).toEqual({ id: 2, error: { code: 7, message: 'conflicto' } });
    const d = connection(() => {
      throw new Error('falló de golpe');
    });
    d.conn.onFrame(hello);
    d.conn.onFrame({ id: 2, method: 'design.info' });
    await d.flush();
    expect(d.sent[1]).toEqual({ id: 2, error: { code: LIVE_ERRORS.app, message: 'falló de golpe' } });
  });

  it('si la página no contesta a tiempo, avisa con el código de tiempo agotado', async () => {
    const c = connection(() => new Promise(() => undefined), 5000);
    c.conn.onFrame(hello);
    c.conn.onFrame({ id: 2, method: 'design.get' });
    await c.flush();
    expect(c.timers.at(-1)!.at).toBe(5000);
    c.timers.at(-1)!.cb();
    await c.flush();
    expect(c.sent[1]).toMatchObject({ id: 2, error: { code: LIVE_ERRORS.timeout } });
  });

  it('pedidos mal formados cierran la conexión', () => {
    for (const bad of [null, 'texto', [], { method: 'x' }, { id: 1 }, { id: {}, method: 'x' }]) {
      const c = connection(async () => 1);
      c.conn.onFrame(bad);
      expect(c.sent[0]).toMatchObject({ error: { code: LIVE_ERRORS.badRequest } });
      expect(c.isClosed()).toBe(true);
    }
  });

  it('una conexión cerrada ya no recibe respuestas', async () => {
    let release: (v: unknown) => void = () => undefined;
    const c = connection(() => new Promise((r) => (release = r)));
    c.conn.onFrame(hello);
    c.conn.onFrame({ id: 2, method: 'design.info' });
    c.conn.onClose();
    release(1);
    await c.flush();
    expect(c.sent).toHaveLength(1);
  });
});
