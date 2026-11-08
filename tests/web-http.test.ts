/** El cliente web: dominios en cada redirección, tiempo y tamaño máximos, y errores que no revelan las claves. */
import { describe, expect, it } from 'vitest';
import { parseTrustedHosts, WebError } from '../src/node/web/guard';
import { createHttpClient, MAX_REDIRECTS, type Transport } from '../src/node/web/http';
import { fakeWeb } from './helpers/web';

const ALLOW = ['api.openverse.org', 'cdn.pixabay.com'] as const;
const text = (b: Uint8Array): string => new TextDecoder().decode(b);

async function failure(p: Promise<unknown>): Promise<WebError> {
  try {
    await p;
  } catch (e) {
    return e as WebError;
  }
  throw new Error('tenía que fallar');
}

describe('createHttpClient', () => {
  it('devuelve el cuerpo y manda el user-agent propio', async () => {
    const web = fakeWeb([{ match: /openverse/, body: { ok: true } }]);
    const res = await web.http.get('https://api.openverse.org/v1/images/?q=gato', { allow: ALLOW });
    expect(JSON.parse(text(res.body))).toEqual({ ok: true });
    expect(res.url).toBe('https://api.openverse.org/v1/images/');
    expect(web.sent[0]!.headers['user-agent']).toBe('prueba');
  });

  it('rechaza antes de pedir lo que no está en la lista, y no hace ningún pedido', async () => {
    const web = fakeWeb([{ match: /./, body: 'x' }]);
    for (const url of ['https://evil.example.com/a', 'http://api.openverse.org/', 'https://127.0.0.1/', 'https://api.openverse.org:9999/']) {
      expect(await failure(web.http.get(url, { allow: ALLOW })), url).toBeInstanceOf(WebError);
    }
    expect(web.requests).toEqual([]);
  });

  it('sigue una redirección dentro de la lista, y la comprueba: una a otro dominio se corta', async () => {
    const ok = fakeWeb([
      { match: 'https://api.openverse.org/a', status: 302, headers: { location: 'https://cdn.pixabay.com/b' }, body: '' },
      { match: 'https://cdn.pixabay.com/b', body: 'llegó' },
    ]);
    expect(text((await ok.http.get('https://api.openverse.org/a', { allow: ALLOW })).body)).toBe('llegó');

    const bad = fakeWeb([
      { match: 'https://api.openverse.org/a', status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' }, body: '' },
      { match: /169/, body: 'secreto' },
    ]);
    const err = await failure(bad.http.get('https://api.openverse.org/a', { allow: ALLOW }));
    expect(err.code).toBe('blocked-address');
    expect(bad.requests).toEqual(['https://api.openverse.org/a']);

    const other = fakeWeb([{ match: /a$/, status: 301, headers: { location: 'https://evil.example.com/' }, body: '' }]);
    expect((await failure(other.http.get('https://api.openverse.org/a', { allow: ALLOW }))).code).toBe('blocked-host');
  });

  it('las redirecciones relativas se resuelven, y hay un máximo', async () => {
    const rel = fakeWeb([
      { match: 'https://api.openverse.org/a', status: 301, headers: { location: '/b' }, body: '' },
      { match: 'https://api.openverse.org/b', body: 'b' },
    ]);
    expect(text((await rel.http.get('https://api.openverse.org/a', { allow: ALLOW })).body)).toBe('b');
    const loop = fakeWeb([{ match: /./, status: 302, headers: { location: 'https://api.openverse.org/otra' }, body: '' }]);
    expect((await failure(loop.http.get('https://api.openverse.org/a', { allow: ALLOW }))).code).toBe('too-many-redirects');
    expect(loop.requests).toHaveLength(MAX_REDIRECTS + 1);
  });

  it('al cambiar de dominio en una redirección no viaja la autorización', async () => {
    const web = fakeWeb([
      { match: 'https://api.openverse.org/a', status: 302, headers: { location: 'https://cdn.pixabay.com/b' }, body: '' },
      { match: 'https://cdn.pixabay.com/b', body: 'ok' },
    ]);
    await web.http.get('https://api.openverse.org/a', { allow: ALLOW, headers: { Authorization: 'Client-ID SECRETA', Accept: 'x/y' } });
    expect(web.sent[0]!.headers['authorization']).toBe('Client-ID SECRETA');
    expect(web.sent[1]!.headers['authorization']).toBeUndefined();
    expect(web.sent[1]!.headers['accept']).toBe('x/y');
  });

  it('tiempo máximo: un servidor que no responde se corta', async () => {
    const web = fakeWeb([{ match: /./, hang: true }]);
    const t0 = Date.now();
    const err = await failure(web.http.get('https://api.openverse.org/lento', { allow: ALLOW, timeoutMs: 80 }));
    expect(err.code).toBe('timeout');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('tamaño máximo: por el encabezado y por lo que llega de verdad', async () => {
    const big = new Uint8Array(5000);
    const declared = fakeWeb([{ match: /./, body: big }]);
    expect((await failure(declared.http.get('https://cdn.pixabay.com/g', { allow: ALLOW, maxBytes: 1000 }))).code).toBe('too-large');

    // Un servidor que miente en content-length: el tope se aplica al leer.
    const lying = fakeWeb([{ match: /./, body: big, headers: { 'content-length': '10' } }]);
    expect((await failure(lying.http.get('https://cdn.pixabay.com/g', { allow: ALLOW, maxBytes: 1000 }))).code).toBe('too-large');
    expect((await lying.http.get('https://cdn.pixabay.com/g', { allow: ALLOW, maxBytes: 10_000 })).body.length).toBe(5000);
  });

  it('un tipo de contenido que no es el esperado se corta sin bajar el cuerpo', async () => {
    const web = fakeWeb([{ match: /./, type: 'text/html', body: '<html>' }]);
    const err = await failure(web.http.get('https://api.openverse.org/x', { allow: ALLOW, accept: (t) => t.includes('json') }));
    expect(err.code).toBe('bad-type');
  });

  it('los códigos de estado se traducen y los mensajes no llevan la consulta (donde va la clave)', async () => {
    const web = fakeWeb([
      { match: /401/, status: 401, body: '' },
      { match: /429/, status: 429, body: '' },
      { match: /500/, status: 500, body: '' },
    ]);
    const url = (n: number) => `https://api.openverse.org/${n}?key=CLAVE-SECRETA-123&q=x`;
    const e401 = await failure(web.http.get(url(401), { allow: ALLOW }));
    const e429 = await failure(web.http.get(url(429), { allow: ALLOW }));
    const e500 = await failure(web.http.get(url(500), { allow: ALLOW }));
    expect([e401.code, e429.code, e500.code]).toEqual(['auth', 'rate-limit', 'http']);
    expect(e500.status).toBe(500);
    for (const e of [e401, e429, e500]) expect(e.message).not.toContain('CLAVE-SECRETA');
    // Un dominio no permitido tampoco repite la consulta.
    const blocked = await failure(web.http.get('https://evil.example.com/x?key=CLAVE-SECRETA-123', { allow: ALLOW }));
    expect(blocked.message).not.toContain('CLAVE-SECRETA');
  });

  it('un error de conexión se informa con el dominio, sin detalles internos', async () => {
    const transport: Transport = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:443'), { code: 'ECONNREFUSED' });
    };
    const err = await failure(createHttpClient({ transport, userAgent: 'x' }).get('https://api.openverse.org/x?key=S', { allow: ALLOW }));
    expect(err.code).toBe('network');
    expect(err.message).toBe('No se pudo conectar con api.openverse.org (ECONNREFUSED).');
  });

  it('un dominio de confianza vale solo si el pedido empieza en él: un tercero no lleva a la red propia', async () => {
    const trusted = parseTrustedHosts('nas.lan');
    const web = fakeWeb([
      { match: 'https://api.openverse.org/a', status: 302, headers: { location: 'http://nas.lan/secreto' }, body: '' },
      { match: 'http://nas.lan/secreto', body: 'datos de la red' },
      { match: 'http://nas.lan/ok', status: 302, headers: { location: 'https://cdn.pixabay.com/f' }, body: '' },
      { match: 'https://cdn.pixabay.com/f', status: 302, headers: { location: 'http://nas.lan/otra' }, body: '' },
    ]);
    // Empieza en un host de catálogo y redirige a uno declarado: se corta.
    const err = await failure(web.http.get('https://api.openverse.org/a', { allow: ALLOW, trusted }));
    expect(err.code).toBe('blocked-host');
    expect(web.requests).toEqual(['https://api.openverse.org/a']);
    // Empieza en el declarado, pasa a un público y vuelve al declarado: tampoco.
    const back = await failure(web.http.get('http://nas.lan/ok', { allow: ALLOW, trusted }));
    expect(back.code).toBe('blocked-host');
    expect(web.requests).not.toContain('http://nas.lan/otra');
  });
});

