/**
 * Esquema del diseño (`.agenda.json`). Es el contrato estable del programa:
 * todo lo que se ve e imprime sale de aquí. Cada campo tiene valor por defecto,
 * así un archivo viejo o incompleto siempre se completa y valida.
 */
import { z } from 'zod';
import { RELATIVE_PATH_MAX, RELATIVE_PATH_PATTERN } from '../util/relpath';
import { COLOR_PATTERN, normalizeColor } from '../util/color';
import { LINE_PATTERNS, LINE_USES, pruneTokens } from './themes';
import { BLEND_MODES } from './blend';
import { ELEMENT_KINDS } from './customBlocks';

// Sin compilación a medida: zod decide si compilar sus validadores probando `new Function`, y la
// política de seguridad de la aplicación prohíbe evaluar texto como código, así que el navegador
// registraba una violación en cada arranque. Tiene que fijarse antes del primer `z.object`.
z.config({ jitless: true });

import { migrateDesignInput, SCHEMA_VERSION } from './migrations';

export { SCHEMA_VERSION };

export const HolidayTypeZ = z.enum(['public', 'bank', 'school', 'optional', 'observance']);

export const PAPER_PRESETS = {
  A4: { w: 210, h: 297, label: 'A4 (210 × 297 mm) → páginas A5' },
  LETTER: { w: 215.9, h: 279.4, label: 'Carta / Letter (216 × 279 mm)' },
  LEGAL: { w: 215.9, h: 355.6, label: 'Legal / Oficio (216 × 356 mm) — máximo de la HP 4350' },
  OFICIO_340: { w: 216, h: 340, label: 'Oficio 216 × 340 mm' },
  FOLIO: { w: 215.9, h: 330.2, label: 'Folio 8½ × 13" (216 × 330 mm)' },
  A3: { w: 297, h: 420, label: 'A3 (297 × 420 mm) → páginas A4' },
  A5: { w: 148, h: 210, label: 'A5 (148 × 210 mm) → páginas A6' },
  // Pantallas de tabletas y lectores (para leer en pantalla, una página por hoja): el área visible en mm.
  TABLET_7_8: { w: 118.9, h: 158.5, label: 'Lector de tinta 7,8" (Boox Nova/Tab Mini, Kobo Sage) 119 × 159 mm' },
  TABLET_10_3: { w: 157.8, h: 210.4, label: 'Tableta de tinta 10,3" (reMarkable 2, Boox Note Air, Supernote A5X, Kindle Scribe) 158 × 210 mm' },
  TABLET_13_3: { w: 202.7, h: 270.3, label: 'Tableta de tinta 13,3" (Boox Tab X, Supernote A4X) 203 × 270 mm' },
  IPAD_11: { w: 160.5, h: 229.8, label: 'iPad 11" 161 × 230 mm' },
  IPAD_13: { w: 198.6, h: 264.8, label: 'iPad 13" 199 × 265 mm' },
  CUSTOM: { w: 210, h: 297, label: 'Personalizado' },
} as const;
export type PaperPresetId = keyof typeof PAPER_PRESETS;
/** Los tamaños de pantalla: una página por hoja, para leer en una tableta. */
export const SCREEN_PRESETS: readonly PaperPresetId[] = ['TABLET_7_8', 'TABLET_10_3', 'TABLET_13_3', 'IPAD_11', 'IPAD_13'];
export const PaperPresetZ = z.enum(Object.keys(PAPER_PRESETS) as [PaperPresetId, ...PaperPresetId[]]);

/**
 * Números tolerantes: un valor fuera de rango (un archivo editado a mano, un dato viejo) se
 * acomoda al rango en lugar de invalidar toda la agenda, y los enteros se redondean
 * (un «4,5» tipeado en «hojas por cuadernillo» no deja la agenda sin poder abrirse).
 */
