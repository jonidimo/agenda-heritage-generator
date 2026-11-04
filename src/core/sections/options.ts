/**
 * Forma de las opciones de cada sección, a partir de sus valores por defecto y de los valores
 * posibles de las opciones de texto. La usan el formulario del panel de secciones y el esquema
 * JSON del archivo, así los dos ofrecen exactamente lo mismo.
 */
import { SECTION_REGISTRY } from './registry';
import { OPTION_COUNT } from './types';

export { OPTION_COUNT };

/** Valores posibles de las opciones de texto (por «tipo.opción» o por opción). */
const OPTION_VALUES: Readonly<Record<string, readonly string[]>> = {
  'weeks.variant': ['alastair', 'horizontal', 'vertical', 'daily'],
  'review.variant': ['auto', 'heritage', 'reflective'],
  footer: ['expenses', 'review', 'none'],
  style: ['auto', 'dots', 'lines', 'grid', 'blank'],
  spread: ['auto', 'true', 'false'],
  woop: ['auto', 'true', 'false'],
  priorities: ['auto', 'true', 'false'],
  detailed: ['auto', 'true', 'false'],
};

export type OptionField =
  | { key: string; kind: 'choice'; values: readonly string[]; default: unknown }
  | { key: string; kind: 'boolean'; default: boolean }
  | { key: string; kind: 'count'; default: number };

/** Las opciones que se pueden ajustar en un tipo de sección, en el orden de sus valores por defecto. */
export function sectionOptionFields(type: string): OptionField[] {
  const mod = SECTION_REGISTRY.get(type);
  if (!mod) return [];
  return Object.entries(mod.defaults).flatMap(([key, def]): OptionField[] => {
    const values = OPTION_VALUES[`${type}.${key}`] ?? OPTION_VALUES[key];
    if (values) return [{ key, kind: 'choice', values, default: def }];
    if (typeof def === 'boolean') return [{ key, kind: 'boolean', default: def }];
    if (typeof def === 'number') return [{ key, kind: 'count', default: def }];
    return [];
  });
}

/**
 * Opciones que el formulario no muestra (las maneja otro editor o solo se escriben en el archivo),
 * con su esquema JSON. Por «tipo.opción».
 */
export const EXTRA_OPTIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  'pageTemplate.template': { type: 'string', description: 'id de un elemento de «pageTemplates»' },
  'vision.categories': { type: 'array', items: { type: 'string', maxLength: 80 }, description: 'Áreas de la matriz de visión (por defecto, las del idioma de la agenda)' },
};

/** Valor que se guarda al elegir de una lista: «true» y «false» quedan como sí/no. */
export const choiceValue = (v: string): string | boolean => (v === 'true' ? true : v === 'false' ? false : v);
