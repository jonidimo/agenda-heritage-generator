/**
 * Menú contextual (clic derecho o pulsación larga en pantallas táctiles). Un único menú para
 * toda la aplicación: quien lo abre pasa la posición y las opciones.
 */
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { currentUiZoom } from '../state/uiScale';

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  /** Título de un grupo de opciones. */
  heading?: string;
  separator?: boolean;
}

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  open(x: number, y: number, items: MenuItem[]): void;
  close(): void;
}

export const useMenu = create<MenuState>((set) => ({
  menu: null,
  open: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}));

/** Abre el menú en la posición del evento (y evita el menú del navegador). */
export function openMenuAt(e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]): void {
  e.preventDefault();
  if (items.length > 0) useMenu.getState().open(e.clientX, e.clientY, items);
}

export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu);
  const close = useMenu((s) => s.close);
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Dentro de la ventana: si no entra a la derecha o abajo, se abre hacia el otro lado.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || !el) return setPos(null);
    // El puntero llega en píxeles de pantalla; el menú se coloca (y mide) en los de la maquetación.
    const zoom = currentUiZoom();
    const vw = window.innerWidth / zoom;
    const vh = window.innerHeight / zoom;
    const x = menu.x / zoom;
    const y = menu.y / zoom;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({ left: Math.max(4, Math.min(x, vw - w - 4)), top: Math.max(4, y + h > vh - 4 ? Math.max(4, y - h) : y) });
    el.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        close();
        e.preventDefault();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      e.preventDefault();
    };
    const onScroll = (): void => close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', onScroll);
    };
  }, [menu, close]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="scroll-thin fixed z-[60] max-h-[calc(75*var(--vh))] min-w-[230px] max-w-[320px] overflow-y-auto rounded-lg border border-line bg-paper py-1 text-[12.5px] shadow-2xl"
      style={{ left: pos?.left ?? menu.x / currentUiZoom(), top: pos?.top ?? menu.y / currentUiZoom(), visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} role="separator" className="my-1 border-t border-line" />
        ) : it.heading ? (
          <div key={i} className="truncate px-3 pt-1.5 pb-0.5 text-[10.5px] font-extrabold tracking-[0.08em] text-ink-soft uppercase">
            {it.heading}
          </div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              close();
              it.onSelect?.();
            }}
            className={clsx(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left outline-none hover:bg-black/5 focus:bg-black/5 disabled:opacity-40',
              it.danger ? 'text-warn' : 'text-ink',
            )}
          >
            <span className="flex w-4 shrink-0 justify-center">{it.checked ? <Check size={14} /> : it.icon}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
