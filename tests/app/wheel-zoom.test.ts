/** Zoom con Ctrl + rueda: cuánto por movimiento, y el punto bajo el cursor que no se mueve. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZOOM } from '../../src/app/state/store';
import { anchorOf, anchorScroll, wheelZoomFactor } from '../../src/app/state/wheelZoom';

const w = (p: Partial<Parameters<typeof wheelZoomFactor>[0]>) => ({ deltaY: 0, deltaMode: 0, ctrlKey: true, metaKey: false, ...p });

describe('factor de zoom', () => {
  it('sin Ctrl ni ⌘ la rueda no es zoom', () => {
    expect(wheelZoomFactor(w({ deltaY: 100, ctrlKey: false }))).toBeNull();
    expect(wheelZoomFactor(w({ deltaY: 0 }))).toBeNull();
    expect(wheelZoomFactor(w({ deltaY: 100, ctrlKey: false, metaKey: true }))).not.toBeNull();
  });

  it('un clic de rueda es un paso; hacia arriba acerca; un salto grande no pasa de un paso', () => {
    expect(wheelZoomFactor(w({ deltaY: -100 }))).toBeCloseTo(ZOOM.step);
    expect(wheelZoomFactor(w({ deltaY: 100 }))).toBeCloseTo(1 / ZOOM.step);
    expect(wheelZoomFactor(w({ deltaY: -3, deltaMode: 1 }))).toBeCloseTo(ZOOM.step ** 0.48);
    expect(wheelZoomFactor(w({ deltaY: -5000 }))).toBeCloseTo(ZOOM.step);
  });

  it('el pellizco del panel táctil (deltas chicos) avanza de a poco, y acercar y alejar lo mismo se compensa', () => {
    fc.assert(
      fc.property(fc.double({ min: -400, max: 400, noNaN: true }).filter((d) => Math.abs(d) > 1e-6), (d) => {
        const f = wheelZoomFactor(w({ deltaY: d }))!;
        const g = wheelZoomFactor(w({ deltaY: -d }))!;
        expect(f).toBeGreaterThanOrEqual(1 / ZOOM.step - 1e-9);
        expect(f).toBeLessThanOrEqual(ZOOM.step + 1e-9);
        expect(f * g).toBeCloseTo(1, 9);
      }),
    );
  });
});

describe('anclaje bajo el cursor', () => {
  it('el punto de la página bajo el cursor vuelve a quedar bajo el cursor (propiedades)', () => {
    fc.assert(
      fc.property(
        fc.record({ left: fc.integer({ min: -2000, max: 2000 }), top: fc.integer({ min: -2000, max: 2000 }), width: fc.integer({ min: 50, max: 3000 }), height: fc.integer({ min: 50, max: 3000 }) }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.2, max: 6, noNaN: true }),
        fc.double({ min: 0.8, max: 1.5, noNaN: true }),
        (rect, fx, fy, k, ui) => {
          const cx = rect.left + fx * rect.width;
          const cy = rect.top + fy * rect.height;
          const a = anchorOf(cx, cy, rect);
          // El contenido creció k veces desde su esquina (como queda antes de desplazar).
          const grown = { left: rect.left, top: rect.top, width: rect.width * k, height: rect.height * k };
          const { dx, dy } = anchorScroll(a, grown, ui);
          // Desplazar dx (en píxeles de maquetación) corre el contenido dx·ui en pantalla.
          expect(grown.left - dx * ui + a.fx * grown.width).toBeCloseTo(cx, 6);
          expect(grown.top - dy * ui + a.fy * grown.height).toBeCloseTo(cy, 6);
        },
      ),
    );
  });
});
