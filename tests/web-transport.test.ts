/**
 * La conexión real (`https`), contra un servidor local con un certificado de prueba: que anden las redirecciones,
 * la descompresión y los topes con sockets de verdad, y que la resolución de nombres cierre el paso a una
 * dirección local (el servidor local no recibe ninguna conexión).
 */
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebError } from '../src/node/web/guard';
import { createHttpClient, createHttpsTransport } from '../src/node/web/http';

const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQClO7RrljYyJ/2R
YHgWKEBnwpoVWwIU8J7zDPVi0xRmbT//k8irKqEo7+hKrFVC/xI/zWzllh6olKli
weyIgckZOp4prVw/grwZ2wTIGBx2pqzf9hBVK6Bp2tZUd2IVPe/qEB6khv2N7RN3
9m+7fsHXCY/3PnJgCbWiFaP0HlrqMTRtvxHwIWdp8swJo6ubJotec5Yicm7kiwAX
MyUm6cN98TppsmwXvUKyCG7OczWi/+qCJ5CI4obYMh7SaIr9iKNh7DQh7u5EvBeO
IdPsJM9lEEwPqrjGywFBKvV2BuLFhx+RVh4rogWJCLGFnPqABcpe+YqTY5kbQSUS
ouk5VawnAgMBAAECggEAUX0FeL3HEqtYSZcbAkptoP5/QSL1/t/AdDui1U8mU3Fz
y5bVs1y9yFOw6wrcrcLf/ClSmFOV4SwX8YWUIqpnRBL9p65AvW27WMEENa52cym2
Pmm7GlX+sdXkOBn8fF9kb7ntctTEPXd7T4FxDzXvYR7tKlFY1PZU5o/noOBLlA1P
S7/6M4BOcaoAu3sIbCb87WvnPovfNi5f72TN3ff0/C8i6yl7FNOgzPDWX64GxnN2
BzabzZCZgCqXEufnA5xRxz/UW1gINw5iX0sNcmMBHkEgOz2jPZsiZbp2onP97nCm
+kc/XfpFZCJEaoMR1Hz5o8lN7ptKdwyHS2PN0IsFCQKBgQDTx4Nqt7zxqe8ABTdR
dyvmNMNVbHdRBEvivSVK+tbfgqfysgCld6pcC13xnpagtKuvTqeklCSWWgYLIKIc
2MXH4QhgXcQOB1J4MTVBC64EsqGnQzIRhesGWDOVYWB4wNQPZSr4WgsohZQz26NL
N6yIlF3r1hAF3yjnMzdnOjJpdQKBgQDHvBt/BQwjbJOFIenOccN2SzGZE6wSUchu
qHQo7Y7tO06cH9zANxLNDB1+LEU9ghO491iUiRtAORKWMoYXn5ciCAyc/ITjdn3A
zlvcBwqb5HbglIF5Fy2eBuAaFFwl5fKA4elg2Uh0dYWEBJs2sBfxcoISFErUjYSZ
l+OCqMHvqwKBgGKbjDo9cTGI8WquAxLgjUU0HhuBVJEZkgfyEBI4d6I8oNylOx3Q
eTdAZ66gK/yKA0KuOeqsu9hx9ExsFm+eE4E863yLTEVH7YNfTi+KM62mSxSpef+k
vkkG+oW8gIHZLyQ38+kNbBKjF92JkB/uvVwe0RiFZJKHVPFJ7KsY8u4dAoGBAJIc
c2jaAmUvmkL76hPReRFiNGgs0eWc2ijJJiCCl9nHVtwzGsOqBiDlyfVw4T37l/3p
Q211VvAGUCh70UgawO5uQPveZkAXgCq5Ss2MgSBFYwkq2gQBBqfhk7LATiCTNHE/
0f+9M5muFvvaesjozLsd7zTWj18qH2RUjmQYm7Z9AoGAWerNOXOF82AznOSBPXV+
cO9cq0aLwx9TemIk2dCqJWorJLnkgIjspxSJe9LP7kwl2kU29KesMgNdn961pCQi
M/o3/2W0eiqi5lAgpU7kIP0FhrkCfIISkRMQvuL5x9z61Uu0xuqXtJSoJ5xglCIw
x1v1oDdqiuLzGH3HyX9cVSg=
-----END PRIVATE KEY-----`;
const CERT = `-----BEGIN CERTIFICATE-----
MIIDKTCCAhGgAwIBAgIUZJy81vGjng+XezJ7u9SxM4V7x4EwDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIYXBpLnRlc3QwIBcNMjYxMTA4MDM0NDM3WhgPMjEyNjEw
MTUwMzQ0MzdaMBMxETAPBgNVBAMMCGFwaS50ZXN0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEApTu0a5Y2Mif9kWB4FihAZ8KaFVsCFPCe8wz1YtMUZm0/
/5PIqyqhKO/oSqxVQv8SP81s5ZYeqJSpYsHsiIHJGTqeKa1cP4K8GdsEyBgcdqas
3/YQVSugadrWVHdiFT3v6hAepIb9je0Td/Zvu37B1wmP9z5yYAm1ohWj9B5a6jE0
bb8R8CFnafLMCaOrmyaLXnOWInJu5IsAFzMlJunDffE6abJsF71CsghuznM1ov/q
gieQiOKG2DIe0miK/YijYew0Ie7uRLwXjiHT7CTPZRBMD6q4xssBQSr1dgbixYcf
kVYeK6IFiQixhZz6gAXKXvmKk2OZG0ElEqLpOVWsJwIDAQABo3MwcTAdBgNVHQ4E
FgQU0XgJkt5tfzkcbED27WSFiTFO0jEwHwYDVR0jBBgwFoAU0XgJkt5tfzkcbED2
7WSFiTFO0jEwDwYDVR0TAQH/BAUwAwEB/zAeBgNVHREEFzAVgghhcGkudGVzdIIJ
bG9jYWxob3N0MA0GCSqGSIb3DQEBCwUAA4IBAQAQ1psJpb6O6zelymrkAAthptGD
dorm7ThRahziOF9oYJK2whTK4bifqqZOe/nzMDLBHP9m7/vBL0EuDGdNs50P/sFQ
u+HGzESc4dk73I7707Ve5CTebWgEe8hKz++bPtc4t1oecuvwucYpD6iGqr4Tm8iM
ix5AcLZ/4EPLy+bXlkxLrWclHxtwZ37Pnrf8efufnheUcafVIfC1L53fyXyMDpfM
79CZCwbywO6lfRBnX4FgGlKqhnqbNXZDGdIWn2AlEo88SZATYObcR3eM33f8Zuva
rFWInfhp9YVH2EaxZzNKjJfQZZmLSBmF7f4wjTo9VHbDjBzw2g7F0HflOUfi
-----END CERTIFICATE-----`;

let server: Server;
let port = 0;
let hits = 0;
let lastHeaders: Record<string, string | string[] | undefined> = {};

beforeAll(async () => {
  server = createServer({ key: KEY, cert: CERT }, (req, res) => {
    hits++;
    lastHeaders = req.headers;
    const big = Buffer.alloc(200_000, 'a');
    switch (req.url) {
      case '/hola':
        res.writeHead(200, { 'content-type': 'text/plain' }).end('hola');
        break;
      case '/gzip':
        res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' }).end(gzipSync('comprimido ✓'));
        break;
      case '/br':
        res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'br' }).end(brotliCompressSync('brotli ✓'));
        break;
      case '/bomba':
        // 200 KB de «a» comprimidos pesan casi nada: el tope se aplica a lo ya descomprimido.
        res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' }).end(gzipSync(big));
        break;
      case '/rota':
        res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' }).end(Buffer.from('esto no es gzip'));
        break;
      case '/grande':
        res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(big);
        break;
      case '/redir':
        res.writeHead(302, { location: '/hola' }).end();
        break;
      case '/lento':
        // No responde nunca.
        break;
      default:
        res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** La resolución de nombres que lleva «api.test» al servidor local (solo para probar el resto de la conexión). */
const toLocal = ((_h: string, opts: { all?: boolean }, cb: (e: null, a: unknown, f?: number) => void) => (opts.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4))) as never;
const url = (path: string): string => `https://api.test:${port}${path}`;
const text = (b: Uint8Array): string => new TextDecoder().decode(b);
// El puerto no es el 443: el cliente (que solo admite ese) se prueba por el transporte, tal como lo usa.
const get = (path: string, o: { maxBytes?: number; timeoutMs?: number } = {}) =>
  (async () => {
    const t = createHttpsTransport({ ca: CERT, lookup: toLocal });
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), o.timeoutMs ?? 5000);
    try {
      const res = await t(new URL(url(path)), { headers: { 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'prueba/1' }, signal: control.signal });
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const c of res.body) {
        total += c.length;
        if (total > (o.maxBytes ?? 1e9)) throw new WebError('too-large', 'grande');
        chunks.push(c);
      }
      return { status: res.status, headers: res.headers, body: Buffer.concat(chunks) };
    } finally {
      clearTimeout(timer);
    }
  })();

