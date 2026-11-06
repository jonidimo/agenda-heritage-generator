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

/** El modelo y la dirección que valen para el proveedor elegido; sin modelo, el de siempre (solo en la dirección oficial). */
export function activeProvider(s: AiSettings): { provider: AiProviderId; model: string; baseUrl: string } {
  const p = s.perProvider[s.provider];
  const adapter = PROVIDERS[s.provider];
  return { provider: s.provider, model: p.model || (isOfficialBase(adapter, p.baseUrl) ? adapter.defaultModel : ''), baseUrl: p.baseUrl };
}

/**
 * Lo que la versión 2.4.0 guardó sin que nadie lo eligiera: el modelo de siempre de OpenAI junto a una
 * dirección local u otra. Al leer los ajustes se olvida (un servidor local no tiene «gpt-5-mini»); lo que la
 * persona elija después se respeta siempre.
 */
export function normalizeAiSettings(s: AiSettings): AiSettings {
  let changed = false;
  const perProvider = { ...s.perProvider };
  for (const id of Object.keys(perProvider) as AiProviderId[]) {
    const p = perProvider[id];
    if (p.model !== '' && p.model === PROVIDERS[id].defaultModel && !isOfficialBase(PROVIDERS[id], p.baseUrl)) {
      perProvider[id] = { ...p, model: '' };
      changed = true;
    }
  }
  return changed ? { ...s, perProvider } : s;
}

/** Al cambiar de dirección, un modelo sugerido para la oficial deja de valer en otra: se borra. */
export function modelForBase(id: AiProviderId, model: string, baseUrl: string): string {
  const adapter = PROVIDERS[id];
  return !isOfficialBase(adapter, baseUrl) && (model === adapter.defaultModel || adapter.suggestedModels.includes(model)) ? '' : model;
}

/** Lo que define una sesión del asistente: si cambia, la conversación empieza de nuevo. */
export const sessionKey = (s: AiSettings): string => {
  const a = activeProvider(s);
  return `${a.provider}|${a.model}|${a.baseUrl}|${s.vision}`;
};