const clampTo = (min: number, max: number) => (v: number): number => Math.min(max, Math.max(min, v));
// El rango va también como metadato: así el esquema JSON lo muestra y la revisión avisa qué se acomoda.
const num = (def: number, min = -10_000, max = 10_000) => z.number().meta({ minimum: min, maximum: max }).transform(clampTo(min, max)).default(def);
const intIn = (min: number, max: number) => z.number().meta({ minimum: min, maximum: max, multipleOf: 1 }).transform((v) => clampTo(min, max)(Math.round(v)));

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export const CalendarZ = z
  .object({
    year: intIn(1900, 2200).default(new Date().getFullYear() + 1),
    startMonth: intIn(1, 12).default(1),
    monthCount: intIn(1, 24).default(12),
    /**
     * Meses que no entran en la agenda (`2027-03`): no tienen páginas, ni pestañas, ni enlaces. El
     * calendario anual los sigue mostrando, porque es del año y no de la agenda. Para sacar el primero
     * o el último mes de la agenda conviene cambiar `startMonth` o `monthCount`.
     */
    hiddenMonths: z
      .array(z.string().meta({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Mes, como 2027-03' }))
      .max(48)
      .default([])
      // Un valor que no es un mes se descarta (un archivo ajeno no impide abrir la agenda).
      .transform((l) => [...new Set(l.filter((k) => MONTH_KEY.test(k)))].sort()),
    weekStart: z.enum(['auto', 'monday', 'sunday', 'saturday']).default('monday'),
    weekend: z.union([z.literal('auto'), z.array(intIn(1, 7))]).default('auto'),
    numbering: z.enum(['iso', 'simple', 'none']).default('iso'),
    /** Orden de día, mes y año al mostrar fechas: auto sigue al país (las fechas se guardan en ISO). */
    dateFormat: z.enum(['auto', 'dmy', 'mdy', 'ymd']).default('auto'),
    timeZone: z.string().default('auto'),
  })
  .prefault({});

export const HolidaysZ = z
  .object({
    country: z.string().nullable().default('AR'),
    subdivision: z.string().nullable().default(null),
    types: z.array(HolidayTypeZ).default(['public', 'bank']),
    language: z.string().default('auto'),
    added: z.array(z.object({ date: z.string(), name: z.string(), type: HolidayTypeZ.default('public') })).default([]),
    removed: z.array(z.string()).default([]),
    renamed: z.record(z.string(), z.string()).default({}),
  })
  .prefault({});

export const PersonalDateZ = z.object({
  id: z.string(),
  month: intIn(1, 12),
  day: intIn(1, 31),
  year: intIn(1, 9999).nullable().optional(),
  label: z.string(),
  kind: z.enum(['birthday', 'anniversary', 'reminder', 'other']).default('birthday'),
});

export const AstronomyZ = z
  .object({
    moonPhases: z.boolean().default(true),
    hemisphere: z.enum(['auto', 'north', 'south']).default('auto'),
    showIn: z.array(z.enum(['monthLog', 'week', 'yearOverview', 'monthGrid', 'daily'])).default(['monthLog', 'week', 'monthGrid', 'daily']),
  })
  .prefault({});

export const PaperZ = z
  .object({
    preset: PaperPresetZ.default('A4'),
    width: num(210, 50, 1000),
    height: num(297, 50, 1500),
  })
  .prefault({});

export const BindingZ = z
  .object({
    /**
     * Para qué se hace la agenda. `print`: se imprime y se encuaderna (costura, recortes, marcas, relleno
     * de cuadernillos). `screen`: se lee en pantalla (tableta, lector): las mismas páginas sin nada de eso.
     */
    target: z.enum(['print', 'screen']).default('print'),
    method: z.enum(['sewn', 'saddle', 'cut-stack', 'single']).default('sewn'),
    signature: z
      .object({
        mode: z.enum(['uniform', 'balanced', 'custom']).default('uniform'),
        sheets: intIn(1, 32).default(4),
        custom: z.array(intIn(1, 32)).default([]),
        last: z.enum(['shrink', 'pad']).default('shrink'),
      })
      .prefault({}),
    fillWith: z.enum(['dots', 'lines', 'grid', 'blank']).default('dots'),
    gutter: num(2, 0, 40),
    creep: z
      .object({
        mode: z.enum(['off', 'caliper', 'measured']).default('off'),
        caliper: num(0.1, 0.02, 1),
        measured: num(0, 0, 20),
      })
      .prefault({}),
    duplex: z.enum(['short-edge', 'long-edge', 'manual']).default('short-edge'),
    manualReverseBacks: z.boolean().default(false),
    manualRotateBacks: z.boolean().default(false),
    sewing: z
      .object({
        stations: intIn(2, 16).default(6),
        pairs: z.boolean().default(true),
        endInset: num(12, 4, 40),
        pairGap: num(10, 3, 30),
      })
      .prefault({}),
    backOffset: z.object({ x: num(0, -20, 20), y: num(0, -20, 20) }).prefault({}),
    marks: z
      .object({
        fold: z.boolean().default(true),
        crop: z.boolean().default(false),
        collation: z.boolean().default(true),
        signatureLabel: z.boolean().default(true),
      })
      .prefault({}),
    trim: z.object({ top: num(0, 0, 30), bottom: num(0, 0, 30), outer: num(0, 0, 30) }).prefault({}),
    nonPrintable: num(4.2, 0, 20),
    pageNumbers: z
      .object({
        enabled: z.boolean().default(false),
        position: z.enum(['outer', 'center']).default('outer'),
        skipFirst: intIn(0, 50).default(2),
      })
      .prefault({}),
    thumbIndex: z
      .object({
        enabled: z.boolean().default(false),
        width: num(4, 2, 12),
        /** current: solo la pestaña del mes de cada página; all: todos los meses, con el de la página resaltado. */
        months: z.enum(['current', 'all']).default('current'),
      })
      .prefault({}),
  })
  .prefault({});

export const ThemeRefZ = z
  .object({
    id: z.string().default('heritage'),
    comfort: z.enum(['compact', 'normal', 'wide']).default('normal'),
    // Solo se guardan ajustes válidos (ver `pruneTokens`).
    tokens: z.record(z.string(), z.unknown()).default({}).transform((t) => pruneTokens(t)),
  })
  .prefault({});

export const PersonaZ = z
  .object({
    name: z.string().default(''),
    title: z.string().default(''),
    subtitle: z.string().default(''),
    dedicationTitle: z.string().default(''),
    dedication: z.string().default(''),
    /** 12 frases (una por mes); vacías = frases por defecto del idioma. */
    phrases: z.array(z.string()).default([]),
    labels: z.record(z.string(), z.string()).default({}),
  })
  .prefault({});

export const CustomMethodZ = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string().default(''),
  evidence: z.enum(['strong', 'moderate', 'limited', 'practice', 'contested']).default('practice'),
  evidenceText: z.string().default(''),
  references: z.array(z.string()).default([]),
});
export type CustomMethod = z.infer<typeof CustomMethodZ>;

export const MethodsZ = z
  .object({
    enabled: z.array(z.string()).default([]),
    custom: z.array(CustomMethodZ).default([]),
    guide: z
      .object({
        evidence: z.boolean().default(true),
        references: z.boolean().default(true),
        /** Créditos del autor del programa (con un QR al código fuente) antes de las referencias. */
        credits: z.boolean().catch(true).default(true),
      })
      .prefault({}),
  })
  .prefault({});

export const SectionItemZ = z.object({
  id: z.string(),
  type: z.string(),
  enabled: z.boolean().default(true),
  options: z.record(z.string(), z.unknown()).default({}),
  /**
   * Solo dentro de «Meses»: cada cuánto se repite. `week` pone una copia después de cada semana
   * y `day` una por día (después de la página de ese día o de su semana).
   */
  repeat: z.enum(['month', 'week', 'day']).default('month'),
});
export type SectionItem = z.infer<typeof SectionItemZ>;

export const SectionZ = SectionItemZ.extend({
  /** Solo para `type: 'months'`: lo que se repite cada mes, en orden. */
  items: z.array(SectionItemZ).optional(),
});
export type SectionSpec = z.infer<typeof SectionZ>;

export const CustomPageZ = z.object({
  id: z.string(),
  /** Se inserta después de la página con esta clave semántica (o al inicio si es null). */
  after: z.string().nullable().default(null),
  /** Respaldo si la página ancla desaparece (sección o mes). */
  fallback: z.string().nullable().default(null),
  startOn: z.enum(['any', 'recto', 'verso']).default('any'),
  title: z.string().default(''),
  content: z
    .object({
      kind: z.enum(['artwork', 'template', 'text']).default('artwork'),
      assetId: z.string().nullable().default(null),
      pdfPage: intIn(1, 100_000).default(1),
      fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
      area: z.enum(['page', 'content']).default('content'),
      background: z.enum(['blank', 'dots', 'lines', 'grid']).default('blank'),
      text: z.string().default(''),
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
      opacity: num(1, 0, 1),
    })
    .prefault({}),
});
export type CustomPage = z.infer<typeof CustomPageZ>;

/**
 * Plantilla de página: una página diseñada una vez (fondo, texto o imagen, y sus elementos
 * propios) que se agrega como sección y puede repetirse cada mes, semana o día. Todas sus copias
 * son del tipo de página `tpl:<id>`, así los elementos y ajustes «por tipo» valen para todas.
 */
export const PageTemplateZ = z.object({
  id: z.string(),
  title: z.string().default(''),
  /** Mostrar el título arriba de la página (con fecha si la copia tiene una). */
  showTitle: z.boolean().default(true),
  content: CustomPageZ.shape.content,
});
export type PageTemplate = z.infer<typeof PageTemplateZ>;

/**
 * Posición y tamaño de un elemento propio, en mm: un valor fuera de rango se acomoda (un archivo
 * con un recuadro de un kilómetro no puede trabar la vista previa con millones de renglones).
 */
export const BLOCK_BOUNDS = { pos: { min: -1000, max: 1000 }, size: { min: 0.5, max: 1000 } } as const;

export const CustomBlockZ = z.object({
  id: z.string(),
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  kind: z.enum(['text', 'image', 'lines', 'dots', 'grid', 'rect', 'line', 'drawing', 'shape', ...ELEMENT_KINDS]),
  x: z.number().transform(clampTo(BLOCK_BOUNDS.pos.min, BLOCK_BOUNDS.pos.max)),
  y: z.number().transform(clampTo(BLOCK_BOUNDS.pos.min, BLOCK_BOUNDS.pos.max)),
  w: z.number().transform(clampTo(BLOCK_BOUNDS.size.min, BLOCK_BOUNDS.size.max)),
  h: z.number().transform(clampTo(BLOCK_BOUNDS.size.min, BLOCK_BOUNDS.size.max)),
  /** Espejar la posición horizontal en las páginas pares (izquierdas). */
  mirror: z.boolean().default(true),
  props: z.record(z.string(), z.unknown()).default({}),
});
export type CustomBlock = z.infer<typeof CustomBlockZ>;

export const WatermarkZ = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  assetId: z.string(),
  scope: z.array(z.string()).default(['all']),
  exclude: z.array(z.string()).default([]),
  /** Páginas puntuales (clave semántica) donde no va, aunque su tipo sí la lleve. */
  excludePages: z.array(z.string()).default([]),
  hAnchor: z.enum(['outer', 'inner', 'left', 'right', 'center']).default('outer'),
  vAnchor: z.enum(['top', 'middle', 'bottom']).default('bottom'),
  dx: num(13),
  dy: num(13),
  width: num(12, 1, 1000),
  opacity: num(1, 0, 1),
  rotation: num(0, -360, 360),
  /**
   * Espejar el dibujo en las páginas izquierdas (con anclaje exterior o interior). La posición se espeja
   * sola con ese anclaje; esto da vuelta además la imagen (un logo con letras quedaría al revés).
   */
  mirrorOnVerso: z.boolean().default(true),
  layer: z.enum(['above', 'below']).default('above'),
  /** Grosor mínimo de trazo en puntos para que el dibujo vectorial no desaparezca al imprimir. */
  minStrokePt: num(0.3, 0, 5),
  /** En qué páginas va: todas, solo las derechas (recto) o solo las izquierdas (verso). */
  side: z.enum(['both', 'recto', 'verso']).catch('both').default('both'),
  /** Cómo se funde con lo de abajo («multiply» hace desaparecer el fondo blanco de un logo). */
  blend: z.enum(BLEND_MODES).catch('normal').default('normal'),
  /** En escala de grises (los dibujos vectoriales; una imagen se convierte con una copia en grises). */
  /** En grises: vale para dibujos vectoriales; una foto se pasa a grises con una copia (ver el panel de la marca de agua). */
  grayscale: z.boolean().catch(false).default(false),
  /** Tiñe un dibujo vectorial (un ícono, un logo SVG) de este color; manda sobre `grayscale`. */
  color: z.string().regex(new RegExp(COLOR_PATTERN)).optional().catch(undefined),
});
export type WatermarkPlacement = z.infer<typeof WatermarkZ>;

