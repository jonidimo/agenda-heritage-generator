/**
 * Leer, escribir y quitar valores de un objeto por una ruta de claves (`['dots', 'pitch']`). Sirven
 * para los ajustes anidados del tema y de los estilos por página, y funcionan igual sobre un
 * borrador de immer. Las claves que tocarían el prototipo de los objetos se rechazan.
 */

export type PlainRecord = Record<string, unknown>;

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (v: unknown): v is PlainRecord => typeof v === 'object' && v !== null && !Array.isArray(v);

function checked(path: readonly string[]): readonly string[] {
  for (const key of path) if (FORBIDDEN_KEYS.has(key)) throw new Error(`Clave no permitida en una ruta: «${key}»`);
  return path;
}

/** El valor en la ruta, o `undefined` si algún tramo no existe. */
export function getAtPath(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of checked(path)) {
    if (!isRecord(node) || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

/** Escribe un valor en la ruta, creando los objetos que falten en el camino. */
export function setAtPath(root: PlainRecord, path: readonly string[], value: unknown): void {
  const keys = checked(path);
  const last = keys[keys.length - 1];
  if (last === undefined) throw new Error('La ruta está vacía');
  let node = root;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (isRecord(next)) node = next;
    else {
      const created: PlainRecord = {};
      node[key] = created;
      node = created;
    }
  }
  node[last] = value;
}

/**
 * Quita el valor de la ruta y los objetos que queden vacíos por encima de él (el objeto raíz
 * queda aunque se vacíe). Devuelve si había algo que quitar.
 */
export function deleteAtPath(root: PlainRecord, path: readonly string[]): boolean {
  const keys = checked(path);
  const last = keys[keys.length - 1];
  if (last === undefined) throw new Error('La ruta está vacía');
  const chain: PlainRecord[] = [root];
  for (const key of keys.slice(0, -1)) {
    const next = chain[chain.length - 1]![key];
    if (!isRecord(next)) return false;
    chain.push(next);
  }
  const parent = chain[chain.length - 1]!;
  if (!Object.hasOwn(parent, last)) return false;
  delete parent[last];
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]!).length > 0) break;
    delete chain[i - 1]![keys[i - 1]!];
  }
  return true;
}
