/**
 * Contadores de trabajo del editor, para las pruebas: se exponen en `window.__agendaStats` (junto a
 * `window.__agenda`, el almacén) y permiten comprobar, sin medir tiempos, que un arrastre no
 * redibuja las miniaturas ni vuelve a maquetar lo que no cambió.
 */
export const stats = {
  /** Miniaturas dibujadas en su lienzo. */
  thumbPaints: 0,
};
