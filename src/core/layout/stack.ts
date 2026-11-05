/**
 * Orden de apilado de los elementos de una página. Cada elemento tiene una capa (un número) y se
 * dibuja de menor a mayor; con la misma capa, en el orden en que la sección los agregó. Para subir un
 * elemento un lugar no alcanza con darle un número un poco mayor: los que comparten capa con él
 * quedarían todos por debajo o todos por encima. Por eso se calcula el orden completo que se quiere
 * y se les da capa nueva solo a los que lo necesitan.
 */

export interface StackItem {
  id: string;
  layer: number;
  /** Lugar en que la sección lo agregó: desempata a los que tienen la misma capa (el de menor lugar va debajo). */
  seq: number;
}

export type StackMove = 'up' | 'down' | 'front' | 'back';

/** Diferencia mínima entre dos capas consecutivas que se reparten (más chica que cualquier capa de las secciones). */
export const LAYER_STEP = 0.001;
/** Las capas que admite el esquema. */
export const LAYER_LIMIT = 1000;

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

/** El orden (de abajo hacia arriba) después de mover `id`; sin cambios si ya está en el extremo o no está. */
export function moveInOrder<T extends { id: string }>(order: readonly T[], id: string, move: StackMove): T[] {
  const from = order.findIndex((x) => x.id === id);
  if (from < 0) return [...order];
  const last = order.length - 1;
  const to = move === 'up' ? Math.min(last, from + 1) : move === 'down' ? Math.max(0, from - 1) : move === 'front' ? last : 0;
  const out = [...order];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item!);
  return out;
}

/**
 * Las capas nuevas para que `order` (de abajo hacia arriba) quede apilado así: solo los elementos que
 * hoy no cumplirían el orden reciben una (la justa por encima del anterior).
 */
export function restack(order: readonly StackItem[]): Map<string, number> {
  const changes = new Map<string, number>();
  let topLayer = -Infinity;
  let topSeq = -Infinity;
  for (const item of order) {
    // Ya queda por encima del anterior (por capa o, a igual capa, por su lugar de origen): no necesita capa nueva.
    if (item.layer > topLayer || (item.layer === topLayer && item.seq > topSeq)) {
      topLayer = item.layer;
      topSeq = item.seq;
      continue;
    }
    topLayer = round(topLayer + LAYER_STEP);
    topSeq = item.seq;
    changes.set(item.id, topLayer);
  }
  if (topLayer > LAYER_LIMIT) {
    // Capas agotadas (no ocurre con el uso normal): se vuelve a numerar toda la lista de a una unidad.
    changes.clear();
    order.forEach((item, i) => item.layer !== i && changes.set(item.id, i));
  }
  return changes;
}

/**
 * Lo mismo para un solo elemento que se movió: le alcanza una capa propia entre sus dos vecinos nuevos (sin tocar a
 * los demás). Si los vecinos comparten capa no hay lugar entre ellos y se reparte con `restack`.
 */
export function restackOne(order: readonly StackItem[], id: string): Map<string, number> {
  const at = order.findIndex((x) => x.id === id);
  const self = order[at];
  if (!self) return new Map();
  const lo = order[at - 1];
  const hi = order[at + 1];
  const fits = (!lo || self.layer > lo.layer || (self.layer === lo.layer && self.seq > lo.seq)) && (!hi || self.layer < hi.layer || (self.layer === hi.layer && self.seq < hi.seq));
  if (fits) return new Map();
  let layer: number | null = null;
  if (lo && hi) layer = hi.layer > lo.layer ? round((lo.layer + hi.layer) / 2) : null;
  else if (lo) layer = round(lo.layer + LAYER_STEP);
  else if (hi) layer = round(hi.layer - LAYER_STEP);
  if (layer === null || layer > LAYER_LIMIT || layer < -LAYER_LIMIT || (lo && layer <= lo.layer) || (hi && layer >= hi.layer)) return restack(order);
  return new Map([[id, layer]]);
}