export const BlockOverrideZ = z.object({
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  blockId: z.string(),
  dx: num(0),
  dy: num(0),
  /**
   * Cambio del ancho y del alto del elemento respecto de su caja (mm). El contenido se vuelve a
   * acomodar en la caja nueva: el texto reparte sus renglones, las áreas de escritura suman o quitan
   * renglones, las tablas crecen con lo que llevan. En un ajuste «por tipo», una página izquierda lo
   * muestra espejado (el elemento crece hacia afuera igual que en la derecha).
   */
  dw: num(0, -1000, 1000),
  dh: num(0, -1000, 1000),
  scale: num(1, 0.05, 20),
  /**
   * Escala vertical cuando es distinta de la horizontal (`scale`): deforma el elemento. Sin valor, la
   * misma que `scale` (se escala sin deformar).
   */
  scaleY: z.number().meta({ minimum: 0.05, maximum: 20 }).transform(clampTo(0.05, 20)).nullable().default(null),
  /**
   * Permitir deformar: los tiradores estiran el dibujo (escala distinta en cada eje) en lugar de
   * reacomodar su contenido en la caja nueva.
   */
  deform: z.boolean().default(false),
  rotation: num(0, -360, 360),
  opacity: num(1, 0, 1),
  hidden: z.boolean().default(false),
  /** Orden de apilado propio (mayor, más arriba), en lugar del que le da la sección; sin valor, el de siempre. */
  layer: z.number().meta({ minimum: -1000, maximum: 1000 }).transform(clampTo(-1000, 1000)).nullable().default(null),
  /** Nombre propio del elemento (en el panel de capas y en las avisos); sin valor, el de la sección. */
  label: z.string().transform((v) => v.slice(0, 120)).nullable().default(null),
  /** Cómo se fusiona con lo que tiene debajo. */
  blend: z.enum(BLEND_MODES).catch('normal').default('normal'),
  /** Bloqueado por la persona: se ve y se elige, pero no se mueve, no cambia de tamaño ni se borra. */
  locked: z.boolean().catch(false).default(false),
});
export type BlockOverride = z.infer<typeof BlockOverrideZ>;

