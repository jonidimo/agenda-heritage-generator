/** El selector que lleva a una fuente propia en el panel: un nombre con comillas o barras sigue valiendo. */
import { describe, expect, it } from 'vitest';
import { cssAttrValue } from '../../src/app/state/searchIndex';

describe('selector de una fuente', () => {
  it('escapa comillas, barras invertidas y saltos de línea', () => {
    expect(cssAttrValue('Mi "Letra"')).toBe('Mi \\"Letra\\"');
    expect(cssAttrValue('a\\b')).toBe('a\\\\b');
    expect(cssAttrValue('dos\nlíneas')).toBe('dos\\a líneas');
    expect(cssAttrValue('Lora')).toBe('Lora');
  });
});
