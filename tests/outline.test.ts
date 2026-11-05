/** Texto como contornos: lo que se dibuja es lo mismo que el SVG de la página (misma transformación). */
import { describe, expect, it } from 'vitest';
import { mapGlyphPath, outlineRun } from '../src/core/text/outline';
import { glyphPath, shapeText } from '../src/core/text/shape';
import { sharedFonts } from './helpers/node-env';

const nums = (d: string): number[] => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe('contornos de glifos', () => {
  it('lleva los puntos de unidades de diseño a mm: x + X·u, y − Y·u', () => {
    expect(mapGlyphPath('M0 0L100 200Q10 20 30 40C1 2 3 4 5 6Z', 0.01, 5, 10)).toBe('M5 10L6 8Q5.1 9.8 5.3 9.6C5.01 9.98 5.03 9.96 5.05 9.94Z');
  });

  it('rechaza órdenes que un contorno de fuente no trae (relativas, arcos)', () => {
    expect(() => mapGlyphPath('m0 0l1 1', 1, 0, 0)).toThrow(/no admitida/);
    expect(() => mapGlyphPath('M0 0A1 1 0 0 1 2 2', 1, 0, 0)).toThrow(/no admitida/);
    expect(() => mapGlyphPath('M0 0L1', 1, 0, 0)).toThrow(/mal formado/);
  });

  it('una corrida real da un trazado relleno cuyo primer punto coincide con el del SVG', async () => {
    const fonts = await sharedFonts();
    const face = fonts.list().find((f) => f.family === 'Manrope')!;
    const run = shapeText(face, 'Hola', 12);
    const path = outlineRun(fonts, run, 10, 20, '#112233')!;
    expect(path.t).toBe('path');
    expect(path.fill).toEqual({ color: '#112233' });
    // El primer glifo: su primer punto en unidades de diseño, con la matriz del dibujante SVG.
    const g0 = run.glyphs[0]!;
    const [X, Y] = nums(glyphPath(face, g0.id).slice(0, 40));
    const [x, y] = nums(path.d);
    expect(x).toBeCloseTo(10 + g0.x + X! * run.unit, 2);
    expect(y).toBeCloseTo(20 + g0.y - Y! * run.unit, 2);
  });

  it('una corrida vacía o de una cara que no está no da nada', async () => {
    const fonts = await sharedFonts();
    const face = fonts.list()[0]!;
    expect(outlineRun(fonts, shapeText(face, '', 12), 0, 0, '#000')).toBeNull();
    expect(outlineRun(fonts, { ...shapeText(face, 'a', 12), face: 'no|existe|normal' }, 0, 0, '#000')).toBeNull();
  });
});
