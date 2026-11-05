/**
 * Encuadre del lienzo: acercar la vista a un elemento y llevar a la vista el que quedó fuera
 * (al elegirlo con el teclado o desde el buscador). El lienzo registra su área de trabajo; lo
 * demás son cuentas puras sobre rectángulos, para poder probarlas sin navegador.
 */
import type { Rect } from '@core/util/geometry';
import { useStore } from './store';

/** Lo que el lienzo dice de sí mismo mientras está en pantalla. */
export interface Viewport {
  /** El contenedor que se desplaza. */
  scroller: HTMLElement;
  /** Píxeles por milímetro con el zoom en 1 (la página ajustada a la ventana). */
  fitScale: number;
  /** Ancho de una página en mm (para saber a qué escala está dibujada). */
  pageWidthMm: number;
}

let registered: Viewport | null = null;

export function registerViewport(v: Viewport | null): void {
  registered = v;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/** El zoom (múltiplo de la página ajustada) con el que `rect` llena el área menos el margen. */
export function zoomForRect(rect: Pick<Rect, 'w' | 'h'>, area: { w: number; h: number }, fitScale: number, marginPx: number): number {
  const w = Math.max(rect.w, 1);
  const h = Math.max(rect.h, 1);
  const px = Math.min(Math.max(1, area.w - 2 * marginPx) / w, Math.max(1, area.h - 2 * marginPx) / h);
  return px / Math.max(fitScale, 1e-6);
}

/**
 * Cuánto desplazar para que `target` (en píxeles, relativo al área visible) quede centrado; con
 * `onlyIfHidden`, solo si no se ve entero (y entonces lo justo para que entre).
 */
export function scrollDelta(target: Rect, area: { w: number; h: number }, onlyIfHidden: boolean, marginPx = 24): { dx: number; dy: number } {
  const axis = (pos: number, size: number, avail: number): number => {
    if (!onlyIfHidden) return pos + size / 2 - avail / 2;
    if (size + 2 * marginPx > avail) return pos + size / 2 - avail / 2;
    if (pos < marginPx) return pos - marginPx;
    if (pos + size > avail - marginPx) return pos + size - (avail - marginPx);
    return 0;
  };
  return { dx: axis(target.x, target.w, area.w), dy: axis(target.y, target.h, area.h) };
}

/** El rectángulo de la página (en mm) en píxeles, relativo al área visible del lienzo. */
function rectInView(v: Viewport, pageIndex: number, rect: Rect): Rect | null {
  const page = v.scroller.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`);
  if (!page || v.pageWidthMm <= 0) return null;
  const k = page.getBoundingClientRect().width / v.pageWidthMm;
  const origin = page.getBoundingClientRect();
  const view = v.scroller.getBoundingClientRect();
  return { x: origin.left - view.left + rect.x * k, y: origin.top - view.top + rect.y * k, w: rect.w * k, h: rect.h * k };
}

function scrollBy(v: Viewport, dx: number, dy: number): void {
  v.scroller.scrollTo({ left: v.scroller.scrollLeft + dx, top: v.scroller.scrollTop + dy, behavior: 'auto' });
}

/** Lleva `rect` (mm, de la página `pageIndex`) a la vista, sin cambiar el zoom, si estaba fuera. */
export function scrollRectIntoView(pageIndex: number, rect: Rect): void {
  const v = registered;
  if (!v) return;
  const px = rectInView(v, pageIndex, rect);
  if (!px) return;
  const { dx, dy } = scrollDelta(px, { w: v.scroller.clientWidth, h: v.scroller.clientHeight }, true);
  if (dx !== 0 || dy !== 0) scrollBy(v, dx, dy);
}

/** Acerca el zoom a `rect` (mm, de la página `pageIndex`) y lo deja centrado. Devuelve si pudo. */
export async function zoomToRect(pageIndex: number, rect: Rect, marginPx = 48): Promise<boolean> {
  const v = registered;
  if (!v) return false;
  const zoom = zoomForRect(rect, { w: v.scroller.clientWidth, h: v.scroller.clientHeight }, v.fitScale, marginPx);
  useStore.getState().setZoom(zoom, false);
  // El zoom se aplica al dibujar: se espera a que la página tenga su tamaño nuevo para centrarla.
  await nextFrame();
  await nextFrame();
  const px = rectInView(registered ?? v, pageIndex, rect);
  if (!px) return false;
  const { dx, dy } = scrollDelta(px, { w: v.scroller.clientWidth, h: v.scroller.clientHeight }, false);
  scrollBy(v, dx, dy);
  return true;
}
