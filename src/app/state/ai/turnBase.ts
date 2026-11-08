/**
 * La revisión de la agenda sobre la que trabaja el turno del asistente. Si la persona cambia la agenda mientras el
 * modelo trabaja, la propuesta llega vieja. Pero lo que el propio asistente agrega en el turno (una imagen o una
 * fuente importadas, que solo van a Recursos) no es un cambio ajeno: `adoptOwnChange` lo suma a la base.
 */
import { useStore } from '../store';

let base: number | null = null;

export const turnBase = (): number | null => base;
export const setTurnBase = (revision: number | null): void => {
  base = revision;
};

/** Después de un cambio propio del turno: la base lo incluye, siempre que antes de él estuviera al día. */
export function adoptOwnChange(revisionBefore: number): void {
  if (base !== null && base === revisionBefore) base = useStore.getState().revision;
}
