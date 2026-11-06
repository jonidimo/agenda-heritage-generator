/**
 * Los ajustes del asistente de IA que se guardan en este equipo (nunca la clave: ver `keys.ts`). Cada
 * proveedor recuerda su modelo y su dirección, así cambiar de proveedor y volver no pierde nada.
 */
import { PROVIDERS } from '@core/ai/providers';
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

const initial = (id: AiProviderId): ProviderSettings => ({ model: PROVIDERS[id].defaultModel, baseUrl: '' });

export const AI_SETTINGS_DEFAULT: AiSettings = {
  provider: 'anthropic',
  perProvider: { anthropic: initial('anthropic'), gemini: initial('gemini'), openai: initial('openai') },
  vision: true,
  remember: false,
  pill: true,
};

/** El modelo y la dirección que valen para el proveedor elegido (un modelo vacío usa el de siempre). */
export function activeProvider(s: AiSettings): { provider: AiProviderId; model: string; baseUrl: string } {
  const p = s.perProvider[s.provider];
  return { provider: s.provider, model: p.model || PROVIDERS[s.provider].defaultModel, baseUrl: p.baseUrl };
}

/** Lo que define una sesión del asistente: si cambia, la conversación empieza de nuevo. */
export const sessionKey = (s: AiSettings): string => {
  const a = activeProvider(s);
  return `${a.provider}|${a.model}|${a.baseUrl}|${s.vision}`;
};
