/**
 * Propiedades de cada tipo de elemento propio (`customBlocks[].props`): nombres, valores posibles y
 * rangos. Las usan el dibujo de la página, el inspector y el esquema JSON, así los tres hablan de
 * lo mismo.
 */
import { COLOR_PATTERN } from '../util/color';
import { BUBBLE_SIDES, LINE_CAPS, SHAPE_RANGES, SHAPES } from '../layout/shapes';
import { PATH_LIMITS } from '../util/pathData';
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

/** Elementos compuestos: se dibujan completos en su caja (tablas, listas, seguimientos, calendarios…). */
export const ELEMENT_KINDS = ['table', 'checklist', 'habits', 'finance', 'minical', 'quadrants', 'notes', 'timeline', 'rating', 'qr'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Estilos del área de escritura de unas notas. */
export const NOTE_STYLES = ['lines', 'dots', 'grid', 'blank'] as const;
export const RATING_FORMS = ['star', 'circle', 'heart', 'square'] as const;
export const CHECK_SHAPES = ['circle', 'square', 'none'] as const;
export const QUADRANT_STYLES = ['blank', 'lines', 'dots'] as const;
/** Corrección de errores de un QR: cuánto del código se puede perder y seguir leyéndose (7, 15, 25 o 30 %). */
export const QR_ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
/** Lo más largo que se acepta escribir en un QR (en el nivel más bajo entran unos 2900 bytes). */
export const QR_MAX_CHARS = 1500;

/** Rangos de los valores numéricos (mm o pt según el caso). */
export const PROP_RANGES = {
  textSize: { min: 4, max: 120 },
  opacity: { min: 0.05, max: 1 },
  pitch: { min: 3, max: 12 },
  radius: { min: 0, max: 50 },
  tracking: { min: -0.1, max: 0.5 },
  // Elementos compuestos.
  tableRows: { min: 1, max: 40 },
  tableCols: { min: 1, max: 12 },
  checkItems: { min: 1, max: 60 },
  checkColumns: { min: 1, max: 3 },
  habitRows: { min: 1, max: 20 },
  habitDays: { min: 7, max: 31 },
  amountLines: { min: 1, max: 30 },
  hourFrom: { min: 0, max: 23 },
  hourTo: { min: 1, max: 24 },
  hourStep: { min: 15, max: 120 },
  ratingCount: { min: 3, max: 10 },
} as const;

/** Cuántos textos y de qué largo admiten las listas de los elementos compuestos (títulos, rótulos, nombres). */
export const LIST_LIMITS = { items: 60, chars: 120 } as const;

/** Una lista de textos de un archivo: solo los textos, recortados y sin pasarse de la cantidad. */
export function stringList(v: unknown, maxItems: number = LIST_LIMITS.items, maxChars: number = LIST_LIMITS.chars): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map((x) => (typeof x === 'string' ? x.slice(0, maxChars) : ''));
}

