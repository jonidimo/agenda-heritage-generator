/** Pegar: de dónde salen los elementos según lo que trae el portapapeles. */
import { describe, expect, it } from 'vitest';
import { CLIPBOARD_MIME, pasteSource } from '../../src/app/state/clipboard';

const board = (items: Record<string, string>) => ({ types: Object.keys(items), getData: (t: string) => items[t] ?? '' });

describe('pegar', () => {
  it('el formato propio manda', () => {
    expect(pasteSource(board({ [CLIPBOARD_MIME]: '{}', 'text/plain': 'x' }), 'otro')).toBe('payload');
  });

  it('copiar desde el menú Edición deja solo el texto: si es el de lo último copiado acá, se pegan esos elementos', () => {
    expect(pasteSource(board({ 'text/plain': 'Enero\nNotas' }), 'Enero\nNotas')).toBe('internal');
    // Elementos sin texto (un dibujo): el menú escribe un texto vacío.
    expect(pasteSource(board({ 'text/plain': '' }), '')).toBe('internal');
  });

  it('lo copiado en otra aplicación no es lo último copiado acá', () => {
    expect(pasteSource(board({ 'text/plain': 'algo de otro lado' }), 'Enero')).toBe('foreign');
    expect(pasteSource(board({ 'image/png': 'x' }), 'Enero')).toBe('foreign');
    expect(pasteSource(board({ 'text/plain': 'Enero', 'text/html': '<b>Enero</b>' }), 'Enero')).toBe('foreign');
    // Sin nada copiado acá, un texto cualquiera no se pega como elementos.
    expect(pasteSource(board({ 'text/plain': '' }), null)).toBe('foreign');
  });

  it('sin datos del sistema (el menú Pegar) o con el portapapeles vacío, se usa la copia en memoria', () => {
    expect(pasteSource(null, null)).toBe('internal');
    expect(pasteSource(board({}), 'x')).toBe('internal');
  });
});
