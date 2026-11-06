/**
 * Lo que se puede mover, cambiar de tamaño o borrar: lo que el programa deja editar y la persona no
 * bloqueó. Un elemento bloqueado se sigue eligiendo (para ver sus propiedades o desbloquearlo).
 */
import type { Block } from '@core/layout/prims';

export const movable = (b: Pick<Block, 'editable' | 'locked'>): boolean => b.editable && b.locked !== true;
