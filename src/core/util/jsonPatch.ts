/**
 * JSON Patch (RFC 6902) sobre punteros JSON (RFC 6901): cambiar partes de un documento grande sin
 * reescribirlo entero (así edita una agenda un modelo de lenguaje). Se aplica sobre una copia, todo
 * o nada; las claves que tocarían el prototipo de los objetos se rechazan.
 */

export type JsonPatchOp =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; from: string; path: string };

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export class JsonPatchError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(`Operación ${index + 1}: ${message}`);
  }
}

function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`el puntero «${pointer}» tiene que empezar con «/»`);
  return pointer
    .slice(1)
    .split('/')
    .map((p) => {
      const key = p.replace(/~1/g, '/').replace(/~0/g, '~');
      if (FORBIDDEN.has(key)) throw new Error(`clave no permitida «${key}»`);
      return key;
    });
}

type Container = Record<string, unknown> | unknown[];

const isContainer = (v: unknown): v is Container => typeof v === 'object' && v !== null;

function arrayIndex(arr: unknown[], key: string, forAdd: boolean): number {
  if (forAdd && key === '-') return arr.length;
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error(`«${key}» no es una posición de lista`);
  const i = Number(key);
  if (i > arr.length || (!forAdd && i === arr.length)) throw new Error(`la posición ${i} no existe (la lista tiene ${arr.length})`);
  return i;
}

/** El contenedor del último tramo del puntero y ese tramo. */
function parentOf(doc: unknown, parts: string[]): { parent: Container; key: string } {
  let node = doc;
  for (const key of parts.slice(0, -1)) {
    if (Array.isArray(node)) node = node[arrayIndex(node, key, false)];
    else if (isContainer(node) && Object.hasOwn(node, key)) node = (node as Record<string, unknown>)[key];
    else throw new Error(`no existe «${key}»`);
  }
  if (!isContainer(node)) throw new Error('la ruta no lleva a un objeto ni a una lista');
  return { parent: node, key: parts[parts.length - 1]! };
}

function get(doc: unknown, parts: string[]): unknown {
  if (parts.length === 0) return doc;
  const { parent, key } = parentOf(doc, parts);
  if (Array.isArray(parent)) return parent[arrayIndex(parent, key, false)];
  if (!Object.hasOwn(parent, key)) throw new Error(`no existe «${key}»`);
  return parent[key];
}

function put(doc: unknown, parts: string[], value: unknown, mode: 'add' | 'replace'): unknown {
  if (parts.length === 0) return value;
  const { parent, key } = parentOf(doc, parts);
  if (Array.isArray(parent)) {
    const i = arrayIndex(parent, key, mode === 'add');
    if (mode === 'add') parent.splice(i, 0, value);
    else parent[i] = value;
  } else {
    if (mode === 'replace' && !Object.hasOwn(parent, key)) throw new Error(`no existe «${key}»`);
    parent[key] = value;
  }
  return doc;
}

function remove(doc: unknown, parts: string[]): unknown {
  if (parts.length === 0) throw new Error('no se puede quitar el documento entero');
  const { parent, key } = parentOf(doc, parts);
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, key, false), 1);
  else {
    if (!Object.hasOwn(parent, key)) throw new Error(`no existe «${key}»`);
    delete parent[key];
  }
  return doc;
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isContainer(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}

/** Aplica las operaciones sobre una copia del documento y la devuelve. */
export function applyJsonPatch<T>(doc: T, ops: readonly JsonPatchOp[]): T {
  let out: unknown = structuredClone(doc);
  ops.forEach((op, index) => {
    try {
      const path = parsePointer(op.path);
      switch (op.op) {
        case 'add':
        case 'replace':
          out = put(out, path, structuredClone(op.value), op.op);
          break;
        case 'remove':
          out = remove(out, path);
          break;
        case 'move': {
          const from = parsePointer(op.from);
          if (op.path.startsWith(`${op.from}/`)) throw new Error('no se puede mover algo adentro de sí mismo');
          const value = get(out, from);
          out = put(remove(out, from), path, value, 'add');
          break;
        }
        case 'copy':
          out = put(out, path, structuredClone(get(out, parsePointer(op.from))), 'add');
          break;
        case 'test':
          if (!equal(get(out, path), op.value)) throw new Error(`el valor de «${op.path}» no es el esperado`);
          break;
        default:
          throw new Error(`operación desconocida «${(op as { op: string }).op}»`);
      }
    } catch (err) {
      throw err instanceof JsonPatchError ? err : new JsonPatchError((err as Error).message, index);
    }
  });
  return out as T;
}
