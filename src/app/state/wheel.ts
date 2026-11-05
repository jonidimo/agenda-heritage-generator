/**
 * La rueda del mouse sobre una tira que se desplaza a los costados (las miniaturas, los meses): la
 * rueda común es vertical, así que se traduce a desplazamiento horizontal. Con Mayús, o si el gesto ya
 * es horizontal (un panel táctil), el navegador hace lo suyo.
 */
import { useEffect, type RefObject } from 'react';

/** Alto de un renglón (px) para ruedas que informan en líneas, y ancho de página para las que informan en páginas. */
const LINE_PX = 16;

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 píxeles, 1 líneas, 2 páginas (`WheelEvent.deltaMode`). */
  deltaMode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}

/** Cuánto desplazar a la derecha (negativo: a la izquierda), o `null` si el gesto no es para esta tira. */
export function wheelToScroll(e: WheelLike, pagePx: number): number | null {
  // Ctrl + rueda es zoom del navegador; Mayús + rueda ya es horizontal; un gesto que ya es horizontal, también.
  if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || e.deltaY === 0) return null;
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? pagePx : 1;
  return e.deltaY * unit;
}

/** ¿Puede la tira moverse todavía en esa dirección? (Si no, la rueda sigue su camino y desplaza lo de afuera.) */
export function canScroll(el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>, delta: number): boolean {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return false;
  return delta > 0 ? el.scrollLeft < max - 0.5 : el.scrollLeft > 0.5;
}

/** Engancha la rueda a una tira. El oyente no es pasivo: tiene que poder cancelar el desplazamiento vertical. */
export function useHorizontalWheel(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      const delta = wheelToScroll(e, el.clientWidth);
      if (delta === null || !canScroll(el, delta)) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}
