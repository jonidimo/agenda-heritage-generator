/**
 * Qué direcciones puede visitar el servidor MCP cuando busca imágenes y fuentes: solo `https`, solo los
 * dominios de las APIs que usa, nunca una dirección local, privada ni reservada. Son funciones puras
 * (las prueba `tests/web-guard.test.ts`); `http.ts` las aplica en cada pedido y en cada redirección.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { isIP } from 'node:net';

/** Un error de red con un código estable (para que quien llama decida) y un mensaje que se puede mostrar tal cual. */
export type WebErrorCode = 'blocked-host' | 'blocked-address' | 'bad-url' | 'timeout' | 'too-large' | 'too-many-redirects' | 'http' | 'rate-limit' | 'auth' | 'network' | 'bad-type' | 'aborted';

export class WebError extends Error {
  constructor(
    readonly code: WebErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'WebError';
  }
}

/** Una dirección sin la consulta ni el fragmento: ahí van las claves de las APIs, que no se muestran ni se guardan. */
export function redactUrl(url: string | URL): string {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '(dirección inválida)';
  }
}

/** Dominios de las APIs de búsqueda de imágenes (y de la descarga de miniaturas de Openverse). */
export const IMAGE_API_HOSTS = ['api.openverse.org', 'pixabay.com', 'api.unsplash.com', 'api.pexels.com', 'commons.wikimedia.org', 'www.deviantart.com'] as const;
/**
 * Dominios de donde se bajan los archivos de las imágenes: los de Pixabay y Unsplash, y los grandes
 * repositorios que alimentan a Openverse. Otros dominios se agregan a conciencia con `AGENDA_IMAGE_HOSTS`.
 */
export const IMAGE_FILE_HOSTS = ['cdn.pixabay.com', 'pixabay.com', 'images.unsplash.com', 'api.openverse.org', 'upload.wikimedia.org', '*.staticflickr.com', 'images.pexels.com', '*.wixmp.com', '*.deviantart.net'] as const;
/** Dominios de Google Fonts: la API de búsqueda, la hoja de estilos con la dirección de cada archivo y los archivos. */
export const FONT_HOSTS = ['www.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com'] as const;

/** Los dominios extra que pone la persona (`AGENDA_IMAGE_HOSTS`, separados por comas): nombres exactos o `*.dominio`, sin direcciones IP. */
export function extraHosts(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h));
}

/** ¿Este nombre de servidor está permitido? Un nombre exacto, o `*.dominio` para sus subdominios (no para el dominio solo). */
export function hostAllowed(host: string, allow: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allow.some((rule) => (rule.startsWith('*.') ? h.endsWith(rule.slice(1)) && h.length > rule.length - 1 : h === rule));
}

/**
 * Un dominio (o dirección) que la persona declara de confianza con `AGENDA_TRUSTED_HOSTS`: se visita aunque sea de su
 * red local o privada, por `http` o `https`, en el puerto que indique (80 y 443 por defecto). Es una decisión y una
 * responsabilidad suya: ver el aviso de la guía. Todo lo demás sigue con las protecciones de siempre.
 */
export interface TrustedHost {
  /** Nombre exacto, `*.sufijo` o una dirección IPv4. */
  host: string;
  wildcard: boolean;
  /** Puerto permitido (null: 80 y 443). */
  port: number | null;
}

/** Sufijos de una sola etiqueta que se admiten con comodín: los que se usan en redes propias. */
const LOCAL_SUFFIXES = new Set(['lan', 'local', 'home', 'internal', 'localdomain', 'intranet', 'corp']);

