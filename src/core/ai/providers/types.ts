/**
 * Lo que un proveedor de IA tiene que saber hacer: armar el pedido HTTP de una conversación y de la
 * lista de modelos, y leer las respuestas. Los adaptadores son puros (no hacen `fetch`) y **nunca ven
 * la clave**: la agrega el transporte en el navegador, o el proceso principal en la aplicación de escritorio.
 */
import { connectableBase } from './url';
import type { AiProviderId, AiReply, AiRequest } from '../messages';

/** Un pedido HTTP sin la autenticación. */
export interface WireRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

export interface ProviderConfig {
  model: string;
  /** Dirección base de la API; sin ella, la del proveedor. */
  baseUrl?: string | undefined;
  /** Desde dónde sale el pedido: el navegador necesita alguna cabecera de más (CORS). */
  surface: 'web' | 'desktop';
}

/** Cómo va la clave: en qué cabecera y con qué prefijo. */
export interface AuthScheme {
  header: string;
  prefix: string;
}

export interface ProviderAdapter {
  id: AiProviderId;
  defaultBase: string;
  auth: AuthScheme;
  /** Modelo que se propone si la persona no eligió ninguno. */
  defaultModel: string;
  /** Modelos conocidos para ofrecer sin preguntar a la API (la lista real sale de `models`). */
  suggestedModels: readonly string[];
  chat(req: AiRequest, cfg: ProviderConfig): WireRequest;
  parseChat(json: unknown): AiReply;
  models(cfg: Pick<ProviderConfig, 'baseUrl' | 'surface'>): WireRequest;
  parseModels(json: unknown): string[];
}

/** La base sin barra final (las rutas se agregan con `/`), con 0.0.0.0 cambiada por 127.0.0.1 (ver `connectableBase`). */
export const baseOf = (cfg: Pick<ProviderConfig, 'baseUrl'>, fallback: string): string => connectableBase(cfg.baseUrl?.trim() || fallback).replace(/\/+$/, '');

/** Lee un objeto de una respuesta, o falla con un error de protocolo legible. */
export function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`Respuesta inesperada del proveedor (${what}).`);
  return v as Record<string, unknown>;
}

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Los argumentos de una llamada que llegan como texto JSON: leídos, o el error para devolverle al modelo. */
export function parseArguments(text: unknown): { input: unknown; inputError?: string } {
  if (typeof text !== 'string') return { input: text ?? {} };
  if (text.trim() === '') return { input: {} };
  try {
    return { input: JSON.parse(text) as unknown };
  } catch (err) {
    return { input: null, inputError: `Los argumentos no son JSON válido: ${(err as Error).message}` };
  }
}
