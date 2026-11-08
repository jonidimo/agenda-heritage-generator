/** Un «internet» falso para las pruebas: respuestas a medida por dirección, con el cliente web real encima (así se prueban de verdad los dominios, los topes y las redirecciones). */
import { createHttpClient, type HttpClient, type Transport } from '../../src/node/web/http';

export interface Route {
  /** La dirección completa (con consulta), o una expresión regular. */
  match: RegExp | string;
  status?: number;
  type?: string;
  body?: Uint8Array | string | object;
  headers?: Record<string, string>;
  /** Una respuesta que nunca llega (para probar el tiempo máximo). */
  hang?: boolean;
}

export interface FakeWeb {
  http: HttpClient;
  /** Las direcciones pedidas, en orden, con su consulta. */
  requests: string[];
  /** Los encabezados de cada pedido. */
  sent: Array<{ url: string; headers: Record<string, string> }>;
  routes: Route[];
}

export function fakeWeb(routes: Route[]): FakeWeb {
  const requests: string[] = [];
  const sent: FakeWeb['sent'] = [];
  const transport: Transport = async (url, { headers, signal }) => {
    const full = url.toString();
    requests.push(full);
    sent.push({ url: full, headers });
    const route = routes.find((r) => (typeof r.match === 'string' ? full === r.match : r.match.test(full)));
    if (!route) return { status: 404, headers: { 'content-type': 'text/plain' }, body: chunks(new TextEncoder().encode('no encontrado')) };
    if (route.hang) {
      await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true }));
    }
    const raw = route.body ?? '';
    const bytes = raw instanceof Uint8Array ? raw : new TextEncoder().encode(typeof raw === 'string' ? raw : JSON.stringify(raw));
    const type = route.type ?? (raw instanceof Uint8Array ? 'application/octet-stream' : typeof raw === 'string' ? 'text/plain' : 'application/json');
    return { status: route.status ?? 200, headers: { 'content-type': type, 'content-length': String(bytes.length), ...route.headers }, body: chunks(bytes) };
  };
  return { http: createHttpClient({ transport, userAgent: 'prueba' }), requests, sent, routes };
}

async function* chunks(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += 16384) yield bytes.subarray(i, i + 16384);
}
