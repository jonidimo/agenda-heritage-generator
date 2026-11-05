/**
 * Qué hacen los tiradores de un bloque del programa. Hay tres casos y un cuarto, el de siempre:
 *  - reacomodar: la sección dibuja el bloque dentro de una caja (`LayoutContext.rect`) y los tiradores
 *    de los lados cambian esa caja; el contenido se vuelve a repartir en ella (con escala vale: el
 *    rectángulo que se arrastra se pasa a la caja dividiéndolo por la escala);
 *  - deformar: el usuario lo permitió y los tiradores estiran el dibujo, cada eje con su escala;
 *  - esquina: el resto (dibujos rígidos, girados) solo se escala desde la esquina.
 */
import type { Block } from './prims';
import { axisScales } from './box';

/** Un bloque que se puede ajustar con los tiradores: editable, del programa y no una marca de agua. */
function adjustable(block: Block): boolean {
  return block.editable && !block.rigid && block.role !== 'custom' && block.role !== 'watermark';
}

/** ¿Los tiradores de los lados reacomodan el contenido de este bloque? */
export function reflowable(block: Block): boolean {
  return adjustable(block) && block.box !== undefined && !block.deform && axisScales(block.m) !== null;
}

/** ¿Los tiradores estiran el dibujo de este bloque (escala distinta por eje)? Solo si se lo permitió y no va girado. */
export function deformable(block: Block): boolean {
  return adjustable(block) && block.deform === true && axisScales(block.m) !== null;
}

/** ¿Tiene los ocho tiradores? (Un elemento propio los tiene siempre.) */
export function hasSideHandles(block: Block): boolean {
  return block.role === 'custom' || reflowable(block) || deformable(block);
}
