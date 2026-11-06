/** Nombres de archivo que sirven en Windows, macOS y Linux. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FILE_BASE_MAX_BYTES, fileBase } from '../src/core/util/filename';

describe('nombres de archivo', () => {
  it('sin tildes ni símbolos', () => {
    expect(fileBase({ name: 'Mi agenda 2027' })).toBe('mi-agenda-2027');
    expect(fileBase({ name: 'Planer für Jürgen: 2027?' })).toBe('planer-fur-jurgen-2027');
    expect(fileBase({ name: '«Agenda» de Anne / Été' })).toBe('agenda-de-anne-ete');
    expect(fileBase({ name: '***' })).toBe('agenda');
  });

  it('nunca un nombre reservado de Windows', () => {
    for (const name of ['Con', 'NUL', 'aux', 'Prn', 'COM1', 'lpt9']) expect(fileBase({ name })).toBe(`${name.toLowerCase()}-agenda`);
    expect(fileBase({ name: 'Console' })).toBe('console');
  });

  it('cualquier nombre da algo válido en los tres sistemas y entra en el tope de bytes (propiedades)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400, unit: 'grapheme' }), (name) => {
        const base = fileBase({ name });
        expect(base.length).toBeGreaterThan(0);
        expect(new TextEncoder().encode(base).length).toBeLessThanOrEqual(FILE_BASE_MAX_BYTES);
        expect(base).not.toMatch(/[<>:"/\\|?*\p{Cc}]/u);
        expect(base).not.toMatch(/^-|-$|\.$|\s/);
        expect(base).not.toMatch(/^(?:con|prn|aux|nul|com\d|lpt\d)$/i);
      }),
      { numRuns: 1000 },
    );
    expect(new TextEncoder().encode(fileBase({ name: '日本語の手帳'.repeat(40) })).length).toBeLessThanOrEqual(FILE_BASE_MAX_BYTES);
  });
});
