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
  /** Lo que medía el contenido del nivel actual la última vez (para seguir sus cambios). */
  seen?: number;
}

/**
 * Si el contenido del nivel actual cambió de ancho (otro nombre, otro idioma, otro tamaño de la
 * interfaz), los niveles más completos cambian lo mismo: sus anchos guardados se corren esa diferencia.
 * Así un nombre que se acorta deja volver a subir sin esperar a que la ventana crezca.
 */
export function followContent(state: FitState, measured: number): FitState {
  if (state.seen === undefined) return { ...state, seen: measured };
  const delta = measured - state.seen;
  if (Math.abs(delta) < 1) return state;
  const need: FitState['need'] = {};
  for (const [k, v] of Object.entries(state.need)) {
    const lvl = Number(k) as TopbarLevel;
    if (v !== undefined) need[lvl] = lvl > state.level ? v + delta : v;
  }
  return { level: state.level, need, seen: measured };
}

/** Con lo que se midió: el contenido pide `scrollWidth` y hay `clientWidth`. */
export function fitStep(state: FitState, scrollWidth: number, clientWidth: number): FitState {
  const { level, need } = state;
  // Al cambiar de nivel, lo medido era de otro contenido: se vuelve a medir.
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
  // Después de cada dibujo: si no entra, un nivel menos; si entra y el de arriba también entraría, uno
  // más (así un salto grande de ancho sube de a un nivel por dibujo hasta donde entra). Sin lista de
  // dependencias a propósito: cualquier cambio de la barra (un nombre, otro idioma) puede cambiar lo que
  // entra. No hay cadena infinita: al bajar se guarda lo que necesitaba el nivel, y no se vuelve a subir
  // con ese ancho (falta el margen de `LEVEL_HYSTERESIS`).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measured = neededWidth(el);
    const followed = followContent(last.current, measured);
    const next = fitStep(followed, measured, el.clientWidth);
    if (next.level !== followed.level) setState({ level: next.level, need: next.need });
    else if (followed !== last.current) setState(followed);
  });
  // Al cambiar el ancho: probar un nivel más (si no entra, el efecto de arriba lo baja de nuevo).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      setState((s) => {
        const next = fitStep(s, neededWidth(el), el.clientWidth);
        return next.level === s.level ? next : { level: next.level, need: next.need };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return state.level;
}
