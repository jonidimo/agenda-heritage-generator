/** Rueda sobre una tira horizontal: la vertical se traduce a desplazamiento lateral. */
import { describe, expect, it } from 'vitest';
import { canScroll, wheelToScroll } from '../../src/app/state/wheel';

const wheel = (p: Partial<Parameters<typeof wheelToScroll>[0]>) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, ctrlKey: false, ...p });

describe('rueda → desplazamiento lateral', () => {
  it('la rueda vertical se vuelve horizontal, con el mismo signo', () => {
    expect(wheelToScroll(wheel({ deltaY: 120 }), 800)).toBe(120);
    expect(wheelToScroll(wheel({ deltaY: -120 }), 800)).toBe(-120);
  });

  it('las líneas y las páginas se pasan a píxeles', () => {
    expect(wheelToScroll(wheel({ deltaY: 3, deltaMode: 1 }), 800)).toBe(48);
    expect(wheelToScroll(wheel({ deltaY: 1, deltaMode: 2 }), 800)).toBe(800);
  });

  it('no toma los gestos que no son suyos: Mayús, Ctrl (zoom), horizontales o sin movimiento', () => {
    expect(wheelToScroll(wheel({ deltaY: 100, shiftKey: true }), 800)).toBeNull();
    expect(wheelToScroll(wheel({ deltaY: 100, ctrlKey: true }), 800)).toBeNull();
    expect(wheelToScroll(wheel({ deltaX: 90, deltaY: 30 }), 800)).toBeNull();
    expect(wheelToScroll(wheel({}), 800)).toBeNull();
  });

  it('solo se queda con la rueda si la tira todavía puede moverse en esa dirección', () => {
    const el = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 400 };
    expect(canScroll(el, 50)).toBe(true);
    expect(canScroll(el, -50)).toBe(false);
    expect(canScroll({ ...el, scrollLeft: 600 }, 50)).toBe(false);
    expect(canScroll({ ...el, scrollLeft: 600 }, -50)).toBe(true);
    expect(canScroll({ scrollLeft: 0, scrollWidth: 300, clientWidth: 400 }, 50)).toBe(false);
  });
});