/** Valores por defecto de un ajuste de elemento y de una marca de agua: a ellos vuelve un «restablecer». */
export const OVERRIDE_DEFAULTS: BlockOverride = BlockOverrideZ.parse({ pageType: '', blockId: '' });
export const WATERMARK_DEFAULTS: WatermarkPlacement = WatermarkZ.parse({ id: '', assetId: '' });

/** Un color escrito de cualquier forma válida; uno que no lo es se descarta (el campo queda sin valor). */
const colorProp = z.string().transform((v) => normalizeColor(v) ?? undefined);

/** Para qué trazos vale un estilo de línea de un elemento: los cuatro usos del tema y los que no tienen uso (`other`). */
export const BLOCK_LINE_KEYS = [...LINE_USES, 'other'] as const;
export type BlockLineKey = (typeof BLOCK_LINE_KEYS)[number];

export const BlockLineStyleZ = z.object({
  /** Dibujo de la línea (lisa, guiones, puntos, doble, guarda, separador con ornamento). No vale para `other`. */
  pattern: z.enum(LINE_PATTERNS).optional(),
  color: colorProp.optional(),
  /** Grosor en puntos tipográficos. */
  widthPt: z.number().meta({ minimum: 0.1, maximum: 6 }).transform(clampTo(0.1, 6)).optional(),
  /** Ornamento de las guardas y los separadores: `builtin:<id>` o `asset:<id>`. */
  ornament: z.string().max(80).optional(),
  /** Alto del ornamento en mm. */
  size: z.number().meta({ minimum: 1, maximum: 30 }).transform(clampTo(1, 30)).optional(),
});
export type BlockLineStyle = z.infer<typeof BlockLineStyleZ>;