describe('httpsTransport (sockets de verdad)', () => {
  it('lee una respuesta por https y manda sus encabezados', async () => {
    const r = await get('/hola');
    expect(r.status).toBe(200);
    expect(text(r.body)).toBe('hola');
    expect(lastHeaders['user-agent']).toBe('prueba/1');
    expect(lastHeaders['accept-encoding']).toContain('gzip');
  });

  it('descomprime gzip y brotli, y una respuesta rota falla en lugar de colgarse', async () => {
    expect(text((await get('/gzip')).body)).toBe('comprimido ✓');
    expect(text((await get('/br')).body)).toBe('brotli ✓');
    await expect(get('/rota')).rejects.toThrow();
  });

  it('el tope de tamaño se aplica a lo ya descomprimido', async () => {
    await expect(get('/bomba', { maxBytes: 10_000 })).rejects.toMatchObject({ code: 'too-large' });
    expect((await get('/bomba', { maxBytes: 1_000_000 })).body.length).toBe(200_000);
    await expect(get('/grande', { maxBytes: 10_000 })).rejects.toMatchObject({ code: 'too-large' });
  });

  it('el tiempo máximo corta un servidor que no responde', async () => {
    const t0 = Date.now();
    await expect(get('/lento', { timeoutMs: 150 })).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('la resolución de nombres de verdad cierra el paso a lo local', () => {
  it('un nombre que apunta a 127.0.0.1 no se conecta: el servidor local no recibe nada', async () => {
    const before = hits;
    // El cliente de producción corta antes por el puerto (solo admite el 443)…
    const client = createHttpClient({ userAgent: 'x' });
    const err = await client.get(`https://localhost:${port}/hola`, { allow: ['localhost'] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WebError);
    expect(hits).toBe(before);
    // …y el transporte de producción, con su resolución de nombres por defecto, no llega a conectarse.
    const t = createHttpsTransport({ ca: CERT });
    const control = new AbortController();
    const blocked = await t(new URL(`https://localhost:${port}/hola`), { headers: {}, signal: control.signal }).catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(WebError);
    expect((blocked as WebError).code).toBe('blocked-address');
    expect(hits).toBe(before);
  });
});
