/** Acciones de capas: reiniciar el orden no toca lo que está oculto ni los ajustes de otras páginas. */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStack, stackRecipe } from '../../src/app/state/actions';
import { useStore } from '../../src/app/state/store';
import { createDesign } from '../../src/core/design/defaults';
import { parseDesign } from '../../src/core/design/schema';
import type { PageModel } from '../../src/core/layout/prims';
import { ov } from '../helpers/overrides';

const page = { key: 'monthLog:1', type: 'monthLog', blocks: [], index: 0, side: 'recto', w: 100, h: 100, content: { x: 0, y: 0, w: 100, h: 100 }, title: '', group: '', warnings: [] } as unknown as PageModel;

beforeEach(() => {
  useStore.getState().setDesign(parseDesign(createDesign('heritage', { year: 2027 })));
});

describe('resetStack', () => {
  it('quita solo las capas de este tipo, y deja ocultos y ajustes de otros tipos como estaban', () => {
    useStore.getState().update((d) => {
      d.overrides.push(
        ov({ pageType: 'monthLog', blockId: 'a', layer: 12 }),
        ov({ pageType: 'monthLog', blockId: 'b', layer: 13, dx: 2 }),
        ov({ pageType: 'monthLog', blockId: 'c', hidden: true, layer: 14 }),
        ov({ pageType: 'weekLeft', blockId: 'd', hidden: true }),
        ov({ pageType: 'weekLeft', blockId: 'e', layer: 5 }),
      );
    });
    resetStack(page, 'type');
    const o = useStore.getState().design!.overrides;
    expect(o.find((x) => x.blockId === 'a')).toBeUndefined();
    expect(o.find((x) => x.blockId === 'b')).toMatchObject({ layer: null, dx: 2 });
    expect(o.find((x) => x.blockId === 'c')).toMatchObject({ hidden: true, layer: null });
    expect(o.find((x) => x.blockId === 'd')).toMatchObject({ hidden: true });
    expect(o.find((x) => x.blockId === 'e')).toMatchObject({ layer: 5 });
  });

  it('una página sin elementos no tiene nada que mover', () => {
    expect(stackRecipe(page, 'x', 'up', 'type')).toBeNull();
  });
});