/** Sufijos públicos donde cualquiera registra un sitio: un comodín sobre ellos abriría sitios de terceros. */
const PUBLIC_SUFFIXES = new Set([
  'github.io', 'gitlab.io', 'herokuapp.com', 'vercel.app', 'netlify.app', 'blogspot.com', 'wordpress.com', 'pages.dev', 'workers.dev', 'web.app',
  'firebaseapp.com', 'appspot.com', 'cloudfront.net', 'amazonaws.com', 'azurewebsites.net', 'onrender.com', 'glitch.me', 'repl.co', 'ngrok.io',
  'ngrok-free.app', 'fly.dev', 'surge.sh', 'neocities.org', 'weebly.com', 'wixsite.com', 'tumblr.com', 'medium.com', 'substack.com', 'duckdns.org', 'no-ip.org',
]);
const isPublicSuffix = (host: string): boolean => PUBLIC_SUFFIXES.has(host) || /^(?:co|com|org|net|gov|edu|ac|or|ne|go|gob)\.[a-z]{2}$/.test(host);

/** Lee la lista (separada por comas): `nas.lan`, `*.casa.lan`, `192.168.1.20:8080`, `fotos.ejemplo.org`. Lo que no es un nombre válido se descarta (nunca `*` solo ni `*.com`). */
export function parseTrustedHosts(value: string | undefined): TrustedHost[] {
  const out: TrustedHost[] = [];
  for (const raw of (value ?? '').split(',')) {
    const m = /^(\*\.)?([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)(?::(\d{1,5}))?$/.exec(raw.trim().toLowerCase());
    if (!m) continue;
    const wildcard = m[1] !== undefined;
    const host = m[2]!;
    const port = m[3] ? Number(m[3]) : null;
    if (port !== null && (port < 1 || port > 65535)) continue;
    if (isIP(host) === 6) continue;
    // Solo dígitos y puntos que no son una IPv4 completa (`127.1`, `010.0.0.1`): el navegador las normaliza y nunca coincidirían.
    if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*$/.test(host) && isIP(host) === 0) continue;
    if (wildcard) {
      const labels = host.split('.');
      if (isIP(host) !== 0 || (labels.length < 2 && !LOCAL_SUFFIXES.has(host)) || isPublicSuffix(host)) continue;
    }
    if (!wildcard && isIP(host) === 0 && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) continue;
    out.push({ host, wildcard, port });
  }
  return out;
}

/** ¿Esta dirección es de un dominio declarado de confianza (y en un puerto que se admite)? */
export function isTrusted(url: URL, trusted: readonly TrustedHost[]): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  const port = url.port !== '' ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return trusted.some((t) => (t.wildcard ? host.endsWith(`.${t.host}`) : host === t.host) && (t.port === null ? port === 80 || port === 443 : port === t.port));
}

/**
 * Valida una dirección antes de pedirla: `https`, sin usuario ni contraseña, puerto 443, un nombre de
 * dominio (no una dirección IP) de la lista. Devuelve la dirección ya normalizada.
 */
export function checkUrl(raw: string, allow: readonly string[], trusted: readonly TrustedHost[] = []): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebError('bad-url', 'La dirección no es válida.');
  }
  // Un dominio que la persona declaró de confianza (su red, sus sitios): se visita tal como lo declaró.
  if (trusted.length > 0 && isTrusted(url, trusted)) return url;
  if (url.protocol !== 'https:') throw new WebError('blocked-host', `Solo se visitan direcciones https (no «${url.protocol.replace(':', '')}»).`);
  if (url.username || url.password) throw new WebError('blocked-host', 'No se admiten direcciones con usuario o contraseña.');
  if (url.port !== '' && url.port !== '443') throw new WebError('blocked-host', 'Solo se admite el puerto estándar (443).');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) throw new WebError('blocked-address', 'No se visitan direcciones IP: solo los dominios de las APIs.');
  if (!hostAllowed(host, allow)) throw new WebError('blocked-host', `«${host}» no está entre los dominios permitidos (${allow.join(', ')}).`);
  return url;
}

/** Los cuatro números de una dirección IPv4 en notación decimal con puntos, o `null`. */
function v4Parts(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  return parts.every((n) => n <= 255) ? parts : null;
}

