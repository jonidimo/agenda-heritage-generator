/**
 * Alta de elementos compuestos en el editor: tamaño inicial y propiedades de cada tipo, con los
 * textos de ejemplo en el idioma de la interfaz. Los rangos y valores por defecto son los del núcleo.
 */
import { ELEMENT_KINDS, PROP_DEFAULTS, type ElementKind } from '@core/design/customBlocks';
import type { UiKey } from '../i18n/ui';

export { ELEMENT_KINDS, type ElementKind };

type T = (key: UiKey, vars?: Record<string, string | number>) => string;

/** Nombre de cada tipo (el botón de agregar y el nombre del elemento en la página). */
export const ELEMENT_LABELS: Record<ElementKind, UiKey> = {
  table: 'el.kind.table',
  checklist: 'el.kind.checklist',
  habits: 'el.kind.habits',
  finance: 'el.kind.finance',
  minical: 'el.kind.minical',
  quadrants: 'el.kind.quadrants',
  notes: 'el.kind.notes',
  timeline: 'el.kind.timeline',
  rating: 'el.kind.rating',
  qr: 'el.kind.qr',
};

export function isElementKind(kind: string): kind is ElementKind {
  return (ELEMENT_KINDS as readonly string[]).includes(kind);
}

/** Tamaño inicial (mm) de cada tipo; el ancho nunca pasa del de la zona de contenido. */
export function elementSize(kind: ElementKind, contentW: number): { w: number; h: number } {
  const wide = (w: number): number => Math.min(contentW, w);
  switch (kind) {
    case 'table':
      return { w: wide(120), h: 55 };
    case 'checklist':
      return { w: wide(90), h: 60 };
    case 'habits':
      return { w: contentW, h: 55 };
    case 'finance':
      return { w: wide(80), h: 60 };
    case 'minical':
      return { w: wide(60), h: 50 };
    case 'quadrants':
      return { w: wide(110), h: 90 };
    case 'notes':
      return { w: wide(120), h: 70 };
    case 'timeline':
      return { w: wide(70), h: 110 };
    case 'rating':
      return { w: wide(70), h: 9 };
    case 'qr':
      // 25 mm de lado: se lee bien impreso con un texto de hasta unas 100 letras.
      return { w: wide(25), h: 25 };
  }
}

/** Propiedades iniciales de un elemento nuevo. */
export function elementProps(kind: ElementKind, t: T): Record<string, unknown> {
  const label = t(ELEMENT_LABELS[kind]);
  switch (kind) {
    case 'table':
      return { label, rows: PROP_DEFAULTS.tableRows, cols: PROP_DEFAULTS.tableCols, header: true, headers: [t('el.col', { n: 1 }), t('el.col', { n: 2 }), t('el.col', { n: 3 })] };
    case 'checklist':
      return { label, items: PROP_DEFAULTS.checkItems, columns: 1, shape: 'circle' };
    case 'habits':
      return { label, rows: PROP_DEFAULTS.habitRows, days: PROP_DEFAULTS.habitDays };
    case 'finance':
      return { label, lines: PROP_DEFAULTS.amountLines, total: true, title: t('el.kind.finance') };
    case 'minical':
      return { label, month: 'auto', title: true };
    case 'quadrants':
      return { label, titles: [t('el.quadrant.1'), t('el.quadrant.2'), t('el.quadrant.3'), t('el.quadrant.4')], style: 'blank' };
    case 'notes':
      return { label, title: t('el.kind.notes') };
    case 'timeline':
      return { label, from: PROP_DEFAULTS.hourFrom, to: PROP_DEFAULTS.hourTo, step: PROP_DEFAULTS.hourStep };
    case 'rating':
      return { label, count: PROP_DEFAULTS.ratingCount, shape: 'star' };
    case 'qr':
      return { label, text: '', ecc: 'M' };
  }
}
