/** Modos de fusión de un elemento con lo que hay debajo (los mismos en pantalla, SVG y PDF). */
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'darken', 'lighten'] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** El nombre del modo en CSS (`mix-blend-mode`), en un lienzo (`globalCompositeOperation`) y en un PDF (`/BM`). */
export const BLEND_NAMES: Record<BlendMode, { css: string; canvas: 'source-over' | 'multiply' | 'screen' | 'darken' | 'lighten'; pdf: string }> = {
  normal: { css: 'normal', canvas: 'source-over', pdf: 'Normal' },
  multiply: { css: 'multiply', canvas: 'multiply', pdf: 'Multiply' },
  screen: { css: 'screen', canvas: 'screen', pdf: 'Screen' },
  darken: { css: 'darken', canvas: 'darken', pdf: 'Darken' },
  lighten: { css: 'lighten', canvas: 'lighten', pdf: 'Lighten' },
};
