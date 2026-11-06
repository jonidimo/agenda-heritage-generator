/** Códigos QR: lo que se codifica se vuelve a leer igual con un lector independiente. */
import fc from 'fast-check';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { qrEncode, type QrEcc } from '../src/core/util/qr';

/** La matriz como imagen RGBA (4 px por módulo y el margen claro de 4 módulos), para el lector. */
function read(text: string, ecc: QrEcc = 'M'): string | null {
  const qr = qrEncode(text, ecc);
  const scale = 4;
  const quiet = 4;
  const side = (qr.size + quiet * 2) * scale;
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y]![x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }
  return jsQR(px, side, side)?.data ?? null;
}

describe('código QR', () => {
  it('el enlace al código fuente se lee igual', () => {
    const url = 'https://github.com/jonidimo/agenda-heritage-generator';
    expect(read(url)).toBe(url);
    expect(qrEncode(url).version).toBe(4);
  });

  it('textos con acentos, largos y en cada nivel de corrección se leen igual', () => {
    for (const ecc of ['L', 'M', 'Q', 'H'] as const) expect(read('Agenda Heritage · año 2027 · ñandú', ecc)).toBe('Agenda Heritage · año 2027 · ñandú');
    const long = 'https://jonidimo.github.io/agenda-heritage-generator/?x=' + 'a'.repeat(300);
    expect(read(long)).toBe(long);
    expect(qrEncode(long).version).toBeGreaterThanOrEqual(7);
  });

  it('cualquier texto se lee igual (propiedades)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 120 }), (s) => {
        expect(read(s)).toBe(s);
      }),
      { numRuns: 60 },
    );
  });

  it('demasiado largo no entra', () => {
    expect(() => qrEncode('x'.repeat(4000))).toThrow(/demasiado largo/);
  });
});
