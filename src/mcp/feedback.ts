/**
 * Realimentación de maquetación para quien edita con un modelo de lenguaje: después de un cambio,
 * qué avisos aparecieron que antes no estaban (texto que no entra, elementos fuera de la página,
 * superposiciones). Así el modelo corrige solo, sin que alguien tenga que mirar las páginas.
 */
import type { Design } from '../core/design/schema';
import type { AgendaDocument } from '../core/document';

export interface LayoutNote {
  /** Número de página, desde 1. */
  page: number;
  key: string;
  code: string;
  message: string;
}

export interface LayoutFeedback {
  /** Avisos nuevos (los que ya tenía la agenda antes del cambio no se repiten). */
  notes: LayoutNote[];
  /** Cuántos más hubo y no se listan. */
  omitted: number;
}

/** Más que esto no ayuda a un modelo: el resto se cuenta. */
const MAX_NOTES = 40;

type Open = (design: Design) => Promise<{ doc: AgendaDocument }>;

const identity = (n: { key: string; code: string; message: string }): string => `${n.key}|${n.code}|${n.message}`;

function notesOf(doc: AgendaDocument): LayoutNote[] {
  return doc.warnings().map((w) => ({ page: w.page + 1, key: w.key, code: w.code, message: w.message }));
}

/**
 * Los avisos de `after` que `before` no tenía. Sin `before` (una agenda nueva) son todos los de `after`.
 * Nunca falla: si la agenda no se puede maquetar, el aviso es ese error y no impide el cambio.
 */
export async function newLayoutWarnings(open: Open, before: Design | null, after: Design): Promise<LayoutFeedback> {
  try {
    const known = new Set<string>();
    if (before) for (const n of notesOf((await open(before)).doc)) known.add(identity(n));
    const fresh = notesOf((await open(after)).doc).filter((n) => !known.has(identity(n)));
    return { notes: fresh.slice(0, MAX_NOTES), omitted: Math.max(0, fresh.length - MAX_NOTES) };
  } catch (err) {
    return { notes: [{ page: 0, key: '', code: 'layoutError', message: `No se pudo revisar la maquetación: ${(err as Error).message}` }], omitted: 0 };
  }
}
