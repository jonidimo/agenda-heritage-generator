/**
 * Controles que se arrastran (deslizadores, selectores de color): la misma receta sirve para
 * mostrar el valor mientras se arrastra (`preview`) y para confirmarlo al soltar (`commit`, un solo
 * paso de historial). Así `StylePanel`, `Inspector` y `PrintPanel` no repiten cada cambio dos veces.
 */
import { useStore, type Recipe } from './store';

export interface Scrubbing<T> {
  /** Vista previa en el lienzo: no entra al historial ni se guarda. */
  onPreview(value: T): void;
  /** Confirmación al soltar. */
  onChange(value: T): void;
}

/**
 * @param recipeOf receta que pone `value` en el diseño.
 * @param key clave del control: fusiona los cambios seguidos en un solo paso de deshacer y liga la
 *   vista previa con su confirmación.
 */
export function scrub<T>(recipeOf: (value: T) => Recipe, key: string): Scrubbing<T> {
  return {
    onPreview: (value) => useStore.getState().preview(recipeOf(value), key),
    onChange: (value) => useStore.getState().commit(recipeOf(value), key),
  };
}
