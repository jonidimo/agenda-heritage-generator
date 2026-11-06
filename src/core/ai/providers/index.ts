/**
 * Los proveedores que el asistente sabe usar, y los servicios compatibles con la API de OpenAI que se
 * ofrecen con su dirección ya puesta.
 */
import type { AiProviderId } from '../messages';
import { anthropic } from './anthropic';
import { gemini } from './gemini';
import { openai } from './openai';
import type { ProviderAdapter } from './types';

export const PROVIDERS: Readonly<Record<AiProviderId, ProviderAdapter>> = { anthropic, gemini, openai };

/** En este orden se ofrecen: primero lo compatible con OpenAI, que es también lo que usan los modelos locales. */
export const PROVIDER_IDS: readonly AiProviderId[] = ['openai', 'anthropic', 'gemini'];

export const isProviderId = (v: unknown): v is AiProviderId => typeof v === 'string' && Object.hasOwn(PROVIDERS, v);

export interface OpenAiPreset {
  id: 'openai' | 'openrouter' | 'groq' | 'mistral' | 'ollama' | 'lmstudio' | 'custom';
  baseUrl: string;
  /** Corre en esta computadora: no necesita clave. */
  local: boolean;
}

export const OPENAI_PRESETS: readonly OpenAiPreset[] = [
  { id: 'openai', baseUrl: 'https://api.openai.com/v1', local: false },
  { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', local: false },
  { id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', local: false },
  { id: 'mistral', baseUrl: 'https://api.mistral.ai/v1', local: false },
  { id: 'ollama', baseUrl: 'http://localhost:11434/v1', local: true },
  { id: 'lmstudio', baseUrl: 'http://localhost:1234/v1', local: true },
  { id: 'custom', baseUrl: '', local: false },
];

/** El preajuste de una dirección (o `custom`). */
export function presetOf(baseUrl: string | undefined): OpenAiPreset {
  const clean = (baseUrl ?? '').trim().replace(/\/+$/, '');
  return OPENAI_PRESETS.find((p) => p.baseUrl !== '' && p.baseUrl === clean) ?? (clean === '' ? OPENAI_PRESETS[0]! : OPENAI_PRESETS.at(-1)!);
}

/** ¿Es la dirección oficial del proveedor (o la de siempre, vacía)? Solo ahí valen sus modelos sugeridos. */
export function isOfficialBase(adapter: ProviderAdapter, baseUrl: string | undefined): boolean {
  const clean = (baseUrl ?? '').trim().replace(/\/+$/, '');
  return clean === '' || clean === adapter.defaultBase;
}

/** ¿Es una dirección de esta misma computadora? (Un modelo local no necesita clave.) */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

export type { ProviderAdapter } from './types';
