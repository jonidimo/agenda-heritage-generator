/**
 * Encuadernación efectiva: lo que el documento lee en lugar de `design.binding`. Para imprimir es lo
 * mismo que se guardó. Para leer en pantalla (`target: 'screen'`) se anula todo lo que solo existe
 * por el papel: costura, recortes, zona no imprimible, marcas y compensación. Las páginas conservan
 * su tamaño (lo que se ve en el editor es lo que sale), solo que sin esos márgenes ni cuadernillos.
 *
 * Es la única lectura de `design.binding` fuera de la planificación del formato: el resto del núcleo
 * pregunta al contexto del documento (`doc.binding`), así un destino nuevo no deja lecturas sueltas.
 */
import type { TargetDpi } from '../assets/resample';
import type { Design } from '../design/schema';
import { insetRect, type Rect } from '../util/geometry';

export type Binding = Design['binding'];

const cache = new WeakMap<Binding, Binding>();

export function effectiveBinding(design: Pick<Design, 'binding'>): Binding {
  const b = design.binding;
  if (b.target === 'print') return b;
  const hit = cache.get(b);
  if (hit) return hit;
  const eff: Binding = {
    ...b,
    gutter: 0,
    creep: { ...b.creep, mode: 'off' },
    marks: { fold: false, crop: false, collation: false, signatureLabel: false },
    trim: { top: 0, bottom: 0, outer: 0 },
    nonPrintable: 0,
    backOffset: { x: 0, y: 0 },
  };
  cache.set(b, eff);
  return eff;
}

/** ¿Se hace para leer en pantalla? (Sin cuadernillos, hojas impuestas ni material de encuadernación.) */
export const isScreen = (binding: Pick<Binding, 'target'>): boolean => binding.target === 'screen';

/** La resolución de imágenes del PDF si nadie elige otra: 300 ppp para imprimir, 150 para leer en pantalla. */
export const defaultImageDpi = (binding: Pick<Binding, 'target'>): TargetDpi => (isScreen(binding) ? 150 : 300);

/** La parte de la página que la impresora imprime: sin la franja del borde (y sin ella en el lado del lomo, que sigue en la otra página). */
export function safeArea(binding: Pick<Binding, 'method' | 'nonPrintable'>, page: { w: number; h: number; side: 'recto' | 'verso' }): Rect {
  const np = binding.nonPrintable;
  const box = { x: 0, y: 0, w: page.w, h: page.h };
  // Papel suelto o pila cortada: la franja rodea toda la hoja. Plegada: el lomo no la tiene.
  if (binding.method === 'single' || binding.method === 'cut-stack') return insetRect(box, np);
  return insetRect(box, np, page.side === 'recto' ? np : 0, np, page.side === 'recto' ? 0 : np);
}

/** Lo que se dibuja sobre la página en el modo «Impresión»: la zona que no se imprime y la franja de la costura. */
export interface PrintGuides {
  safe: Rect;
  /** Franja del lomo que se reservó para coser o perforar (`null` si no hay). */
  gutter: Rect | null;
}

export function printGuides(binding: Pick<Binding, 'method' | 'nonPrintable' | 'gutter'>, page: { w: number; h: number; side: 'recto' | 'verso' }): PrintGuides {
  const g = binding.gutter;
  const gutter = g > 0 ? { x: page.side === 'recto' ? 0 : page.w - g, y: 0, w: g, h: page.h } : null;
  return { safe: safeArea(binding, page), gutter };
}
