/**
 * Los errores de hablar con un proveedor de IA, en clases que la interfaz sabe explicar («la clave no
 * vale», «demasiados pedidos», «sin conexión»). El mensaje del proveedor va aparte, recortado: puede ser
 * útil para entender qué pasó, pero no se muestra como si fuera nuestro.
 */

export type AiErrorKind = 'auth' | 'rateLimit' | 'badRequest' | 'notFound' | 'server' | 'network' | 'aborted' | 'timeout' | 'protocol' | 'refusal' | 'length' | 'rounds';

/** Más que esto de un mensaje de error del proveedor no ayuda y puede traer de todo. */
const DETAIL_MAX = 400;

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status?: number,
    /** Cuánto esperar antes de volver a probar, si el proveedor lo dijo. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }

  /** ¿Conviene volver a probar el mismo pedido? Solo si el proveedor está saturado (nunca un pedido mal hecho). */
  get retryable(): boolean {
    return this.kind === 'rateLimit' || (this.kind === 'server' && (this.status === 503 || this.status === 529 || this.status === 502));
  }
}

/** El mensaje de error de un cuerpo JSON de cualquiera de los tres proveedores. */
function providerMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const err = (body as { error?: unknown }).error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  const m = (body as { message?: unknown }).message;
  return typeof m === 'string' ? m : '';
}

/** `Retry-After` en segundos o como fecha HTTP. */
export function retryAfterMs(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 600) * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - now, 600_000)) : undefined;
}

/** El error de una respuesta HTTP que no fue 2xx. */
export function httpError(status: number, body: unknown, headers?: { get(name: string): string | null }): AiError {
  const detail = providerMessage(body).slice(0, DETAIL_MAX);
  const wait = retryAfterMs(headers?.get('retry-after'));
  const kind: AiErrorKind =
    status === 401 || status === 403 ? 'auth' : status === 429 ? 'rateLimit' : status === 404 ? 'notFound' : status === 408 ? 'timeout' : status >= 500 || status === 529 ? 'server' : 'badRequest';
  return new AiError(kind, detail || `HTTP ${status}`, status, wait);
}

/** Un `fetch` que no llegó a tener respuesta: sin red, cancelado o vencido. */
export function fetchFailure(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'AbortError') return new AiError('aborted', 'Cancelado.');
  if (name === 'TimeoutError') return new AiError('timeout', 'El proveedor no contestó a tiempo.');
  const message = err instanceof Error ? err.message : String(err);
  return new AiError('network', message.slice(0, DETAIL_MAX));
}
