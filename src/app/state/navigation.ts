/**
 * Historial de navegación del editor (como el de un navegador): «Atrás» vuelve por las páginas a
 * las que se saltó con enlaces, el navegador, las secciones o la verificación previa. Pasar
 * página con las flechas no lo llena. Se guardan claves de página, no números: si la agenda
 * cambia (se agregan o quitan páginas), «Atrás» sigue llevando a la misma página.
 */
import { documentFor } from './doc';
import { useStore } from './store';
import { clampPage } from './paging';

const LIMIT = 100;

function current(): { key: string | undefined; index: number } {
  const st = useStore.getState();
  const doc = st.design ? documentFor(st.design, st.resVersion).doc : null;
  const index = doc ? clampPage(st.pageIndex, doc.pageCount) : st.pageIndex;
  return { key: doc?.plan.pages[index]?.key, index };
}

function indexOf(key: string): number {
  const st = useStore.getState();
  const doc = st.design ? documentFor(st.design, st.resVersion).doc : null;
  return doc ? doc.indexOfKey(key) : -1;
}

/** Salta a una página y deja la actual en el historial. */
export function jumpToPage(index: number): void {
  const st = useStore.getState();
  const cur = current();
  if (cur.key && index !== cur.index) st.setNav([...st.navBack.slice(-(LIMIT - 1)), cur.key], []);
  st.goToPage(index);
}

/** Recorre el historial en una dirección; salta las páginas que ya no existen. */
function travel(dir: 'back' | 'forward'): void {
  const st = useStore.getState();
  const from = [...(dir === 'back' ? st.navBack : st.navForward)];
  const to = [...(dir === 'back' ? st.navForward : st.navBack)];
  const cur = current();
  while (from.length > 0) {
    const key = from.pop()!;
    const i = indexOf(key);
    if (i < 0) continue;
    if (cur.key) to.push(cur.key);
    st.setNav(dir === 'back' ? from : to.slice(-LIMIT), dir === 'back' ? to.slice(-LIMIT) : from);
    st.goToPage(i);
    return;
  }
  st.setNav(dir === 'back' ? from : st.navBack, dir === 'back' ? st.navForward : from);
}

export const goBack = (): void => travel('back');
export const goForward = (): void => travel('forward');
