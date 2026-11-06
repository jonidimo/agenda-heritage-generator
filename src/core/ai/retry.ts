/**
 * Volver a probar un pedido cuando el proveedor está saturado (429, 502, 503, 529): con espera
 * exponencial y una variación al azar (para que muchos clientes no vuelvan todos juntos), respetando
 * `Retry-After` si lo dio. Nunca se repite un pedido mal hecho ni uno cancelado.
 */
import { AiError, fetchFailure } from './errors';

export interface RetryPolicy {
  retries: number;
  /** Primera espera, en ms (después se duplica). */
  baseMs: number;
  /** Ninguna espera pasa de esto; si el proveedor pide más, no se vuelve a probar. */
  maxMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { retries: 2, baseMs: 1_000, maxMs: 30_000 };

/** Espera `ms` o hasta que se cancele (entonces lanza `aborted`). La pone quien llama: el núcleo no tiene relojes. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** Cuánto esperar antes del intento `attempt` (0 = el primer reintento), o `null` si no conviene volver a probar. */
export function retryDelay(err: AiError, attempt: number, policy: RetryPolicy = DEFAULT_RETRY, random: () => number = Math.random): number | null {
  if (!err.retryable || attempt >= policy.retries) return null;
  if (err.retryAfterMs !== undefined) return err.retryAfterMs <= policy.maxMs ? err.retryAfterMs : null;
  const exp = policy.baseMs * 2 ** attempt;
  return Math.min(policy.maxMs, Math.round(exp * (0.5 + random())));
}

export async function withRetry<T>(run: () => Promise<T>, signal: AbortSignal, sleep: Sleep, policy: RetryPolicy = DEFAULT_RETRY, random: () => number = Math.random): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (raw) {
      const err = fetchFailure(raw);
      const wait = signal.aborted ? null : retryDelay(err, attempt, policy, random);
      if (wait === null) throw err;
      await sleep(wait, signal);
    }
  }
}
