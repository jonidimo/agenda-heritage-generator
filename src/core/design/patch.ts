/**
 * Cambiar una agenda con JSON Patch, con las mismas reglas para todos los que lo hacen desde afuera del
 * editor (el puente en vivo del MCP, el asistente de la aplicación): sobre una copia, todo o nada,
 * validado con el esquema, sin cambiar la identidad de la agenda, y diciendo qué claves se ignoraron.
 */
import { applyJsonPatch, type JsonPatchOp } from '../util/jsonPatch';
import { safeParseDesign, type Design } from './schema';
import { strippedKeys } from './stripped';

export interface PatchIssue {
  /** Puntero JSON al valor (vacío si el problema es del parche entero). */
  path: string;
  message: string;
}

export type DesignPatchResult =
  | {
      ok: true;
      design: Design;
      /** Claves del resultado que el esquema no conoce y se descartaron (punteros JSON). */
      stripped: string[];
    }
  | { ok: false; issues: PatchIssue[] };

/** Más problemas que estos no ayudan a corregir: con los primeros alcanza. */
const MAX_ISSUES = 50;

/** Los problemas de una validación fallida, con su puntero JSON. */
export function issuesOf(error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }): PatchIssue[] {
  return error.issues.slice(0, MAX_ISSUES).map((i) => ({ path: `/${i.path.map(String).join('/')}`, message: i.message }));
}

/** Copia de solo datos: lo mismo que vería quien lee la agenda como JSON (sin `undefined` ni prototipos). */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Aplica `patch` sobre una copia de `current` y valida el resultado. Pura: no cambia `current`. */
export function applyDesignPatch(current: Design, patch: readonly JsonPatchOp[]): DesignPatchResult {
  let next: unknown;
  try {
    next = applyJsonPatch(plain(current), patch);
  } catch (err) {
    return { ok: false, issues: [{ path: '', message: err instanceof Error ? err.message : String(err) }] };
  }
  let parsed: ReturnType<typeof safeParseDesign>;
  try {
    parsed = safeParseDesign(next);
  } catch (err) {
    // Un `schemaVersion` que el programa no conoce.
    return { ok: false, issues: [{ path: '/schemaVersion', message: (err as Error).message }] };
  }
  if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };
  // La identidad de la agenda no se cambia desde afuera: otra id sería otra agenda en la biblioteca.
  if (parsed.data.id !== current.id) return { ok: false, issues: [{ path: '/id', message: 'No se puede cambiar la identidad de la agenda abierta.' }] };
  return { ok: true, design: parsed.data, stripped: strippedKeys(next, parsed.data) };
}
