/** Orden de apilado: mover un elemento un lugar, al frente o al fondo, y dar capa solo a los que la necesitan. */
import { describe, expect, it } from 'vitest';
import { LAYER_LIMIT, moveInOrder, restack, restackOne, type StackItem } from '../src/core/layout/stack';

/** Elementos de una página en el orden en que la sección los agregó (de ahí sale su `seq`). */
const items = (...pairs: Array<[string, number]>): StackItem[] => pairs.map(([id, layer], seq) => ({ id, layer, seq }));
const ids = (list: readonly { id: string }[]): string => list.map((x) => x.id).join('');

/** Lo que dibujaría la página: ordenado por capa y, con la misma capa, por el orden en que se agregaron. */
function drawn(original: StackItem[], changes: Map<string, number>): string {
  return ids(original.map((x) => ({ ...x, layer: changes.get(x.id) ?? x.layer })).sort((a, b) => a.layer - b.layer || a.seq - b.seq));
}

describe('moveInOrder', () => {
  const order = items(['a', 10], ['b', 10], ['c', 10], ['d', 10]);
  it('sube y baja un lugar, y se queda en los extremos', () => {
    expect(ids(moveInOrder(order, 'b', 'up'))).toBe('acbd');
    expect(ids(moveInOrder(order, 'b', 'down'))).toBe('bacd');
    expect(ids(moveInOrder(order, 'd', 'up'))).toBe('abcd');
    expect(ids(moveInOrder(order, 'a', 'down'))).toBe('abcd');
  });
  it('al frente y al fondo', () => {
    expect(ids(moveInOrder(order, 'b', 'front'))).toBe('acdb');
    expect(ids(moveInOrder(order, 'c', 'back'))).toBe('cabd');
  });
  it('un elemento que no está no cambia nada, y no toca la lista original', () => {
    expect(ids(moveInOrder(order, 'z', 'up'))).toBe('abcd');
    expect(ids(order)).toBe('abcd');
  });
});

describe('restack', () => {
  it('un orden que ya se cumple no cambia ninguna capa (ni con capas repetidas que se desempatan por su lugar)', () => {
    expect(restack(items(['a', 1], ['b', 10], ['c', 10], ['d', 20])).size).toBe(0);
  });

  it('mover un elemento entre otros de la misma capa le cambia la capa solo a los que lo necesitan', () => {
    const original = items(['a', 10], ['b', 10], ['c', 10], ['d', 10], ['e', 10]);
    // «b» sube un lugar: pasa por encima de «c». Los demás siguen donde estaban.
    expect([...restack(moveInOrder(original, 'b', 'up'))].map(([id]) => id).sort()).toEqual(['b', 'd', 'e']);
  });

  it('con capas iguales, subir uno lo deja exactamente donde se pidió', () => {
    const original = items(['a', 10], ['b', 10], ['c', 10], ['d', 10]);
    for (const move of ['up', 'down', 'front', 'back'] as const) {
      for (const id of ['a', 'b', 'c', 'd']) {
        const want = moveInOrder(original, id, move);
        expect(drawn(original, restack(want)), `${id} ${move}`).toBe(ids(want));
      }
    }
  });

  it('con capas distintas y repetidas mezcladas, también', () => {
    const original = items(['w', 1], ['a', 10], ['b', 10], ['c', 15], ['d', 15], ['p', 18], ['m', 20]);
    for (const move of ['up', 'down', 'front', 'back'] as const) {
      for (const { id } of original) {
        const want = moveInOrder(original, id, move);
        expect(drawn(original, restack(want)), `${id} ${move}`).toBe(ids(want));
      }
    }
  });

  it('mover varias veces seguidas es coherente (cada paso parte de lo que dejó el anterior)', () => {
    const seqs = new Map(items(['a', 10], ['b', 10], ['c', 10], ['d', 10], ['e', 10]).map((x) => [x.id, x.seq]));
    let current = items(['a', 10], ['b', 10], ['c', 10], ['d', 10], ['e', 10]);
    const moves: Array<[string, 'up' | 'down' | 'front' | 'back']> = [['a', 'up'], ['a', 'up'], ['e', 'down'], ['c', 'front'], ['b', 'back'], ['d', 'up']];
    for (const [id, move] of moves) {
      const want = moveInOrder(current, id, move);
      const changes = restack(want);
      current = current.map((x) => ({ ...x, layer: changes.get(x.id) ?? x.layer }));
      // La lista que se vuelve a leer de la página: ordenada por capa y, a igual capa, por el orden original de las secciones.
      current = [...current].sort((a, b) => a.layer - b.layer || seqs.get(a.id)! - seqs.get(b.id)!);
      expect(ids(current), `${id} ${move}`).toBe(ids(want));
    }
  });

  it('con las capas agotadas se vuelve a numerar la lista completa', () => {
    const order = items(['a', LAYER_LIMIT], ['b', LAYER_LIMIT], ['c', LAYER_LIMIT]);
    const changes = restack(order);
    expect(drawn(order, changes)).toBe('abc');
    expect([...changes.values()].every((v) => v <= LAYER_LIMIT)).toBe(true);
  });
});

describe('restackOne', () => {
  it('mover uno entre otros de la misma capa le cambia la capa solo a él cuando hay lugar, y el orden queda como se pidió', () => {
    const original = items(['a', 10], ['b', 11], ['c', 12], ['d', 13]);
    for (const move of ['up', 'down', 'front', 'back'] as const) {
      for (const { id } of original) {
        const want = moveInOrder(original, id, move);
        const changes = restackOne(want, id);
        expect(drawn(original, changes), `${id} ${move}`).toBe(ids(want));
        expect(changes.size).toBeLessThanOrEqual(1);
      }
    }
  });

  it('con todas en la misma capa no hay lugar entre vecinos: se reparte, pero sigue quedando como se pidió', () => {
    const original = items(['a', 10], ['b', 10], ['c', 10], ['d', 10]);
    for (const move of ['up', 'down', 'front', 'back'] as const) {
      for (const { id } of original) {
        const want = moveInOrder(original, id, move);
        expect(drawn(original, restackOne(want, id)), `${id} ${move}`).toBe(ids(want));
      }
    }
  });
});
