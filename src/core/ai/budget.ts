/**
 * Cuánto de la conversación se manda en cada pedido. La conversación solo crece hacia adelante: nunca se
 * edita un mensaje anterior (los proveedores con razonamiento lo rechazan o pierden la caché). Si pesa
 * demasiado, se descartan los intercambios más viejos enteros, desde el principio; el pedido en curso
 * (el último mensaje de la persona y todo lo que vino después) se manda siempre completo.
 */
import type { AiMessage } from './messages';

export interface HistoryBudget {
  /** Tamaño aproximado (caracteres del JSON, imágenes incluidas) que se manda como mucho. */
  maxChars: number;
  /** Mensajes que se mandan como mucho. */
  maxMessages: number;
}

export const DEFAULT_BUDGET: HistoryBudget = { maxChars: 400_000, maxMessages: 80 };

const sizeOf = (m: AiMessage): number => JSON.stringify(m).length;

/** Dónde empieza cada intercambio: cada mensaje de la persona (los resultados de herramientas no cuentan). */
function exchangeStarts(messages: readonly AiMessage[]): number[] {
  return messages.flatMap((m, i) => (m.role === 'user' ? [i] : []));
}

/** Lo que se manda: la conversación sin sus intercambios más viejos si no entra. Pura. */
export function trimHistory(messages: readonly AiMessage[], budget: HistoryBudget = DEFAULT_BUDGET): AiMessage[] {
  const starts = exchangeStarts(messages);
  if (starts.length <= 1) return [...messages];
  const sizes = messages.map(sizeOf);
  const total = (from: number): number => sizes.slice(from).reduce((a, b) => a + b, 0);
  // El último intercambio va siempre; los anteriores, del más nuevo al más viejo, mientras entren.
  let from = starts[starts.length - 1]!;
  for (let k = starts.length - 2; k >= 0; k--) {
    const candidate = starts[k]!;
    if (total(candidate) > budget.maxChars || messages.length - candidate > budget.maxMessages) break;
    from = candidate;
  }
  return messages.slice(from);
}