/**
 * Estilo propio de un elemento del programa (líneas, relleno, color del texto), por tipo de página
 * o en una página. A diferencia de los ajustes de lugar y tamaño (`overrides`), el estilo del tipo
 * y el de la página se suman campo por campo: no tiene geometría que haya que elegir.
 */
export const BlockStyleZ = z.object({
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  blockId: z.string(),
  lines: z.partialRecord(z.enum(BLOCK_LINE_KEYS), BlockLineStyleZ).default({}),
  /** Relleno de los recuadros del elemento (`null`: sin relleno). */
  fill: z.object({ color: colorProp.nullable() }).optional(),
  /** Color del texto: uno para todo, y por tipo de texto (que gana sobre el general). */
  text: z.object({ color: colorProp.optional(), roles: z.record(z.string(), colorProp).default({}) }).optional(),
});
export type BlockStyle = z.infer<typeof BlockStyleZ>;

/**
 * Estilo de escritura (renglones, puntos, cuadrícula, pasos, tamaño de punto, grosor) para un
 * tipo de página o una página puntual. Los valores son ajustes del tema, validados.
 */
export const PageStyleZ = z.object({
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  tokens: z.record(z.string(), z.unknown()).default({}).transform((t) => pruneTokens(t)),
});
export type PageStyle = z.infer<typeof PageStyleZ>;

