/**
 * Cuántos píxeles tiene la imagen de una página (o de una zona de ella) que se pide por ancho o por ppp, y qué
 * zona se dibuja. Lo usa `render_page` del servidor MCP; acá no hay nada de Node para poder probarlo aparte.
 */

/** El lado más grande que se dibuja, en píxeles (una hoja A3 a 600 ppp tiene unos 7000). */
export const RENDER_MAX_SIDE_PX = 8000;
/** Los megapíxeles más que se dibujan en una imagen. */
export const RENDER_MAX_MEGAPIXELS = 40;
/** Lo más ancho que se devuelve dentro de la respuesta (lo ve el modelo: cuesta). */
export const RENDER_INLINE_PX = 1600;
/** Lo más ancho de la vista que acompaña a un archivo guardado. */
export const RENDER_PREVIEW_PX = 1000;

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * La zona pedida, recortada a la página. Una zona que no toca la página es un error claro: devolver una imagen
 * vacía haría pensar que la página está en blanco.
 */
export function clampArea(area: Zone, pageW: number, pageH: number): Zone {
  const x = Math.max(0, area.x);
  const y = Math.max(0, area.y);
  const w = Math.min(pageW, area.x + area.w) - x;
  const h = Math.min(pageH, area.y + area.h) - y;
  if (!(w > 0.01) || !(h > 0.01)) throw new Error(`La zona (x ${area.x}, y ${area.y}, ${area.w} × ${area.h} mm) queda fuera de la página (${Math.round(pageW * 10) / 10} × ${Math.round(pageH * 10) / 10} mm).`);
  return { x, y, w, h };
}

/**
 * Los píxeles de la imagen de una zona: por «width», por «dpi», o los de siempre (800 px de ancho para una
 * página entera y 300 ppp para una zona). Con un tamaño que no se puede dibujar, un error que dice el máximo.
 */
export function renderSize(zone: Zone, opts: { width?: number | undefined; dpi?: number | undefined; zoomed: boolean }): { w: number; h: number } {
  const w = opts.width ?? Math.round((zone.w / 25.4) * (opts.dpi ?? (opts.zoomed ? 300 : (800 * 25.4) / zone.w)));
  const h = Math.max(1, Math.round((w * zone.h) / zone.w));
  if (w < 1 || w > RENDER_MAX_SIDE_PX || h > RENDER_MAX_SIDE_PX || (w * h) / 1_000_000 > RENDER_MAX_MEGAPIXELS) {
    throw new Error(`La imagen saldría de ${w} × ${h} px: el máximo es ${RENDER_MAX_SIDE_PX} px de lado y ${RENDER_MAX_MEGAPIXELS} megapíxeles. Pedí menos «dpi», un «width» menor o una «area» más chica.`);
  }
  return { w, h };
}
