/**
 * El enlace del servidor MCP con la aplicación de escritorio abierta (ver `electron/lib/live.mjs`):
 * encuentra la aplicación, se conecta a su socket local y le hace los pedidos de `core/live/protocol.ts`.
 *
 * El servidor solo lo usa cuando el pedido trae `app: true`; sin eso nada de acá se carga ni se conecta.
 * Una conexión por servidor, abierta al primer uso y vuelta a abrir si la aplicación se cerró y se reabrió.
 */
import { connectLive, findLiveApps, LIVE_ERRORS, LiveError } from '../../electron/lib/live.mjs';
import type { LiveInfo, LiveMethodName } from '../core/live/protocol';

/** Una conexión abierta: pide un método y espera la respuesta. */
export interface AppConnection {
  request(method: LiveMethodName, params?: unknown): Promise<unknown>;
  close(): void;
}

/**
 * Cómo se abre una conexión: `null` si la aplicación no está corriendo. Con `stale`, se encontraron datos
 * de conexión (un `live.json`) pero nadie contestó: quedaron de una sesión que se cerró de golpe.
 */
export type AppOpener = () => Promise<AppConnection | { stale: boolean } | null>;

/** La aplicación de escritorio no está abierta (o este equipo no la tiene). */
export class AppNotRunning extends Error {
  constructor(stale = false) {
    super(
      stale
        ? 'La aplicación Heritage Studio no contesta: los datos de conexión que encontré quedaron de una sesión anterior (se cerró de golpe o se cortó la luz). Abrí la aplicación de escritorio con la agenda, o trabajá sobre un archivo con «path» (sin «app»).'
        : 'No encuentro la aplicación Heritage Studio abierta. Abrí la aplicación de escritorio con la agenda, o trabajá sobre un archivo con «path» (sin «app»).',
    );
    this.name = 'AppNotRunning';
  }
}

/** La conexión se cortó (la aplicación se cerró): conviene volver a abrirla. */
const isConnectionError = (err: unknown): boolean => err instanceof LiveError && (err.code === LIVE_ERRORS.unavailable || err.code === LIVE_ERRORS.timeout);

/**
 * Los pedidos que se pueden repetir sin efecto: leer o mostrar. Cambiar, abrir o cargar una agenda no se repite
 * nunca (un pedido que venció puede haberse aplicado igual: repetirlo duplicaría el cambio).
 */
const REPEATABLE: ReadonlySet<LiveMethodName> = new Set(['design.info', 'design.get', 'library.list', 'view.reveal']);

/** El mensaje para quien usa el modelo: el de la aplicación si lo trae; si no, uno claro. */
function readable(err: unknown): Error {
  if (err instanceof AppNotRunning) return err;
  if (err instanceof LiveError) {
    if (err.code === LIVE_ERRORS.unavailable) return new Error(`No pude hablar con la aplicación Heritage Studio (${err.message}). ¿Sigue abierta?`);
    if (err.code === LIVE_ERRORS.timeout) return new Error('La aplicación no contestó a tiempo: puede estar ocupada o con un diálogo abierto.');
    if (err.code === LIVE_ERRORS.unauthorized) return new Error('La aplicación no aceptó el enlace (token distinto): cerrala y volvela a abrir.');
    return new Error(err.message);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * El abridor de verdad: busca los `live.json` y se conecta al primero que contesta. Que la aplicación esté
 * viva lo decide la conexión, no el número de proceso (desde un contenedor o un sandbox el proceso de la
 * aplicación no se ve aunque esté abierta).
 */
export const openRunningApp: AppOpener = async () => {
  const candidates = await findLiveApps();
  if (candidates.length === 0) return null;
  let refused: unknown = null;
  for (const found of candidates) {
    try {
      const conn = await connectLive({ endpoint: found.endpoint, token: found.token });
      return { request: (method, params) => conn.request(method, params), close: () => void conn.close() };
    } catch (err) {
      // Nadie escucha ahí (un archivo que quedó de una sesión anterior): se prueba el siguiente.
      if (err instanceof LiveError && err.code === LIVE_ERRORS.unavailable) continue;
      // Alguien contestó pero no aceptó (otro token, otra versión, ocupado): eso sí se informa.
      refused ??= err;
    }
  }
  if (refused) throw refused;
  return { stale: true };
};

const isConnection = (v: AppConnection | { stale: boolean } | null): v is AppConnection => v !== null && 'request' in v;

export class AppLink {
  private conn: AppConnection | null = null;

  constructor(private readonly opener: AppOpener = openRunningApp) {}

  /** Hace un pedido a la aplicación; si la conexión estaba cortada, la reabre una vez. */
  async request<T>(method: LiveMethodName, params?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        if (!this.conn) {
          const opened = await this.opener();
          if (!isConnection(opened)) throw new AppNotRunning(opened?.stale === true);
          this.conn = opened;
        }
        return (await this.conn.request(method, params)) as T;
      } catch (err) {
        // Solo una conexión cortada (no un pedido vencido) y solo si repetirlo no cambia nada.
        if (attempt === 0 && REPEATABLE.has(method) && err instanceof LiveError && err.code === LIVE_ERRORS.unavailable) {
          this.close();
          continue;
        }
        if (isConnectionError(err) || err instanceof AppNotRunning) this.close();
        throw readable(err);
      }
    }
  }

  /** El estado de la aplicación, o `null` si no está corriendo (no es un error: es para preguntar). */
  async status(): Promise<LiveInfo | null> {
    try {
      return await this.request<LiveInfo>('design.info');
    } catch (err) {
      if (err instanceof AppNotRunning) return null;
      throw err;
    }
  }

  close(): void {
    this.conn?.close();
    this.conn = null;
  }
}