/**
 * Enlace elegido a mano para un elemento (por tipo de página o en una página): reemplaza a los
 * automáticos de ese elemento. `none` le quita los enlaces; `page` lleva a una página por su clave
 * (sigue funcionando aunque cambie la numeración) y `url` a una dirección web. `auto`, en una
 * página, vuelve a los automáticos aunque su tipo diga otra cosa.
 */
export const BlockLinkZ = z.object({
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  blockId: z.string(),
  mode: z.enum(['auto', 'none', 'page', 'url']),
  /**
   * Zona del elemento a la que vale (ver `areaKey`): un día, un mes… Vacía, vale para el elemento
   * entero, salvo las zonas que tengan su propia entrada.
   */
  area: z.string().default('').transform((v) => v.slice(0, 200)),
  page: z.string().default(''),
  // Recortada (no rechazada): una dirección larguísima no puede dejar la agenda sin abrir.
  url: z.string().default('').transform((v) => v.slice(0, 2000)),
});
export type BlockLink = z.infer<typeof BlockLinkZ>;

/**
 * Enlaces del PDF de páginas (para leer la agenda en una tableta o un lector de tinta electrónica):
 * se generan solos a partir de lo que ya está impreso, por familias.
 */
export const LinksZ = z
  .object({
    enabled: z.boolean().default(true),
    /** Cada número de día lleva a su página. */
    days: z.boolean().default(true),
    /** auto: la página más detallada que tenga ese día (día, semana, mes); o siempre la semana o el mes. */
    dayTarget: z.enum(['auto', 'week', 'month']).default('auto'),
    /** El nombre de cada mes (calendario anual) lleva a ese mes. */
    months: z.boolean().default(true),
    monthTarget: z.enum(['first', 'log', 'grid']).default('first'),
    /** Los títulos llevan un nivel arriba: día → mes, semana → mes, mes → calendario anual, el resto → índice. */
    up: z.boolean().default(true),
    /** Cada entrada del índice lleva a su página. */
    toc: z.boolean().default(true),
    /** Adónde lleva el número de página (si se imprimen). */
    pageNumber: z.enum(['none', 'toc', 'year', 'month']).default('toc'),
    /** Marcadores del lector (índice lateral) por secciones, meses y semanas. */
    bookmarks: z.boolean().default(true),
    blocks: z.array(BlockLinkZ).default([]),
  })
  .prefault({});

