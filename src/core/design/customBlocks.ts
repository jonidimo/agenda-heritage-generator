/**
 * Propiedades de cada tipo de elemento propio (`customBlocks[].props`): nombres, valores posibles y
 * rangos. Las usan el dibujo de la página, el inspector y el esquema JSON, así los tres hablan de
 * lo mismo.
 */
import { COLOR_PATTERN } from '../util/color';
import type { ThemeTokens } from './themes';

/** Tipos de texto (cada uno con la fuente y el color que le da el tema). */
export const TEXT_ROLES = ['display', 'title', 'label', 'labelStrong', 'heading', 'body', 'number', 'quote'] as const;
export type TextRoleName = (typeof TEXT_ROLES)[number];
// Si el tema suma o quita un tipo de texto, esto deja de compilar hasta actualizar la lista.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _rolesMatchTheme: Same<TextRoleName, keyof ThemeTokens['fonts']> = true;
void _rolesMatchTheme;

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export const TEXT_VALIGNS = ['top', 'middle', 'bottom'] as const;
export const IMAGE_FITS = ['contain', 'cover', 'fill'] as const;

/** Rangos de los valores numéricos (mm o pt según el caso). */
export const PROP_RANGES = {
  textSize: { min: 4, max: 120 },
  opacity: { min: 0.05, max: 1 },
  pitch: { min: 3, max: 12 },
  radius: { min: 0, max: 50 },
  tracking: { min: -0.1, max: 0.5 },
} as const;

/** Un número de un archivo, dentro de su rango (si no es un número, el valor por defecto). */
export function numProp(v: unknown, r: { min: number; max: number }, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : def;
}

/** Un valor de una lista (si no está en la lista, el valor por defecto). */
export function enumProp<T extends string>(v: unknown, values: readonly T[], def: T): T {
  return values.includes(v as T) ? (v as T) : def;
}

type Json = Record<string, unknown>;

const range = (r: { min: number; max: number }, description: string): Json => ({ type: 'number', minimum: r.min, maximum: r.max, description });
const color = (description: string): Json => ({ type: 'string', pattern: COLOR_PATTERN, description });

/** Esquema JSON de las propiedades de un tipo de elemento propio. */
export function customBlockPropsSchema(kind: string): Json {
  const common: Json = { label: { type: 'string', maxLength: 120, description: 'Nombre del elemento (en el editor y en el lector de PDF)' } };
  const pitch = { pitch: range(PROP_RANGES.pitch, 'Paso entre renglones, puntos o cuadros, en mm (por defecto, el del tema)') };
  const byKind: Record<string, Json> = {
    text: {
      text: { type: 'string', description: 'Texto; admite variables como {name}, {year}, {month}, {date} (ver textVariables en el catálogo)' },
      role: { enum: TEXT_ROLES, description: 'Tipo de texto: toma la fuente y el color del tema' },
      size: range(PROP_RANGES.textSize, 'Tamaño en puntos'),
      align: { enum: TEXT_ALIGNS },
      valign: { enum: TEXT_VALIGNS },
      upper: { type: 'boolean', description: 'En mayúsculas' },
      tracking: range(PROP_RANGES.tracking, 'Espaciado entre letras, en em'),
      wrap: { type: 'boolean', description: 'Partir en renglones (por defecto, sí)' },
      color: color('Color propio (por defecto, el de su tipo de texto)'),
      font: {
        type: 'object',
        additionalProperties: false,
        required: ['family'],
        description: 'Fuente propia (por defecto, la de su tipo de texto); ver fonts en el catálogo',
        properties: { family: { type: 'string', maxLength: 80 }, weight: { type: 'number', minimum: 100, maximum: 1000 }, style: { enum: ['normal', 'italic'] } },
      },
    },
    image: {
      assetId: { type: 'string', description: 'id de una imagen de «assets»' },
      fit: { enum: IMAGE_FITS },
      opacity: range(PROP_RANGES.opacity, 'Opacidad'),
    },
    lines: pitch,
    dots: pitch,
    grid: pitch,
    rect: { radius: range(PROP_RANGES.radius, 'Radio de las esquinas, en mm'), fill: color('Relleno (por defecto, ninguno)') },
    line: {},
  };
  return { type: 'object', additionalProperties: false, properties: { ...common, ...(byKind[kind] ?? {}) } };
}