function publicV4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // «esta red», privada, bucle local
  if (a === 100 && b >= 64 && b <= 127) return false; // espacio compartido de los operadores (CGNAT)
  if (a === 169 && b === 254) return false; // enlace local (incluye los metadatos de la nube)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocolo IETF, documentación
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // pruebas de rendimiento
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast, reservadas y difusión
  return true;
}

/** Los ocho grupos de 16 bits de una dirección IPv6 (también con una IPv4 al final), o `null`. */
function v6Groups(ip: string): number[] | null {
  let text = ip.split('%')[0]!.toLowerCase();
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const v4 = v4Parts(tail[1]!);
    if (!v4) return null;
    text = `${text.slice(0, tail.index)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const all = [...head, ...(halves.length === 2 ? Array<string>(fill).fill('0') : []), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** ¿Es una dirección IP de internet, a la que tiene sentido conectarse? Falso para las locales, privadas, reservadas y las que no se pueden leer. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip.split('%')[0]!);
  if (kind === 4) {
    const v4 = v4Parts(ip);
    return v4 !== null && publicV4(v4);
  }
  if (kind !== 6) return false;
  const g = v6Groups(ip);
  if (!g) return false;
  const embedded = (hi: number, lo: number): boolean => publicV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(g[6]!, g[7]!); // IPv4 dentro de IPv6
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(g[6]!, g[7]!); // NAT64
  if (g[0] === 0x2002) return embedded(g[1]!, g[2]!); // 6to4
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return false; // :: y ::1
  if (g[0]! >= 0xfe80 && g[0]! <= 0xfebf) return false; // enlace local
  if (g[0]! >= 0xfec0 && g[0]! <= 0xfeff) return false; // sitio local (en desuso)
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // únicas locales
  if ((g[0]! & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return false; // Teredo, documentación
  if ((g[0]! & 0xe000) !== 0x2000) return false; // solo se asignó 2000::/3 a internet
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type Resolver = (hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

/**
 * La resolución de nombres que usa la conexión: si el dominio apunta (también a medias, con varias
 * direcciones) a una dirección que no es pública, la conexión falla. Se comprueba la dirección a la que
 * de verdad se conecta, así un dominio que cambia de dirección entre la consulta y la conexión no
 * puede llevar a una red interna.
 */
/** Direcciones a las que ni un dominio de confianza puede apuntar (solo si se declara esa IP tal cual): enlace local (metadatos de la nube), sin especificar y multicast. */
export function isNeverTrusted(ip: string): boolean {
  const kind = isIP(ip.split('%')[0]!);
  if (kind === 4) {
    const p = v4Parts(ip);
    return p === null || p[0] === 0 || (p[0] === 169 && p[1] === 254) || p[0] >= 224;
  }
  if (kind !== 6) return true;
  const g = v6Groups(ip);
  if (!g) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isNeverTrusted(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
  return g.every((x) => x === 0) || (g[0]! >= 0xfe80 && g[0]! <= 0xfebf) || (g[0]! & 0xff00) === 0xff00;
}

/**
 * La resolución de nombres de las conexiones. `policy` 'public': solo direcciones de internet. 'lan' (un dominio de
 * confianza): también las de la red propia, pero nunca enlace local, sin especificar ni multicast: la persona declaró
 * un nombre, no esas direcciones (un nombre que cambia de dirección no puede llevar a los metadatos de la nube).
 */
export function guardedLookup(resolver: Resolver = dnsLookup as unknown as Resolver, policy: 'public' | 'lan' = 'public') {
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    resolver(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 4);
      const ok = policy === 'lan' ? (a: LookupAddress): boolean => !isNeverTrusted(a.address) : (a: LookupAddress): boolean => isPublicAddress(a.address);
      if (addresses.length === 0 || addresses.some((a) => !ok(a))) {
        return callback(new WebError('blocked-address', `«${hostname}» apunta a una dirección que no es pública: no se conecta.`), '', 4);
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}
