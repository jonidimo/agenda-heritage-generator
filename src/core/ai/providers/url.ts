/**
 * Direcciones de los servidores de modelos. `0.0.0.0` (y `[::]` en IPv6) es donde un servidor escucha
 * «en todas las interfaces»: llama.cpp la muestra al arrancar («listening on http://0.0.0.0:8080»),
 * pero no es una dirección a la que conectarse. Desde esta misma computadora, a ese servidor se llega
 * por 127.0.0.1 (o [::1]); así se usa, aunque la persona haya escrito la otra.
 */

const LISTEN_ALL: Readonly<Record<string, string>> = { '0.0.0.0': '127.0.0.1', '[::]': '[::1]' };

/** ¿La dirección usa la de «todas las interfaces» (0.0.0.0 o [::])? */
export function listensOnAll(url: string): boolean {
  try {
    return new URL(url.trim()).hostname in LISTEN_ALL;
  } catch {
    return false;
  }
}

/** La dirección a la que conectarse: la misma, con 0.0.0.0 y [::] cambiadas por las de esta computadora. */
export function connectableBase(url: string): string {
  const trimmed = url.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const to = LISTEN_ALL[u.hostname];
  if (!to) return trimmed;
  u.hostname = to;
  return u.toString().replace(/\/+$/, '');
}
