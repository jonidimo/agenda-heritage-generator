/** Hash FNV-1a de 32 bits: estable entre entornos, suficiente para claves de caché. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Serialización JSON con claves ordenadas (para hashes deterministas de objetos). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

let counter = 0;
/** Identificador corto y único dentro de la sesión (para elementos nuevos del diseño). */
export function newId(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rnd = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}
