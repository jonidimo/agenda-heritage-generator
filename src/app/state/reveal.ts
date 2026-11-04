/**
 * Mostrar dónde está algo de la interfaz: abre el panel lateral y el grupo que lo contiene, lo
 * desplaza a la vista y lo hace titilar. Lo usan el buscador y los atajos del panel del elemento
 * («cambiar la letra de los títulos» lleva a ese renglón de Estilo).
 */
import { foldText } from '@core/util/fuzzy';
import { useStore, type Panel } from './store';

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/** Elemento más chico del panel cuyo texto propio es exactamente `text` (sin importar mayúsculas ni tildes). */
function findByText(root: ParentNode, text: string): HTMLElement | null {
  const want = foldText(text);
  let best: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>('label, button, span, h3, h4, p, summary, [data-search]')) {
    const own = el.getAttribute('data-search') ?? el.textContent ?? '';
    if (foldText(own) !== want) continue;
    if (!best || best.contains(el)) best = el;
  }
  return best;
}

export interface RevealTarget {
  panel?: Panel;
  /** Selector CSS del control (p. ej. `[data-reveal="role.title"]`). */
  selector?: string;
  /** O su texto visible. */
  text?: string;
}

/** Devuelve si lo encontró. */
export async function reveal(target: RevealTarget): Promise<boolean> {
  const st = useStore.getState();
  if (target.panel) {
    st.setPanel(target.panel);
    st.setSidebarOpen(true);
  }
  await frame();
  await frame();
  const root = document.querySelector('[data-sidebar]') ?? document;
  const el = (target.selector ? root.querySelector<HTMLElement>(target.selector) : null) ?? (target.text ? findByText(root, target.text) : null);
  if (!el) return false;
  // Abre los grupos plegados que lo contienen (de afuera hacia adentro).
  const groups: HTMLElement[] = [];
  for (let g = el.closest<HTMLElement>('[data-group]'); g; g = g.parentElement?.closest<HTMLElement>('[data-group]') ?? null) groups.unshift(g);
  for (const g of groups) g.dispatchEvent(new CustomEvent('reveal'));
  await frame();
  const spot = (el.closest<HTMLElement>('label, [role="group"], li, [data-reveal]') ?? el) as HTMLElement;
  spot.scrollIntoView({ block: 'center', behavior: 'smooth' });
  spot.classList.remove('reveal-flash');
  void spot.offsetWidth;
  spot.classList.add('reveal-flash');
  window.setTimeout(() => spot.classList.remove('reveal-flash'), 2200);
  const focusable = spot.matches('input, select, textarea, button') ? spot : spot.querySelector<HTMLElement>('input, select, textarea, button');
  focusable?.focus({ preventScroll: true });
  return true;
}
