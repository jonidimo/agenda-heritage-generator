/** Puente en vivo con sockets de verdad: intermediario, cliente, permisos y limpieza. */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectLive, createLiveBroker, findLiveApp, LIVE_ERRORS, LIVE_INFO_FILE, LIVE_PROTOCOL, LiveError, newToken, readLiveInfo, removeLiveInfo, writeLiveInfo } from '../electron/lib/live.mjs';

const posix = process.platform !== 'win32';
let dir = '';
const closers: Array<() => Promise<void> | void> = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'hs-live-'));
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  await rm(dir, { recursive: true, force: true });
});

/** El socket de la prueba: en Windows, una tubería con nombre propio. */
const endpointFor = (name: string): string => (posix ? path.join(dir, `${name}.sock`) : `\\\\.\\pipe\\hs-live-${process.pid}-${name}`);

async function start(handler: (m: string, p: unknown) => Promise<unknown>, opts: { name?: string; maxFrameBytes?: number; timeoutMs?: number } = {}) {
  const token = newToken();
  const endpoint = endpointFor(opts.name ?? 'a');
  const broker = await createLiveBroker({ endpoint, token, handler, ...(opts.maxFrameBytes ? { maxFrameBytes: opts.maxFrameBytes } : {}), ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) });
  closers.push(() => broker.close());
  return { token, endpoint, broker };
}

async function client(endpoint: string, token: string, extra: { requestTimeoutMs?: number; maxFrameBytes?: number } = {}) {
  const c = await connectLive({ endpoint, token, ...extra });
  closers.push(() => void c.close());
  return c;
}

describe('intermediario y cliente', () => {
  it('un cliente con el token pide y recibe lo que contesta la página', async () => {
    const { endpoint, token } = await start(async (method, params) => ({ method, params }));
    const c = await client(endpoint, token);
    expect(await c.request('design.info', { a: 1 })).toEqual({ method: 'design.info', params: { a: 1 } });
    expect(await c.request('ping')).toBe('pong');
  });

  it('varios pedidos a la vez se contestan cada uno con lo suyo, aunque terminen en otro orden', async () => {
    const { endpoint, token } = await start(async (_m, p) => {
      const n = (p as { n: number }).n;
      await new Promise((r) => setTimeout(r, 30 - n * 10));
      return { n };
    });
    const c = await client(endpoint, token);
    const out = await Promise.all([0, 1, 2].map((n) => c.request('design.get', { n })));
    expect(out).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }]);
  });

  it('un error de la página llega como LiveError con su código', async () => {
    const { endpoint, token } = await start(async () => {
      throw Object.assign(new Error('desactivado'), { code: 42 });
    });
    const c = await client(endpoint, token);
    await expect(c.request('design.patch', {})).rejects.toMatchObject({ name: 'LiveError', code: 42, message: 'desactivado' });
  });

  it('un método desconocido se rechaza sin llegar a la página', async () => {
    let called = false;
    const { endpoint, token } = await start(async () => (called = true));
    const c = await client(endpoint, token);
    await expect(c.request('evil.exec', { cmd: 'x' })).rejects.toMatchObject({ code: LIVE_ERRORS.unknownMethod });
    expect(called).toBe(false);
  });

  it('con un token equivocado no se conecta, y el intermediario sigue sirviendo a los demás', async () => {
    const { endpoint, token } = await start(async () => 'ok');
    await expect(connectLive({ endpoint, token: 'equivocado' })).rejects.toMatchObject({ code: LIVE_ERRORS.unauthorized });
    const c = await client(endpoint, token);
    expect(await c.request('design.info')).toBe('ok');
  });

  it('quien no saluda y pide directo es desconectado', async () => {
    const { endpoint } = await start(async () => 'ok');
    const socket = net.connect(endpoint);
    closers.push(() => void socket.destroy());
    const answer = await new Promise<string>((resolve) => {
      let got = '';
      socket.on('data', (d) => (got += d));
      socket.on('close', () => resolve(got));
      socket.on('connect', () => socket.write('{"id":1,"method":"design.get"}\n'));
    });
    expect(JSON.parse(answer.trim())).toMatchObject({ id: 1, error: { code: LIVE_ERRORS.unauthorized } });
  });

  it('un pedido que no se contesta a tiempo falla, y el cliente puede seguir', async () => {
    let n = 0;
    const { endpoint, token } = await start(async () => (++n === 1 ? new Promise(() => undefined) : 'listo'), { timeoutMs: 80 });
    const c = await client(endpoint, token);
    await expect(c.request('design.get')).rejects.toMatchObject({ code: LIVE_ERRORS.timeout });
    expect(await c.request('design.get')).toBe('listo');
  });

  it('un mensaje demasiado grande cierra la conexión y deja a los otros clientes', async () => {
    const { endpoint, token } = await start(async () => 'ok', { maxFrameBytes: 2000 });
    const big = await client(endpoint, token);
    const other = await client(endpoint, token);
    await expect(big.request('design.load', { design: 'x'.repeat(5000) })).rejects.toBeInstanceOf(LiveError);
    expect(await other.request('design.info')).toBe('ok');
  });

  it('cuando se cierra el intermediario, los pedidos en curso fallan y ya no se puede conectar', async () => {
    const { endpoint, token, broker } = await start(() => new Promise(() => undefined));
    const c = await client(endpoint, token);
    // El error se recoge en el acto: la caída ocurre antes de que la prueba lo espere.
    const outcome = c.request('design.get').then(() => null, (err: unknown) => err);
    await new Promise((r) => setTimeout(r, 20));
    await broker.close();
    expect(await outcome).toMatchObject({ code: LIVE_ERRORS.unavailable });
    await expect(connectLive({ endpoint, token })).rejects.toBeInstanceOf(LiveError);
  });

  it('sin nadie escuchando, conectar falla con un error claro', async () => {
    await expect(connectLive({ endpoint: endpointFor('nadie'), token: 'x' })).rejects.toMatchObject({ name: 'LiveError', code: LIVE_ERRORS.unavailable });
  });
});

