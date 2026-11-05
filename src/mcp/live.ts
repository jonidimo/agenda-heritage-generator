/**
 * El enlace del servidor MCP con la aplicación de escritorio abierta (ver `electron/lib/live.mjs`):
 * encuentra la aplicación, se conecta a su socket local y le hace los pedidos de `core/live/protocol.ts`.
 *
 * El servidor solo lo usa cuando el pedido trae `app: true`; sin eso nada de acá se carga ni se conecta.
 * Una conexión por servidor, abierta al primer uso y vuelta a abrir si la aplicación se cerró y se reabrió.
 */
import { connectLive, findLiveApp, LIVE_ERRORS, LiveError } from '../../electron/lib/live.mjs';
import type { LiveInfo, LiveMethodName } from '../core/live/protocol';

/** Una conexión abierta: pide un método y espera la respuesta. */
export interface AppConnection {
  request(method: LiveMethodName, params?: unknown): Promise<unknown>;
  close(): void;
}

/** Cómo se abre una conexión: `null` si la aplicación no está corriendo. */
export type AppOpener = () => Promise<AppConnection | null>;

/** La aplicación de escritorio no está abierta (o este equipo no la tiene). */
export class AppNotRunning extends Error {
  constructor() {
    super('No encuentro la aplicación Heritage Studio abierta. Abrí la aplicación de escritorio con la agenda, o trabajá sobre un archivo con «path» (sin «app»).');
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

/** El abridor de verdad: busca la aplicación por su `live.json` y se conecta a su socket. */
export const openRunningApp: AppOpener = async () => {
  const found = await findLiveApp();
  if (!found) return null;
  try {
    const conn = await connectLive({ endpoint: found.endpoint, token: found.token });
    return { request: (method, params) => conn.request(method, params), close: () => void conn.close() };
  } catch (err) {
    // Un `live.json` que quedó de una aplicación que se cerró mal: es como si no estuviera.
    if (err instanceof LiveError && err.code === LIVE_ERRORS.unavailable) return null;
    throw err;
  }
};

export class AppLink {
  private conn: AppConnection | null = null;

  constructor(private readonly opener: AppOpener = openRunningApp) {}

  /** Hace un pedido a la aplicación; si la conexión estaba cortada, la reabre una vez. */
  async request<T>(method: LiveMethodName, params?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        this.conn ??= await this.opener();
        if (!this.conn) throw new AppNotRunning();
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
