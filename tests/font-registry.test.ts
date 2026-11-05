/** Registro de fuentes: las caras subidas se pueden quitar por archivo sin tocar las integradas. */
import { describe, expect, it } from 'vitest';
import { FontRegistry } from '../src/core/text/fonts';
import { sharedFonts } from './helpers/node-env';

describe('FontRegistry.unregisterFile', () => {
  it('quita solo las caras de ese archivo y devuelve cuántas quitó', async () => {
    const builtin = await sharedFonts();
    const face = builtin.list()[0]!;
    const reg = new FontRegistry();
    reg.register(face.bytes, { source: 'builtin' });
    const mine = reg.register(face.bytes, { family: 'Mi fuente', weight: 400, style: 'normal', source: 'user', file: 'font-1' });
    const other = reg.register(face.bytes, { family: 'Otra', weight: 700, style: 'normal', source: 'user', file: 'font-2' });
    expect(reg.families()).toContain('Mi fuente');
    expect(reg.unregisterFile('font-1')).toBe(1);
    expect(reg.has({ family: mine.family, weight: mine.weight, style: mine.style })).toBe(false);
    expect(reg.has({ family: other.family, weight: other.weight, style: other.style })).toBe(true);
    // Las integradas siguen, y quitar algo que no está no hace nada.
    expect(reg.list().some((f) => f.source === 'builtin')).toBe(true);
    expect(reg.unregisterFile('font-1')).toBe(0);
    expect(reg.unregisterFile('no-existe')).toBe(0);
  });
});
