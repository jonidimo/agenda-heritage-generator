/** El texto de las teclas de un atajo, para mostrarlas junto a un menú o en la ayuda. */
import type { UiKey } from '../i18n/ui';
import { isMacUserAgent } from './platform';
import { formatChord, SHORTCUTS, type Chord } from './shortcuts';

type T = (key: UiKey) => string;

/** ¿Este equipo es un Mac? (Ahí el atajo principal es ⌘.) */
export const isMac = (): boolean => typeof navigator !== 'undefined' && isMacUserAgent(navigator.userAgent);

const names = (t: T) => ({ ctrl: t('key.ctrl'), shift: t('key.shift'), alt: t('key.alt') });

/** Todas las combinaciones de un atajo, escritas. */
export function chordLabels(id: string, t: T): string[] {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? s.chords.map((c: Chord) => formatChord(c, isMac(), names(t))) : [];
}

/** La primera combinación de un atajo (la que va a la derecha de un ítem de menú), o `undefined`. */
export function shortcutHint(id: string, t: T): string | undefined {
  return chordLabels(id, t)[0];
}
