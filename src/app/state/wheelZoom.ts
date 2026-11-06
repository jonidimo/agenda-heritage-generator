/**
 * Zoom del lienzo con Ctrl (o ⌘) y la rueda del mouse, o con el pellizco del panel táctil (que el
 * navegador informa como rueda con Ctrl). Funciones puras: cuánto acercar por cada movimiento y cuánto
 * desplazar después para que el punto de la página que estaba bajo el cursor siga ahí.
 */
import { ZOOM } from './store';

export interface WheelZoomInput {
  deltaY: number;
  /** 0 píxeles, 1 líneas, 2 páginas (`WheelEvent.deltaMode`). */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Píxeles que equivalen a una línea o a una página de rueda. */
const LINE_PX = 16;
const PAGE_PX = 100;
/** Un «clic» de rueda (unos 100 px) es un paso de zoom; el pellizco, con deltas chicos, avanza de a poco. */
const PX_PER_STEP = 100;

/** El factor de zoom de un movimiento de rueda, o `null` si no es un gesto de zoom (sin Ctrl ni ⌘). */
export function wheelZoomFactor(e: WheelZoomInput): number | null {
  if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0 || !Number.isFinite(e.deltaY)) return null;
  const px = e.deltaY * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1);
  // Hacia arriba (delta negativo) acerca; un movimiento grande no salta más de un paso.
  const steps = Math.max(-1, Math.min(1, -px / PX_PER_STEP));
  return ZOOM.step ** steps;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Dónde está el cursor dentro del contenido, como fracción de su ancho y su alto. */
export interface ZoomAnchor {
  clientX: number;
  clientY: number;
  fx: number;
  fy: number;
}

export function anchorOf(clientX: number, clientY: number, content: RectLike): ZoomAnchor {
  return { clientX, clientY, fx: content.width > 0 ? (clientX - content.left) / content.width : 0.5, fy: content.height > 0 ? (clientY - content.top) / content.height : 0.5 };
}

/**
 * Cuánto desplazar el lienzo (en píxeles de maquetación) para que el punto anclado vuelva a quedar bajo el
 * cursor, dado el contenido con su tamaño nuevo. Las cajas y el cursor se miden en píxeles de pantalla, y el
 * desplazamiento va en píxeles de maquetación: con la interfaz agrandada, se divide por ese zoom.
 */
export function anchorScroll(anchor: ZoomAnchor, content: RectLike, uiZoom: number): { dx: number; dy: number } {
  const x = content.left + anchor.fx * content.width;
  const y = content.top + anchor.fy * content.height;
  const z = uiZoom > 0 ? uiZoom : 1;
  return { dx: (x - anchor.clientX) / z, dy: (y - anchor.clientY) / z };
}
