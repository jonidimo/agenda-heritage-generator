/**
 * Los ajustes del asistente de IA que se guardan en este equipo (nunca la clave: ver `keys.ts`). Cada
 * proveedor recuerda su modelo y su dirección, así cambiar de proveedor y volver no pierde nada.
 */
import { PROVIDERS, isOfficialBase } from '@core/ai/providers';
import type { AiProviderId } from '@core/ai/messages';
import { z } from 'zod';

const ProviderSettingsZ = z.object({
  model: z.string().trim().max(200),
  /** Vacío: la dirección del proveedor. */
  baseUrl: z.string().trim().max(500),
});
export type ProviderSettings = z.infer<typeof ProviderSettingsZ>;

export const AiSettingsZ = z.object({
  provider: z.enum(['anthropic', 'gemini', 'openai']),
  perProvider: z.object({ anthropic: ProviderSettingsZ, gemini: ProviderSettingsZ, openai: ProviderSettingsZ }),
  /** Que el asistente pueda mirar las páginas como imágenes (más preciso, más caro). */
  vision: z.boolean(),
  /** En el navegador: guardar la clave cifrada para la próxima vez. */
  remember: z.boolean(),
  /** La píldora del asistente al pie del lienzo. */
  pill: z.boolean(),
});
export type AiSettings = z.infer<typeof AiSettingsZ>;

/** Sin modelo elegido: vale el de siempre del proveedor (si la dirección es la oficial). */
const initial = (): ProviderSettings => ({ model: '', baseUrl: '' });

export const AI_SETTINGS_DEFAULT: AiSettings = {
  provider: 'openai',
  perProvider: { anthropic: initial(), gemini: initial(), openai: initial() },
  vision: true,
  remember: false,
  pill: true,
};

/**
 * El modelo y la dirección que valen para el proveedor elegido. Un modelo vacío usa el de siempre, pero
 * solo en la dirección oficial: un servidor local u otro servicio no tiene «gpt-5-mini», así que ahí sin
 * modelo elegido queda vacío (y un modelo sugerido de OpenAI que quedó guardado de antes no cuenta).
 */
export function activeProvider(s: AiSettings): { provider: AiProviderId; model: string; baseUrl: string } {
  const p = s.perProvider[s.provider];
  const adapter = PROVIDERS[s.provider];
  const official = isOfficialBase(adapter, p.baseUrl);
  const model = official ? p.model || adapter.defaultModel : p.model === adapter.defaultModel || adapter.suggestedModels.includes(p.model) ? '' : p.model;
  return { provider: s.provider, model, baseUrl: p.baseUrl };
}

/** Lo que define una sesión del asistente: si cambia, la conversación empieza de nuevo. */
export const sessionKey = (s: AiSettings): string => {
  const a = activeProvider(s);
  return `${a.provider}|${a.model}|${a.baseUrl}|${s.vision}`;
};
