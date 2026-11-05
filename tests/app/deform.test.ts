/** Recetas de los tiradores: reacomodar con escala puesta y estirar con «Permitir deformar». */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../../src/core/design/defaults';
import { parseDesign, type Design } from '../../src/core/design/schema';
import type { Block, PageModel } from '../../src/core/layout/prims';
import { resizeRecipeFor } from '../../src/app/state/actions';
import { ov } from '../helpers/overrides';

const design = (): Design => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

const page = (): PageModel => ({ key: 'week:2027-W10:left', type: 'weekRight', index: 5, side: 'recto', w: 148.5, h: 210, content: { x: 10, y: 10, w: 128, h: 190 }, title: '', group: 'month:2027-03', blocks: [], warnings: [] });

const block = (patch: Partial<Block>): Block => ({ id: 'week.notes', label: 'Notas', bbox: { x: 20, y: 30, w: 80, h: 40 }, prims: [], role: 'content', editable: true, layer: 10, ...patch });

const apply = (d: Design, recipe: (x: Design) => void): Design => produce(d, (x) => void recipe(x as Design));
const only = (d: Design) => {
  expect(d.overrides).toHaveLength(1);
  return d.overrides[0]!;
};

describe('tiradores con escala', () => {
  it('con escala 1,5 el rectángulo que se ve vuelve a la caja de la sección dividido por la escala', () => {
    const b = block({ box: { x: 20, y: 30, w: 80, h: 40 }, m: [1.5, 0, 0, 1.5, 0, 0] });
    const o = only(apply(design(), resizeRecipeFor(page(), b, { x: 20, y: 30, w: 150, h: 75 }, 'type')));
    // La caja pasa de 80×40 a 100×50: 20 mm más ancha y 10 mm más alta; la esquina no se mueve.
    expect([o.dx, o.dy, o.dw, o.dh]).toEqual([0, 0, 20, 10]);
    expect(o.scale).toBe(1); // la escala no se toca: es otro ajuste
  });

  it('sin escala hace lo de siempre', () => {
    const b = block({ box: { x: 20, y: 30, w: 80, h: 40 } });
    const o = only(apply(design(), resizeRecipeFor(page(), b, { x: 15, y: 30, w: 90, h: 40 }, 'type')));
    expect([o.dx, o.dy, o.dw, o.dh]).toEqual([-5, 0, 10, 0]);
  });
});

describe('permitir deformar', () => {
  it('estira cada eje por separado y deja la esquina donde se arrastró', () => {
    const b = block({ deform: true });
    const o = only(apply(design(), resizeRecipeFor(page(), b, { x: 25, y: 30, w: 160, h: 20 }, 'type')));
    expect(o.deform).toBe(true);
    expect([o.scale, o.scaleY]).toEqual([2, 0.5]);
    expect([o.dx, o.dy]).toEqual([5, 0]);
    // La caja natural no cambia de tamaño: nada se reacomoda.
    expect([o.dw, o.dh]).toEqual([0, 0]);
  });

  it('con la misma escala en los dos ejes no guarda escala vertical propia', () => {
    const b = block({ deform: true });
    const o = only(apply(design(), resizeRecipeFor(page(), b, { x: 20, y: 30, w: 160, h: 80 }, 'type')));
    expect([o.scale, o.scaleY]).toEqual([2, null]);
  });

  it('un ajuste de tamaño ya hecho se conserva al deformar (el ancho y el alto estirados ya están en el dibujo)', () => {
    const d0 = apply(design(), (x) => void x.overrides.push(ov({ pageType: 'weekRight', pageKey: null, blockId: 'week.notes', dx: 0, dy: 0, dw: 10, dh: 0, scale: 1, scaleY: null, deform: true, rotation: 0, opacity: 1, hidden: false })));
    const b = block({ deform: true, bbox: { x: 20, y: 30, w: 80, h: 40 } });
    const o = only(apply(d0, resizeRecipeFor(page(), b, { x: 20, y: 30, w: 80, h: 80 }, 'type')));
    expect(o.dw).toBe(10);
    expect([o.scale, o.scaleY]).toEqual([1, 2]);
  });
});
