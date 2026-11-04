import { describe, expect, it } from 'vitest';
import { editDistance, foldText, fuzzyScore, fuzzySearch, prepare } from '../src/core/util/fuzzy';

describe('búsqueda que perdona', () => {
  it('sin importar mayúsculas ni tildes', () => {
    expect(foldText('  Márgenes  de PÁGINA ')).toBe('margenes de pagina');
    expect(fuzzyScore(prepare('MARGENES'), prepare('Márgenes'))).toBe(1);
  });

  it('cuenta letras de más, de menos, cambiadas e invertidas', () => {
    expect(editDistance('calendario', 'calendario')).toBe(0);
    expect(editDistance('calendraio', 'calendario')).toBe(1);
    expect(editDistance('calndario', 'calendario')).toBe(1);
    expect(editDistance('kalendario', 'calendario')).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
  });

  it('encuentra con errores de tipeo y palabras a medio escribir; no inventa coincidencias', () => {
    const items = ['Calendario anual', 'Pestañas de meses en el borde', 'Márgenes', 'Marcadores del lector', 'Tamaños de letra'].map((label) => ({ label, prepared: prepare(label) }));
    expect(fuzzySearch('calendraio', items)[0]!.label).toBe('Calendario anual');
    expect(fuzzySearch('pestanas', items)[0]!.label).toBe('Pestañas de meses en el borde');
    expect(fuzzySearch('marca lect', items)[0]!.label).toBe('Marcadores del lector');
    expect(fuzzySearch('tamano', items)[0]!.label).toBe('Tamaños de letra');
    expect(fuzzySearch('zzz', items)).toEqual([]);
    // Lo literal va primero que lo aproximado.
    const s = fuzzySearch('marg', items);
    expect(s[0]!.label).toBe('Márgenes');
  });
});