/**
 * Ruta de un recurso integrado, relativa a la carpeta pública («watermarks/colibri.svg»): tramos de
 * letras, números y guiones, con extensión; sin «..», barra inicial, barra invertida ni esquema. Un
 * archivo manipulado no puede hacer leer otro archivo del disco (CLI, servidor MCP) ni otro sitio.
 */
export const BUILTIN_PATH = /^(?:[\w-]+\/)*[\w-]+(?:\.[\w-]+)+$/;

export const AssetRefZ = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['raster', 'vector', 'pdf', 'font']),
  mime: z.string(),
  /** Píxeles (raster) o mm (vector/pdf). */
  width: z.number().default(0),
  height: z.number().default(0),
  /** Recurso integrado servido desde /public (p. ej. «watermarks/colibri.svg»). */
  builtin: z.string().regex(BUILTIN_PATH).nullable().catch(null).default(null),
  /** Contenido en base64 cuando el diseño se exporta como archivo autocontenido. */
  data: z.string().nullable().optional(),
  /**
   * Archivo junto a la agenda, relativo a la carpeta del `.agenda.json` (p. ej. «imagenes/logo.png»):
   * vale cuando no hay `data`. Lo leen la línea de comandos, el servidor MCP y la aplicación de
   * escritorio al abrir el archivo; nunca fuera de esa carpeta.
   */
  path: z.string().max(RELATIVE_PATH_MAX).regex(new RegExp(RELATIVE_PATH_PATTERN, 'u')).nullable().optional().catch(null),
  pages: intIn(0, 100_000).optional(),
});
export type AssetRef = z.infer<typeof AssetRefZ>;

/**
 * Tema propio: el estilo completo de una agenda (tema base, comodidad y todos los ajustes: letras,
 * colores, líneas, ornamentos) guardado con un nombre para usarlo en otras agendas. Las imágenes
 * que usa (ornamentos propios) van como referencias; en el archivo exportado, con sus datos.
 */
export const UserThemeZ = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  description: z.string().max(400).default(''),
  createdAt: z.string().default(() => new Date().toISOString()),
  base: z.string().default('heritage'),
  comfort: z.enum(['compact', 'normal', 'wide']).default('normal'),
  tokens: z.record(z.string(), z.unknown()).default({}).transform((t) => pruneTokens(t)),
  assets: z.array(AssetRefZ).default([]),
});
export type UserTheme = z.infer<typeof UserThemeZ>;

export const CoverZ = z
  .object({
    enabled: z.boolean().default(true),
    style: z.enum(['board', 'wrap', 'plain']).default('board'),
    imageAssetId: z.string().nullable().default(null),
    boardOverhang: num(3, 0, 20),
    turnIn: num(15, 0, 40),
    bleed: num(3, 0, 10),
    spine: z.union([z.literal('auto'), z.number().min(0).max(100)]).default('auto'),
    showYear: z.boolean().default(true),
    showName: z.boolean().default(true),
    showTitle: z.boolean().default(true),
  })
  .prefault({});

