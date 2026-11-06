/** La propuesta contada para la persona: dónde cae cada operación (con nombres), el valor de antes y el de después. */
import { describe, expect, it } from 'vitest';
import { describeOps, DETAIL_MAX, shortValue } from '../src/core/ai/describe';

const design = {
  name: 'Mi agenda',
  theme: { comfort: 'normal' },
  customPages: [
    { id: 'a', name: 'Gastos', blocks: [{ id: 'b1', kind: 'table', label: 'Tabla', props: { rows: 5 } }] },
    { id: 'b', name: 'Notas', blocks: [] },
  ],
};

describe('describeOps', () => {
  it('reemplazar: el camino con los nombres de las listas y el valor de antes y después', () => {
    const [d] = describeOps(design, [{ op: 'replace', path: '/customPages/0/blocks/0/props/rows', value: 8 }]);
    expect(d).toMatchObject({ op: 'replace', before: '5', after: '8' });
    expect(d!.path).toEqual([{ key: 'customPages' }, { key: '0', item: 'Gastos' }, { key: 'blocks' }, { key: '0', item: 'Tabla' }, { key: 'props' }, { key: 'rows' }]);
  });

  it('agregar una página: el valor corto lleva su nombre y el detalle es el JSON', () => {
    const page = { id: 'c', name: 'Lecturas', blocks: [{ id: 'x', kind: 'text' }] };
    const [d] = describeOps(design, [{ op: 'add', path: '/customPages/-', value: page }]);
    expect(d!.after).toBe('{Lecturas}');
    expect(JSON.parse(d!.detail!)).toEqual(page);
  });

  it('cada operación se cuenta sobre la agenda como queda después de las anteriores', () => {
    const out = describeOps(design, [
      { op: 'add', path: '/customPages/0', value: { id: 'n', name: 'Nueva', blocks: [] } },
      { op: 'remove', path: '/customPages/1' },
      { op: 'move', from: '/customPages/1', path: '/customPages/0' },
    ]);
    expect(out[1]!.path[1]).toEqual({ key: '1', item: 'Gastos' });
    expect(out[1]!.before).toBe('{Gastos}');
    expect(out[2]!.from![1]).toEqual({ key: '1', item: 'Notas' });
  });

  it('una operación que no se puede aplicar se cuenta igual, sin romper las demás', () => {
    const out = describeOps(design, [
      { op: 'remove', path: '/no/existe' },
      { op: 'replace', path: '/theme/comfort', value: 'wide' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.before).toBe('—');
  });

  it('los valores largos se recortan', () => {
    expect(shortValue('x'.repeat(200)).length).toBeLessThan(70);
    const [d] = describeOps(design, [{ op: 'replace', path: '/customPages', value: Array.from({ length: 400 }, (_, i) => ({ id: `p${i}`, name: `Página ${i}` })) }]);
    expect(d!.detail!.length).toBeLessThanOrEqual(DETAIL_MAX + 2);
    expect(d!.after).toBe('[400]');
  });
});
