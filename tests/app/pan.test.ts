/** Arrastrar el área de trabajo: qué botón lo hace y cuánto se desplaza (con la interfaz agrandada también). */
import { describe, expect, it } from 'vitest';
import { panScroll, startsPan } from '../../src/app/state/pan';

const start = { clientX: 500, clientY: 300, scrollLeft: 1000, scrollTop: 800 };

describe('panScroll', () => {
  it('la página acompaña al puntero: arrastrar a la derecha y abajo desplaza hacia la izquierda y arriba', () => {
    expect(panScroll(start, 560, 340, 1)).toEqual({ left: 940, top: 760 });
    expect(panScroll(start, 420, 250, 1)).toEqual({ left: 1080, top: 850 });
  });

  it('con la interfaz agrandada, el puntero (en píxeles de pantalla) se pasa a píxeles de maquetación', () => {
    expect(panScroll(start, 625, 300, 1.25)).toEqual({ left: 900, top: 800 });
  });

  it('un zoom inválido cuenta como 1', () => {
    expect(panScroll(start, 510, 300, 0)).toEqual({ left: 990, top: 800 });
    expect(panScroll(start, 510, 300, Number.NaN)).toEqual({ left: 990, top: 800 });
  });

  it('sin movimiento no cambia nada', () => {
    expect(panScroll(start, 500, 300, 1.5)).toEqual({ left: 1000, top: 800 });
  });
});

describe('startsPan', () => {
  it('el botón del medio del mouse siempre arrastra', () => {
    expect(startsPan({ button: 1, pointerType: 'mouse' }, false)).toBe(true);
    expect(startsPan({ button: 1, pointerType: 'mouse' }, true)).toBe(true);
  });

  it('el botón principal arrastra solo con la barra espaciadora apretada', () => {
    expect(startsPan({ button: 0, pointerType: 'mouse' }, false)).toBe(false);
    expect(startsPan({ button: 0, pointerType: 'mouse' }, true)).toBe(true);
    expect(startsPan({ button: 0, pointerType: 'pen' }, true)).toBe(true);
  });

  it('el tacto ya desplaza solo, y el botón derecho abre el menú', () => {
    expect(startsPan({ button: 0, pointerType: 'touch' }, true)).toBe(false);
    expect(startsPan({ button: 2, pointerType: 'mouse' }, true)).toBe(false);
  });
});
