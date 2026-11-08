/** Qué direcciones puede visitar el servidor: solo https, solo los dominios de las APIs, nunca direcciones locales ni privadas. */
import { describe, expect, it } from 'vitest';
import { checkUrl, extraHosts, FONT_HOSTS, guardedLookup, hostAllowed, IMAGE_API_HOSTS, IMAGE_FILE_HOSTS, isNeverTrusted, isPublicAddress, parseTrustedHosts, redactUrl, WebError } from '../src/node/web/guard';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '100.63.255.255', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e', '::ffff:8.8.8.8'])('%s es pública', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '0.0.0.0', '10.0.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '192.0.2.5', '198.18.0.1', '203.0.113.9',
    '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:7f00:1', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::1', '2001::1', 'fec0::1',
    'abc', '', '999.1.1.1', '1.2.3', '8.8.8.8.8', '::1::2', '12345::1',
  ])('%s no lo es', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('hostAllowed y checkUrl', () => {
  const allow = [...IMAGE_API_HOSTS, ...IMAGE_FILE_HOSTS];

  it('nombres exactos y subdominios con comodín', () => {
    expect(hostAllowed('api.openverse.org', allow)).toBe(true);
    expect(hostAllowed('API.Openverse.org.', allow)).toBe(true);
    expect(hostAllowed('live.staticflickr.com', allow)).toBe(true);
    expect(hostAllowed('staticflickr.com', allow)).toBe(false);
    expect(hostAllowed('evilstaticflickr.com', allow)).toBe(false);
    expect(hostAllowed('api.openverse.org.evil.com', allow)).toBe(false);
    expect(hostAllowed('openverse.org', allow)).toBe(false);
  });

  it('solo https, sin usuario, en el puerto estándar y con un dominio de la lista', () => {
    expect(checkUrl('https://api.openverse.org/v1/images/?q=gato', allow).host).toBe('api.openverse.org');
    for (const bad of ['http://api.openverse.org/', 'ftp://api.openverse.org/', 'file:///etc/passwd', 'https://user:clave@api.openverse.org/', 'https://api.openverse.org:8443/', 'https://evil.example.com/', 'no es una dirección', 'https://api.openverse.org.evil.com/']) {
      expect(() => checkUrl(bad, allow), bad).toThrow(WebError);
    }
  });

  it('no visita direcciones IP, ni escritas de otra manera', () => {
    for (const bad of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/', 'https://2130706433/', 'https://0x7f.0.0.1/', 'https://[::ffff:7f00:1]/']) {
      const err = (() => {
        try {
          checkUrl(bad, allow);
          return null;
        } catch (e) {
          return e as WebError;
        }
      })();
      expect(err, bad).toBeInstanceOf(WebError);
      expect(err!.code, bad).toBe('blocked-address');
    }
  });

  it('cada conjunto de dominios es el de sus APIs', () => {
    expect(FONT_HOSTS).toEqual(['www.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
    expect(() => checkUrl('https://api.openverse.org/', FONT_HOSTS)).toThrow(/no está entre los dominios permitidos/);
  });

  it('AGENDA_IMAGE_HOSTS agrega dominios válidos y descarta lo raro', () => {
    expect(extraHosts('fotos.ejemplo.org, *.cdn.ejemplo.com ,127.0.0.1,localhost,https://x.com,')).toEqual(['fotos.ejemplo.org', '*.cdn.ejemplo.com']);
    expect(extraHosts(undefined)).toEqual([]);
  });
});

describe('redactUrl', () => {
  it('saca la consulta, donde van las claves', () => {
    expect(redactUrl('https://pixabay.com/api/?key=SECRETA&q=gato')).toBe('https://pixabay.com/api/');
    expect(redactUrl('basura')).toBe('(dirección inválida)');
  });
});

describe('guardedLookup', () => {
  const resolver = (list: Array<{ address: string; family: 4 | 6 }>) => (_h: string, _o: object, cb: (e: null, a: typeof list) => void) => cb(null, list);
  const run = (lookup: ReturnType<typeof guardedLookup>, all: boolean, host = 'x.example') =>
    new Promise<{ err: Error | null; address: unknown }>((resolve) => lookup(host, { all } as never, (err, address) => resolve({ err, address })));

  it('deja pasar un dominio con direcciones públicas', async () => {
    const lookup = guardedLookup(resolver([{ address: '8.8.8.8', family: 4 }]) as never);
    expect(await run(lookup, true)).toEqual({ err: null, address: [{ address: '8.8.8.8', family: 4 }] });
    expect((await run(lookup, false)).address).toBe('8.8.8.8');
  });

  it('rechaza un dominio que apunta a una dirección local, aunque tenga también una pública', async () => {
    for (const list of [[{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.5', family: 4 }], [{ address: '::1', family: 6 }], []] as const) {
      const lookup = guardedLookup(resolver([...list]) as never);
      const { err } = await run(lookup, true);
      expect(err).toBeInstanceOf(WebError);
      expect((err as WebError).code).toBe('blocked-address');
    }
  });

  it('con la resolución de verdad, «localhost» no se visita', async () => {
    const { err } = await run(guardedLookup(), true, 'localhost');
    expect(err).toBeInstanceOf(WebError);
    expect((err as WebError).code).toBe('blocked-address');
  });
});

describe('dominios de confianza (AGENDA_TRUSTED_HOSTS)', () => {
  it('lee nombres, comodines, puertos y direcciones, y descarta lo peligroso o raro', () => {
    const list = parseTrustedHosts('nas.lan, *.casa.lan, 192.168.1.20:8080, fotos.ejemplo.org:8443, *.local, *, *.com, *.co.uk.x, [::1], http://x.lan, ex ample.lan, 10.0.0.1:99999, ');
    expect(list).toEqual([
      { host: 'nas.lan', wildcard: false, port: null },
      { host: 'casa.lan', wildcard: true, port: null },
      { host: '192.168.1.20', wildcard: false, port: 8080 },
      { host: 'fotos.ejemplo.org', wildcard: false, port: 8443 },
      { host: 'local', wildcard: true, port: null },
      { host: 'co.uk.x', wildcard: true, port: null },
    ]);
    expect(parseTrustedHosts(undefined)).toEqual([]);
  });

  it('un dominio de confianza se visita por http o https, aunque sea de la red local, en su puerto; lo demás sigue cerrado', () => {
    const trusted = parseTrustedHosts('nas.lan,*.casa.lan,192.168.1.20:8080');
    const ok = (u: string): boolean => {
      try {
        checkUrl(u, IMAGE_API_HOSTS, trusted);
        return true;
      } catch {
        return false;
      }
    };
    expect(ok('http://nas.lan/fotos/a.png')).toBe(true);
    expect(ok('https://nas.lan:443/a.png')).toBe(true);
    expect(ok('http://nas.lan:8080/a.png')).toBe(false);
    expect(ok('http://galeria.casa.lan/x')).toBe(true);
    expect(ok('http://casa.lan/x')).toBe(false);
    expect(ok('http://192.168.1.20:8080/a.png')).toBe(true);
    expect(ok('http://192.168.1.20/a.png')).toBe(false);
    expect(ok('http://192.168.1.21:8080/a.png')).toBe(false);
    expect(ok('http://127.0.0.1/')).toBe(false);
    expect(ok('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(ok('http://evil.example.com/')).toBe(false);
    expect(ok('http://user:clave@nas.lan/')).toBe(false);
    expect(ok('ftp://nas.lan/')).toBe(false);
    expect(ok('http://nas.lan.evil.com/')).toBe(false);
    // Sin lista de confianza, http nunca.
    expect(() => checkUrl('http://nas.lan/', IMAGE_API_HOSTS)).toThrow(WebError);
  });

  it('un comodín sobre un sufijo público o una declaración que no puede coincidir se descarta', () => {
    expect(parseTrustedHosts('*.co.uk,*.com.br,*.github.io,*.herokuapp.com,*.com.ar,127.1,010.0.0.1,0x7f.1,casa.github.io')).toEqual([{ host: 'casa.github.io', wildcard: false, port: null }]);
  });

  it('un nombre de confianza que apunta a enlace local, 0.0.0.0 o multicast no se conecta; a la red propia sí', async () => {
    const resolver = (list: Array<{ address: string; family: 4 | 6 }>) => (_h: string, _o: object, cb: (e: null, a: typeof list) => void) => cb(null, list);
    const run = (list: Array<{ address: string; family: 4 | 6 }>) =>
      new Promise<Error | null>((resolve) => guardedLookup(resolver(list) as never, 'lan')('nas.lan', { all: true } as never, (err) => resolve(err)));
    expect(await run([{ address: '192.168.1.20', family: 4 }])).toBeNull();
    expect(await run([{ address: '127.0.0.1', family: 4 }])).toBeNull();
    expect(await run([{ address: 'fd00::5', family: 6 }])).toBeNull();
    for (const address of ['169.254.169.254', '0.0.0.0', '224.0.0.1', '::', 'fe80::1', 'ff02::1', '::ffff:169.254.169.254']) {
      const err = await run([{ address, family: address.includes(':') ? 6 : 4 }]);
      expect(err, address).toBeInstanceOf(WebError);
    }
    expect(isNeverTrusted('10.0.0.1')).toBe(false);
  });
});