/** Hasta cuánto base64 puede tener una fuente incrustada (unos 22 MB de archivo). */
export const USER_FONT_MAX_CHARS = 30_000_000;
/** Fuentes incrustadas en un archivo, como mucho. */
export const USER_FONTS_MAX = 40;

/**
 * Una fuente subida que viaja dentro del archivo, en base64. La aplicación la escribe al guardar (solo
 * las familias que la agenda usa) y la adopta al abrir; el servidor MCP y la línea de comandos la usan
 * al dibujar, igual que la aplicación. Se usa por su familia, peso y estilo, como cualquier otra.
 */
export const UserFontZ = z.object({
  id: z.string().min(1).max(100),
  spec: z.object({
    family: z.string().trim().min(1).max(80),
    weight: z.number().int().min(1).max(1000).default(400),
    style: z.enum(['normal', 'italic']).default('normal'),
  }),
  data: z.string().min(4).max(USER_FONT_MAX_CHARS).regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64'),
});
export type UserFont = z.infer<typeof UserFontZ>;

export const DesignZ = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().default('design'),
  name: z.string().default('Mi agenda'),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
  /** Versión de la aplicación que guardó el archivo (vacío si no se sabe): para avisar si la que lo abre es más vieja. */
  writtenBy: z.string().max(40).catch('').default(''),
  locale: z.string().default('es-AR'),
  calendar: CalendarZ,
  holidays: HolidaysZ,
  personalDates: z.array(PersonalDateZ).default([]),
  astronomy: AstronomyZ,
  paper: PaperZ,
  binding: BindingZ,
  theme: ThemeRefZ,
  persona: PersonaZ,
  methods: MethodsZ,
  sections: z.array(SectionZ).default([]),
  customPages: z.array(CustomPageZ).default([]),
  pageTemplates: z.array(PageTemplateZ).default([]),
  customBlocks: z.array(CustomBlockZ).default([]),
  watermarks: z.array(WatermarkZ).default([]),
  overrides: z.array(BlockOverrideZ).default([]),
  blockStyles: z.array(BlockStyleZ).default([]),
  pageStyles: z.array(PageStyleZ).default([]),
  links: LinksZ,
  assets: z.array(AssetRefZ).default([]),
  cover: CoverZ,
  /** Fuentes que viajan con el archivo. Si alguna no es válida se descartan todas (la agenda abre igual, con las de reserva). */
  userFonts: z.array(UserFontZ).max(USER_FONTS_MAX).optional().catch(undefined),
});

export type Design = z.infer<typeof DesignZ>;
export type DesignInput = z.input<typeof DesignZ>;

/** Valida y completa con valores por defecto. Lanza un error legible si algo no cuadra. */
let defaults: Design | undefined;

/** Una agenda vacía con todos los valores por defecto del esquema (de ahí salen los «restablecer»). */
export function designDefaults(): Design {
  defaults ??= DesignZ.parse({});
  return defaults;
}

/**
 * Lleva el archivo a la versión actual del formato y lo valida (ver `migrations.ts`). Es la entrada de
 * todo lo que viene de afuera: archivos, la biblioteca guardada, un modelo de lenguaje.
 */
export function safeParseDesign(input: unknown): ReturnType<typeof DesignZ.safeParse> {
  return DesignZ.safeParse(migrateDesignInput(input));
}

export function parseDesign(input: unknown): Design {
  const res = safeParseDesign(input);
  if (res.success) return res.data;
  const msg = res.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Diseño inválido:\n${msg}`);
}

/** Tamaño real de la hoja (vertical: ancho < alto) según el preset. */
export function sheetSize(paper: Design['paper']): { w: number; h: number } {
  if (paper.preset === 'CUSTOM') {
    const w = Math.min(paper.width, paper.height);
    const h = Math.max(paper.width, paper.height);
    return { w, h };
  }
  const p = PAPER_PRESETS[paper.preset];
  return { w: p.w, h: p.h };
}
