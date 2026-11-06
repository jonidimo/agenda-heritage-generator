/**
 * Una propuesta del asistente contada para la persona: por cada operación, dónde cae (con los nombres de
 * las páginas y elementos en lugar de sus números de lista), cuánto valía antes y cuánto vale después,
 * y el valor completo en JSON para quien quiera ver el detalle.
 *
 * Las operaciones se cuentan en orden, cada una sobre la agenda como queda después de las anteriores
 * (así «la tercera página propia» es la que existe en ese momento, aunque una operación anterior haya
 * agregado otra).
 */
import { applyJsonPatch, getAtPointer, type JsonPatchOp } from '../util/jsonPatch';

/** Un tramo del camino: la clave, y si es un elemento de una lista, su nombre (si tiene uno). */
export interface OpStep {
  key: string;
  /** El nombre o rótulo del elemento de la lista en ese lugar. */
  item?: string;
}

export interface OpDescription {
  op: JsonPatchOp['op'];
  path: OpStep[];
  /** De dónde viene, en `move` y `copy`. */
  from?: OpStep[];
  /** El valor de antes, corto (en `replace` y `remove`). */
  before?: string;
  /** El valor nuevo, corto (en `add`, `replace` y `test`). */
  after?: string;
  /** El valor nuevo completo, en JSON con sangría y recortado. */
  detail?: string;
}

/** Más que esto de JSON no se lee en una tarjeta. */
export const DETAIL_MAX = 4096;
const SHORT_MAX = 60;

const unescape = (s: string): string => s.replace(/~1/g, '/').replace(/~0/g, '~');

function steps(doc: unknown, pointer: string): OpStep[] {
  if (pointer === '') return [];
  const keys = pointer.split('/').slice(1).map(unescape);
  const out: OpStep[] = [];
  let at: unknown = doc;
  for (const key of keys) {
    const parent = at;
    at = parent && typeof parent === 'object' ? (parent as Record<string, unknown>)[key] : undefined;
    const name = Array.isArray(parent) ? nameOf(at) : undefined;
    out.push(name ? { key, item: name } : { key });
  }
  return out;
}

/** El nombre de algo con nombre (una página propia, un elemento, una sección…). */
function nameOf(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  for (const k of ['name', 'label', 'title', 'blockId', 'kind', 'type', 'id']) {
    const n = r[k];
    if (typeof n === 'string' && n.trim() !== '') return clip(n.trim(), 40);
  }
  return undefined;
}

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Un valor en pocas letras: el número o texto, o qué es (`{…}` con su nombre, `[3]`). */
export function shortValue(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'string') return `“${clip(v, SHORT_MAX)}”`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  const name = nameOf(v);
  return name ? `{${name}}` : `{${clip(Object.keys(v as object).join(', '), SHORT_MAX)}}`;
}

function detailOf(v: unknown): string | undefined {
  if (v === undefined || v === null || typeof v !== 'object') return undefined;
  const text = JSON.stringify(v, null, 2);
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}\n…` : text;
}

const safeGet = (doc: unknown, pointer: string): unknown => {
  try {
    return getAtPointer(doc, pointer);
  } catch {
    return undefined;
  }
};

/** Cada operación contada para la persona. Una operación que no se puede aplicar se cuenta igual, sin seguir aplicando. */
export function describeOps(before: unknown, ops: readonly JsonPatchOp[]): OpDescription[] {
  let doc: unknown = before;
  let broken = false;
  return ops.map((op) => {
    const d: OpDescription = { op: op.op, path: steps(doc, op.path) };
    if (op.op === 'move' || op.op === 'copy') {
      d.from = steps(doc, op.from);
      const moved = safeGet(doc, op.from);
      d.after = shortValue(moved);
      const detail = detailOf(moved);
      if (detail) d.detail = detail;
    }
    if (op.op === 'replace' || op.op === 'remove') d.before = shortValue(safeGet(doc, op.path));
    if (op.op === 'add' || op.op === 'replace' || op.op === 'test') {
      d.after = shortValue(op.value);
      const detail = detailOf(op.value);
      if (detail) d.detail = detail;
    }
    if (!broken) {
      try {
        doc = applyJsonPatch(doc, [op]);
      } catch {
        broken = true;
      }
    }
    return d;
  });
}
