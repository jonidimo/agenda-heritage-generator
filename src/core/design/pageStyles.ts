/**
 * Estilos por tipo de página o por página (`design.pageStyles`): ajustes del tema que valen solo
 * ahí. Función pura sobre la lista, para escribir, cambiar o quitar un valor.
 */
import { deleteAtPath, setAtPath, type PlainRecord } from '../util/path';
import type { PageStyle } from './schema';

/** Dónde vale un estilo: todas las páginas de un tipo (`pageKey: null`) o una página puntual. */
export interface PageStyleTarget {
  pageType: string;
  pageKey: string | null;
}

/**
 * La lista con `value` escrito en `path` (p. ej. `['dots', 'pitch']`) para ese lugar. Con
 * `undefined` el valor se quita, y el estilo que quede vacío desaparece de la lista: así «volver al
 * tema» no deja entradas vacías en el archivo. No modifica la lista recibida.
 */
export function withPageStyle(styles: readonly PageStyle[], at: PageStyleTarget, path: readonly string[], value: unknown): PageStyle[] {
  const same = (s: PageStyle): boolean => s.pageType === at.pageType && s.pageKey === at.pageKey;
  const existing = styles.find(same);
  const tokens = structuredClone(existing?.tokens ?? {}) as PlainRecord;
  if (value === undefined) deleteAtPath(tokens, path);
  else setAtPath(tokens, path, value);
  if (Object.keys(tokens).length === 0) return styles.filter((s) => !same(s));
  const entry: PageStyle = { pageType: at.pageType, pageKey: at.pageKey, tokens };
  return existing ? styles.map((s) => (same(s) ? entry : s)) : [...styles, entry];
}
