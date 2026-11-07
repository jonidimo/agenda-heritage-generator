/**
 * Desplazar el área de trabajo arrastrando, sin buscar las barras: con el botón del medio del mouse,
 * o con la barra espaciadora apretada y el botón principal (como en los programas de diseño). Mientras
 * se arrastra, el puntero no elige ni mueve elementos.
 *
 * El puntero se mide en píxeles de pantalla y el desplazamiento va en píxeles de maquetación: con la
 * interfaz agrandada (`zoom` en `<html>`), el arrastre se divide por ese zoom para que la página
 * acompañe al puntero exactamente.
 */
import { isTyping } from './typing';
import { currentUiZoom } from './uiScale';

export interface PanStart {
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
}

/** Dónde queda el desplazamiento con el puntero en (`clientX`, `clientY`), si el arrastre empezó en `start`. */
export function panScroll(start: PanStart, clientX: number, clientY: number, uiZoom: number): { left: number; top: number } {
  const z = uiZoom > 0 && Number.isFinite(uiZoom) ? uiZoom : 1;
  return { left: start.scrollLeft - (clientX - start.clientX) / z, top: start.scrollTop - (clientY - start.clientY) / z };
}

/** ¿Este botón (con o sin la barra espaciadora apretada) arrastra el área de trabajo? */
export function startsPan(e: { button: number; pointerType: string }, spaceHeld: boolean): boolean {
  if (e.button === 1) return e.pointerType === 'mouse';
  return e.button === 0 && spaceHeld && e.pointerType !== 'touch';
}

/**
 * La barra espaciadora prepara el arrastre solo con el foco en el área de trabajo o en ninguna parte:
 * en un campo escribe un espacio, y en un botón o una casilla (de un panel o del área de trabajo) los
 * activa, como siempre.
 */
const CONTROLS = 'button, a[href], select, summary, [role="button"], [role="menuitem"], [role="slider"], [role="checkbox"], [role="tab"]';

export function spaceArms(target: EventTarget | null, desk: HTMLElement): boolean {
  if (isTyping(target)) return false;
  if (!(target instanceof Node)) return true;
  if (target === document.body || target === document.documentElement) return true;
  // Un botón dentro del área de trabajo (anterior y siguiente, los de una página) se activa con la barra, como siempre.
  if (target instanceof Element && target.closest(CONTROLS)) return false;
  return desk.contains(target);
}

/** Instala el arrastre en el área de trabajo (el elemento que se desplaza); devuelve cómo quitarlo. */
export function installPan(desk: HTMLElement, uiZoom: () => number = currentUiZoom): () => void {
  let spaceHeld = false;
  let drag: (PanStart & { pointerId: number }) | null = null;

  const mark = (): void => {
    if (drag) desk.dataset.pan = 'dragging';
    else if (spaceHeld) desk.dataset.pan = 'ready';
    else delete desk.dataset.pan;
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!spaceArms(e.target, desk)) return;
    // Sin esto la barra desplazaría la ventana o activaría la página enfocada.
    e.preventDefault();
    if (spaceHeld) return;
    spaceHeld = true;
    mark();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || !spaceHeld) return;
    spaceHeld = false;
    mark();
  };
  // Al cambiar de ventana con la barra apretada, el `keyup` no llega: se suelta acá.
  const onBlur = (): void => {
    spaceHeld = false;
    mark();
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (drag || !startsPan(e, spaceHeld)) return;
    // Antes que la página: no empieza una selección ni un arrastre de elementos. Y el botón del medio
    // no abre el desplazamiento automático de Chromium.
    e.preventDefault();
    e.stopPropagation();
    drag = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, scrollLeft: desk.scrollLeft, scrollTop: desk.scrollTop };
    try {
      desk.setPointerCapture(e.pointerId);
    } catch {
      /* el puntero ya no existe: el arrastre termina con el próximo pointerup */
    }
    mark();
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const { left, top } = panScroll(drag, e.clientX, e.clientY, uiZoom());
    desk.scrollLeft = left;
    desk.scrollTop = top;
  };
  const onPointerEnd = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.stopPropagation();
    drag = null;
    if (desk.hasPointerCapture?.(e.pointerId)) desk.releasePointerCapture(e.pointerId);
    mark();
  };
  // En Linux, soltar el botón del medio pega lo copiado; y el clic del medio no debe abrir nada.
  const onAuxClick = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault();
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  desk.addEventListener('pointerdown', onPointerDown, true);
  desk.addEventListener('pointermove', onPointerMove, true);
  desk.addEventListener('pointerup', onPointerEnd, true);
  desk.addEventListener('pointercancel', onPointerEnd, true);
  desk.addEventListener('auxclick', onAuxClick);
  desk.addEventListener('mousedown', onMouseDown);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    desk.removeEventListener('pointerdown', onPointerDown, true);
    desk.removeEventListener('pointermove', onPointerMove, true);
    desk.removeEventListener('pointerup', onPointerEnd, true);
    desk.removeEventListener('pointercancel', onPointerEnd, true);
    desk.removeEventListener('auxclick', onAuxClick);
    desk.removeEventListener('mousedown', onMouseDown);
    drag = null;
    delete desk.dataset.pan;
  };
}