describe.skipIf(!posix)('el archivo del socket', () => {
  it('solo lo puede usar quien lo creó (modo 0600) y se borra al cerrar', async () => {
    const { endpoint, broker } = await start(async () => 1);
    expect((await stat(endpoint)).mode & 0o777).toBe(0o600);
    await broker.close();
    await expect(stat(endpoint)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('un archivo de socket que dejó una caída se reemplaza; uno que está en uso no', async () => {
    // Un socket huérfano: se creó un servidor y se lo mató sin borrar el archivo.
    const endpoint = endpointFor('huerfano');
    await writeFile(endpoint, '');
    const token = newToken();
    // Un archivo común no es un socket vivo: se reemplaza.
    const broker = await createLiveBroker({ endpoint, token, handler: async () => 'nuevo' });
    closers.push(() => broker.close());
    const c = await client(endpoint, token);
    expect(await c.request('design.info')).toBe('nuevo');
    // Con otro intermediario vivo en el mismo lugar, no se pisa.
    await expect(createLiveBroker({ endpoint, token, handler: async () => 'otro' })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(await c.request('design.info')).toBe('nuevo');
  });
});

describe('live.json', () => {
  it('se escribe solo para su dueño, se lee de vuelta y se quita', async () => {
    const info = { protocol: LIVE_PROTOCOL, endpoint: endpointFor('x'), token: 't0ken', pid: process.pid, version: '2.3.0' };
    await writeLiveInfo(dir, info);
    const file = path.join(dir, LIVE_INFO_FILE);
    if (posix) expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readLiveInfo(file)).toEqual(info);
    await removeLiveInfo(dir);
    expect(await readLiveInfo(file)).toBeNull();
  });

  it('un archivo de una aplicación que ya no corre, o dañado, se ignora', async () => {
    const file = path.join(dir, LIVE_INFO_FILE);
    await writeFile(file, JSON.stringify({ protocol: 1, endpoint: 'e', token: 't', pid: 2 ** 22 + 12345, version: '' }));
    expect(await readLiveInfo(file)).toBeNull();
    await writeFile(file, 'no es json');
    expect(await readLiveInfo(file)).toBeNull();
    await writeFile(file, JSON.stringify({ endpoint: 1 }));
    expect(await readLiveInfo(file)).toBeNull();
    expect(await readLiveInfo(path.join(dir, 'nada.json'))).toBeNull();
  });

  it('se encuentra por AGENDA_APP_LINK o en la carpeta de datos habitual', async () => {
    const info = { protocol: LIVE_PROTOCOL, endpoint: endpointFor('y'), token: 'abc', pid: process.pid, version: '' };
    await writeLiveInfo(dir, info);
    expect(await findLiveApp({ env: { AGENDA_APP_LINK: path.join(dir, LIVE_INFO_FILE) } })).toEqual(info);
    expect(await findLiveApp({ env: { AGENDA_APP_LINK: path.join(dir, 'otro.json') } })).toBeNull();
    // La carpeta habitual de Linux: <XDG_CONFIG_HOME>/Heritage Studio/live.json.
    const cfg = path.join(dir, 'cfg');
    await writeLiveInfo(path.join(cfg, 'Heritage Studio'), info);
    expect(await findLiveApp({ env: { XDG_CONFIG_HOME: cfg }, platform: 'linux', home: '/nada' })).toEqual(info);
    expect(await readFile(path.join(cfg, 'Heritage Studio', LIVE_INFO_FILE), 'utf8')).toContain('"token":"abc"');
  });
});
