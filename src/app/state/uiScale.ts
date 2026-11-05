/**
 * Tamaño de la interfaz (no el de la página: eso es el zoom del lienzo). Se aplica con la
 * propiedad CSS `zoom` en `<html>`, que escala por igual textos, controles y paneles.
 *
 * Con `zoom` en la raíz, medido en Chromium y en Electron:
 * - `getBoundingClientRect()`, `clientX` y `offsetX` están en píxeles de pantalla; `offsetWidth`
 *   y los estilos, en píxeles de maquetación (los de pantalla divididos por el zoom).
 * - Las unidades `vw` y `vh` se multiplican por el zoom, y las media queries siguen midiendo la
 *   ventana en píxeles de pantalla. Por eso hay variables `--vw` y `--vh` (ver styles.css) y el
 *   zoom efectivo se acota para que la maquetación nunca baje del ancho de escritorio.
 */
import { useEffect, useState } from 'react';
import { useStore } from './store';
import { DESKTOP_BREAKPOINT, WIDE_BREAKPOINT, effectiveUiScale } from './uiScaleMath';

export { DESKTOP_BREAKPOINT, WIDE_BREAKPOINT, effectiveUiScale };

/** ¿El navegador escala la interfaz con `zoom`? (Chromium, Safari y Firefox 126 o posterior.) */
export function supportsUiScale(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('zoom', '1.1');
}

let applied = 1;

/** El zoom de interfaz que rige ahora (para convertir coordenadas de pantalla a las de la maquetación). */
export function currentUiZoom(): number {
  return applied;
}

/** Aplica el zoom a `<html>` y publica `--ui-zoom` para las variables `--vw` y `--vh`. */
function applyUiZoom(zoom: number): void {
  applied = zoom;
  const root = document.documentElement;
  root.style.zoom = zoom === 1 ? '' : String(zoom);
  root.style.setProperty('--ui-zoom', String(zoom));
}

export interface UiLayout {
  /** Zoom de interfaz aplicado. */
  zoom: number;
  /** Diseño de escritorio (paneles laterales) en lugar del de teléfono. Coincide con `md:`. */
  desktop: boolean;
  /** Hay lugar para el panel del elemento como columna fija. */
  wide: boolean;
}

/**
 * Aplica el tamaño elegido de la interfaz (y lo reajusta al cambiar el tamaño de la ventana) y
 * devuelve cómo queda la maquetación. Se usa una sola vez, en la raíz de la aplicación.
 */
export function useUiLayout(): UiLayout {
  const scale = useStore((s) => s.uiScale);
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const zoom = supportsUiScale() ? effectiveUiScale(scale, width) : 1;
  useEffect(() => applyUiZoom(zoom), [zoom]);
  return { zoom, desktop: width >= DESKTOP_BREAKPOINT, wide: width / zoom >= WIDE_BREAKPOINT };
}