/** Valores que toma un elemento propio mientras su propiedad no esté escrita (los pasos de renglones y puntos los da el tema). */
export const PROP_DEFAULTS = {
  opacity: 1,
  gridPitch: 5,
  radius: 0,
  tracking: 0,
  // Elementos compuestos.
  tableRows: 5,
  tableCols: 3,
  checkItems: 8,
  habitRows: 7,
  habitDays: 31,
  amountLines: 6,
  hourFrom: 7,
  hourTo: 21,
  hourStep: 60,
  ratingCount: 5,
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
      fit: { type: 'boolean', default: true, description: 'Achicar la letra hasta que entre en el recuadro (por defecto, sí). Con false se dibuja al tamaño pedido y, si no entra, la revisión avisa' },
      autoHeight: { type: 'boolean', description: 'El alto sigue al texto: crece y se achica con los renglones, arriba fijo (por defecto, no; «h» no se usa)' },
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
      assetId: { type: 'string', description: 'id de una imagen de «assets», o «icon:<id>» para un ícono de la biblioteca (ver icons en el catálogo) sin declararlo' },
      fit: { enum: IMAGE_FITS },
      opacity: range(PROP_RANGES.opacity, 'Opacidad'),
      color: color('Tiñe un dibujo vectorial (un ícono, un SVG) de este color; las fotos no cambian'),
    },
    shape: {
      shape: { enum: SHAPES, default: 'rect', description: 'Forma; cada una usa solo sus propios parámetros (ver shapes en el catálogo)' },
      fill: color('Relleno (por defecto, ninguno; las líneas y los arcos abiertos no se rellenan)'),
      strokeColor: color('Color del trazo (por defecto, la tinta del tema)'),
      strokePt: range(SHAPE_RANGES.strokePt, 'Grosor del trazo en puntos (0: sin trazo); va por dentro de la caja'),
      dash: { enum: ['solid', 'dashed', 'dotted'], default: 'solid', description: 'Trazo lleno, con guiones o de puntos' },
      opacity: range(PROP_RANGES.opacity, 'Opacidad'),
      radius: range(SHAPE_RANGES.radius, 'rect y bubble: radio de las esquinas, en mm'),
      angle: range(SHAPE_RANGES.angle, 'line: ángulo en grados (0 horizontal, 90 vertical); la línea pasa por el centro de la caja'),
      startCap: { enum: LINE_CAPS, description: 'line: punta del comienzo' },
      endCap: { enum: LINE_CAPS, description: 'line: punta del final' },
      head: range(SHAPE_RANGES.head, 'arrow: largo de la punta, en % del ancho'),
      shaft: range(SHAPE_RANGES.shaft, 'arrow: grosor del cuerpo, en % del alto'),
      apex: range(SHAPE_RANGES.apex, 'triangle: dónde está el vértice de arriba, en % del ancho (50 isósceles, 0 rectángulo)'),
      sides: { type: 'integer', minimum: SHAPE_RANGES.sides.min, maximum: SHAPE_RANGES.sides.max, description: 'polygon: cantidad de lados' },
      points: { type: 'integer', minimum: SHAPE_RANGES.points.min, maximum: SHAPE_RANGES.points.max, description: 'star: cantidad de puntas' },
      inner: range(SHAPE_RANGES.inner, 'star: radio interior, en % del exterior'),
      rotation: range(SHAPE_RANGES.rotation, 'polygon y star: giro en grados'),
      cornerRadius: range(SHAPE_RANGES.cornerRadius, 'polygon y star: redondeo de las esquinas, en mm'),
      thickness: range(SHAPE_RANGES.thickness, 'ring: grosor del aro, en % del radio'),
      start: range(SHAPE_RANGES.start, 'arc: comienzo en grados (0 arriba, en el sentido del reloj)'),
      sweep: range(SHAPE_RANGES.sweep, 'arc: cuántos grados abarca'),
      pie: { type: 'boolean', description: 'arc: sector cerrado (una porción de torta) en lugar de un arco abierto' },
      tailSide: { enum: BUBBLE_SIDES, description: 'bubble: lado de la cola' },
      tailAt: range(SHAPE_RANGES.tailAt, 'bubble: dónde va la cola a lo largo de su lado, en %'),
      notch: range(SHAPE_RANGES.notch, 'banner: hondura de las muescas de las puntas, en % de medio alto'),
      arm: range(SHAPE_RANGES.arm, 'cross: grosor de los brazos, en %'),
      d: { type: 'string', maxLength: PATH_LIMITS.chars, description: 'path: trazado SVG (M, L, H, V, C, S, Q, T, A, Z) dibujado en una caja de 0 a 100 que se estira a la del elemento' },
    },
    lines: pitch,
    dots: pitch,
    grid: pitch,
    rect: { radius: range(PROP_RANGES.radius, 'Radio de las esquinas, en mm'), fill: color('Relleno (por defecto, ninguno)') },
    line: {},
    table: {
      rows: { type: 'integer', minimum: PROP_RANGES.tableRows.min, maximum: PROP_RANGES.tableRows.max, default: PROP_DEFAULTS.tableRows, description: 'Filas (sin contar la de títulos)' },
      cols: { type: 'integer', minimum: PROP_RANGES.tableCols.min, maximum: PROP_RANGES.tableCols.max, default: PROP_DEFAULTS.tableCols, description: 'Columnas' },
      header: { type: 'boolean', default: true, description: 'Fila de títulos sombreada arriba' },
      headers: { type: 'array', maxItems: PROP_RANGES.tableCols.max, items: { type: 'string', maxLength: LIST_LIMITS.chars }, description: 'Títulos de las columnas, de izquierda a derecha' },
    },
    checklist: {
      items: { type: 'integer', minimum: PROP_RANGES.checkItems.min, maximum: PROP_RANGES.checkItems.max, default: PROP_DEFAULTS.checkItems, description: 'Cantidad de renglones' },
      columns: { type: 'integer', minimum: PROP_RANGES.checkColumns.min, maximum: PROP_RANGES.checkColumns.max, default: 1, description: 'Columnas de la lista' },
      shape: { enum: CHECK_SHAPES, default: 'circle', description: 'Casilla de cada renglón' },
      labels: { type: 'array', maxItems: LIST_LIMITS.items, items: { type: 'string', maxLength: LIST_LIMITS.chars }, description: 'Texto ya escrito en los primeros renglones' },
    },
    habits: {
      rows: { type: 'integer', minimum: PROP_RANGES.habitRows.min, maximum: PROP_RANGES.habitRows.max, default: PROP_DEFAULTS.habitRows, description: 'Hábitos (filas)' },
      days: { type: 'integer', minimum: PROP_RANGES.habitDays.min, maximum: PROP_RANGES.habitDays.max, default: PROP_DEFAULTS.habitDays, description: 'Días (columnas)' },
      names: { type: 'array', maxItems: PROP_RANGES.habitRows.max, items: { type: 'string', maxLength: LIST_LIMITS.chars }, description: 'Nombre de cada hábito' },
    },
    finance: {
      lines: { type: 'integer', minimum: PROP_RANGES.amountLines.min, maximum: PROP_RANGES.amountLines.max, default: PROP_DEFAULTS.amountLines, description: 'Renglones de importes' },
      total: { type: 'boolean', default: true, description: 'Renglón de total al pie' },
      title: { type: 'string', maxLength: LIST_LIMITS.chars, description: 'Título sobre los renglones (por defecto, ninguno)' },
    },
    minical: {
      month: { type: 'string', pattern: '^(auto|\\d{4}-(0[1-9]|1[0-2]))$', default: 'auto', description: '«auto»: el mes de la página (o el primero de la agenda); o «AAAA-MM»' },
      title: { type: 'boolean', default: true, description: 'Nombre del mes sobre los días' },
    },
    quadrants: {
      titles: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: LIST_LIMITS.chars }, description: 'Título de cada cuadrante: arriba a la izquierda, arriba a la derecha, abajo a la izquierda, abajo a la derecha' },
      style: { enum: QUADRANT_STYLES, default: 'blank', description: 'Qué lleva cada cuadrante para escribir' },
    },
    notes: {
      title: { type: 'string', maxLength: LIST_LIMITS.chars, description: 'Título sobre el área de escritura' },
      style: { enum: NOTE_STYLES, description: 'Área de escritura (por defecto, la del tema)' },
      frame: { type: 'boolean', default: false, description: 'Marco alrededor' },
    },
    timeline: {
      from: { type: 'integer', minimum: PROP_RANGES.hourFrom.min, maximum: PROP_RANGES.hourFrom.max, default: PROP_DEFAULTS.hourFrom, description: 'Primera hora' },
      to: { type: 'integer', minimum: PROP_RANGES.hourTo.min, maximum: PROP_RANGES.hourTo.max, default: PROP_DEFAULTS.hourTo, description: 'Hora en que termina (mayor que la primera)' },
      step: { type: 'integer', minimum: PROP_RANGES.hourStep.min, maximum: PROP_RANGES.hourStep.max, default: PROP_DEFAULTS.hourStep, description: 'Minutos entre renglones' },
    },
    rating: {
      count: { type: 'integer', minimum: PROP_RANGES.ratingCount.min, maximum: PROP_RANGES.ratingCount.max, default: PROP_DEFAULTS.ratingCount, description: 'Cantidad de figuras' },
      shape: { enum: RATING_FORMS, default: 'star' },
      text: { type: 'string', maxLength: LIST_LIMITS.chars, description: 'Rótulo a la izquierda (por defecto, ninguno)' },
    },
    qr: {
      text: { type: 'string', maxLength: QR_MAX_CHARS, description: 'Lo que guarda el código: una dirección web (https://…), un correo (mailto:…), un teléfono (tel:…) o cualquier texto' },
      ecc: { enum: QR_ECC_LEVELS, default: 'M', description: 'Corrección de errores: L 7 %, M 15 %, Q 25 %, H 30 % (más corrección, más módulos y más chicos)' },
      color: color('Color de los módulos (por defecto, el de la tinta del tema); que contraste con el papel'),
      link: { type: 'boolean', default: true, description: 'Si el texto es una dirección web, de correo o de teléfono, tocar el código en el PDF la abre' },
    },
    drawing: {
      w0: { type: 'number', minimum: 0.1, maximum: 2000, description: 'Ancho del dibujo al copiarlo, en mm' },
      h0: { type: 'number', minimum: 0.1, maximum: 2000, description: 'Alto del dibujo al copiarlo, en mm' },
      mode: { enum: ['stretch', 'scale'], default: 'stretch', description: 'Al cambiar de tamaño: «stretch» estira líneas y recuadros sin cambiar su grosor; «scale» lo escala entero' },
      prims: { type: 'array', maxItems: 2000, description: 'Primitivas ya dibujadas. Solo se crea copiando un elemento de la agenda: no se escribe a mano', items: { type: 'object', required: ['t'], properties: { t: { enum: ['line', 'rect', 'circle', 'path', 'dots', 'image', 'group'] } } } },
      opacity: range(PROP_RANGES.opacity, 'Opacidad'),
    },
  };
  // Todos los elementos compuestos pueden llevar fondo blanco.
  if ((ELEMENT_KINDS as readonly string[]).includes(kind)) common.paper = { type: 'boolean', default: false, description: 'Fondo blanco que tapa lo que la página tenga debajo (puntos, renglones, cuadrícula)' };
  return { type: 'object', additionalProperties: false, properties: { ...common, ...(byKind[kind] ?? {}) } };
}
