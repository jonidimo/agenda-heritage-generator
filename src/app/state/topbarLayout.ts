/**
 * Cómo se acomoda la barra superior. No se adivina por el ancho de la ventana (los nombres cambian con el
 * idioma, y el tamaño de la interfaz cambia el lugar útil): la barra se mide a sí misma. Si su contenido no
 * entra, baja un nivel y recuerda cuánto ancho necesitaba ese nivel; cuando vuelve a haber ese ancho más un
 * margen, sube. El margen evita que la barra cambie de nivel a cada píxel cerca del límite.
 *
 * Niveles, del más completo al más angosto:
 * - 3: todo con su nombre (menús, modo y vistas, Exportar) y el buscador como campo ancho.
 * - 2: los menús solo con su ícono.
 * - 1: modo y vistas solo con su ícono; las ayudas de vista (guías, imán, enlaces) pasan al menú «⋯».
 * - 0: además, el historial y el zoom pasan al «⋯», el buscador es una lupa, y la barra puede usar dos renglones.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type TopbarLevel = 0 | 1 | 2 | 3;
export const TOP_LEVEL: TopbarLevel = 3;
/** Margen (px) por encima de lo que un nivel necesitaba antes de volver a él. */
export const LEVEL_HYSTERESIS = 24;

export interface FitState {
  level: TopbarLevel;
  /** Cuánto ancho necesitó cada nivel la última vez que no entró. */
  need: Partial<Record<TopbarLevel, number>>;
}

/** Con lo que se midió: el contenido pide `scrollWidth` y hay `clientWidth`. */
export function fitStep(state: FitState, scrollWidth: number, clientWidth: number): FitState {
  const { level, need } = state;
  if (scrollWidth > clientWidth + 1 && level > 0) return { level: (level - 1) as TopbarLevel, need: { ...need, [level]: scrollWidth } };
  if (level < TOP_LEVEL) {
    const up = (level + 1) as TopbarLevel;
    const wanted = need[up];
    if (wanted === undefined || clientWidth >= wanted + LEVEL_HYSTERESIS) return { level: up, need };
  }
  return state;
}

export type TopbarGroup = 'history' | 'zoom' | 'toggles';

/** Los grupos que van al menú «⋯» en cada nivel. */
export function overflowGroups(level: TopbarLevel): TopbarGroup[] {
  return level === 0 ? ['history', 'zoom', 'toggles'] : level === 1 ? ['toggles'] : [];
}

/**
 * Cuánto ancho necesita el contenido de la barra: la suma del ancho natural de sus zonas (marcadas con
 * `data-zone`, que no se encogen) más los espacios entre ellas y el relleno de la barra.
 */
export function neededWidth(header: HTMLElement): number {
  const zones = Array.from(header.querySelectorAll<HTMLElement>('[data-zone]'));
  const style = getComputedStyle(header);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const pad = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  return zones.reduce((sum, z) => sum + z.scrollWidth, 0) + gap * Math.max(0, zones.length - 1) + pad;
}

/** El nivel de la barra: se ajusta al medirla (en el mismo cuadro, antes de mostrarla) y al cambiar su ancho. */
export function useTopbarLevel(ref: RefObject<HTMLElement | null>): TopbarLevel {
  const [state, setState] = useState<FitState>({ level: TOP_LEVEL, need: {} });
  const last = useRef(state);
  last.current = state;
  // Después de cada dibujo: si no entra, un nivel menos (se repite hasta que entra). Sin lista de
  // dependencias a propósito: cualquier cambio de la barra (un nombre más largo, otro idioma) puede no
  // entrar; y no hay cadena infinita, porque solo baja de nivel y el nivel 0 no baja más.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = fitStep(last.current, neededWidth(el), el.clientWidth);
    if (next.level < last.current.level) setState(next);
  });
  // Al cambiar el ancho: probar un nivel más (si no entra, el efecto de arriba lo baja de nuevo).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      setState((s) => fitStep(s, neededWidth(el), el.clientWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return state.level;
}
