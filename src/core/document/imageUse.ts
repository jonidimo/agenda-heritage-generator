/**
 * Cuánto mide, impresa, cada imagen de la agenda: el mayor ancho y alto en milímetros con que se dibuja
 * en alguna página (o en la tapa). Con eso se sabe a cuántos ppp sale de verdad —no a los de un tamaño
 * supuesto— y hasta qué resolución vale la pena guardarla al exportar el PDF.
 */
import { coverSheet } from '../imposition/extras';
import type { Prim } from '../layout/prims';
import type { AgendaDocument } from './index';
import { imagesIn, pagePrims } from './layout';

export interface ImagePlacement {
  /** El mayor ancho impreso (mm) con que aparece la imagen. */
  maxWmm: number;
  /** El mayor alto impreso (mm). */
  maxHmm: number;
}

export interface PlacementScope {
  /** Solo estas páginas (índices); por defecto, todas. */
  pages?: readonly number[];
  /** Incluir también las imágenes de la tapa. */
  cover?: boolean;
  /** No contar las páginas (solo la tapa, si se pidió). */
  noPages?: boolean;
}

function note(into: Map<string, ImagePlacement>, prims: Prim[]): void {
  for (const im of imagesIn(prims)) {
    const prev = into.get(im.asset);
    into.set(im.asset, { maxWmm: Math.max(prev?.maxWmm ?? 0, im.w), maxHmm: Math.max(prev?.maxHmm ?? 0, im.h) });
  }
}

/**
 * Dónde y a qué tamaño se imprime cada imagen. Una página que no se puede maquetar se salta (el aviso
 * `layoutError` ya lo dice); las hojas de impresión solo trasladan las páginas, así que el tamaño de
 * una imagen en el pliego es el de la página.
 */
export function imagePlacements(doc: AgendaDocument, scope: PlacementScope = {}): Map<string, ImagePlacement> {
  const out = new Map<string, ImagePlacement>();
  if (!scope.noPages) {
    const wanted = scope.pages ? [...new Set(scope.pages)].filter((i) => i >= 0 && i < doc.pageCount) : Array.from({ length: doc.pageCount }, (_, i) => i);
    for (const i of wanted) {
      try {
        note(out, pagePrims(doc.page(i)));
      } catch {
        /* una página que no se arma no dice nada de sus imágenes */
      }
    }
  }
  if (scope.cover) {
    try {
      note(out, coverSheet(doc.ctx, doc.plan.signatures).prims);
    } catch {
      /* sin tapa que dibujar */
    }
  }
  return out;
}
