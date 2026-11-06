/**
 * Traducir fuera de un componente (acciones, el puente en vivo, el asistente): en el idioma que tiene
 * la interfaz en este momento.
 */
import { translate, type UiKey } from '../i18n/ui';
import { useStore } from './store';

export const tNow = (key: UiKey, vars?: Record<string, string | number>): string => translate(useStore.getState().uiLang, key, vars);
