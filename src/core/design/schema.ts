/**
 * Esquema del diseño (`.agenda.json`). Es el contrato estable del programa:
 * todo lo que se ve e imprime sale de aquí. Cada campo tiene valor por defecto,
 * así un archivo viejo o incompleto siempre se completa y valida.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const HolidayTypeZ = z.enum(['public', 'bank', 'school', 'optional', 'observance']);

export const PAPER_PRESETS = {
  A4: { w: 210, h: 297, label: 'A4 (210 × 297 mm) → páginas A5' },
  LETTER: { w: 215.9, h: 279.4, label: 'Carta / Letter (216 × 279 mm)' },
  LEGAL: { w: 215.9, h: 355.6, label: 'Legal / Oficio (216 × 356 mm) — máximo de la HP 4350' },
  OFICIO_340: { w: 216, h: 340, label: 'Oficio 216 × 340 mm' },
  FOLIO: { w: 215.9, h: 330.2, label: 'Folio 8½ × 13" (216 × 330 mm)' },
  A3: { w: 297, h: 420, label: 'A3 (297 × 420 mm) → páginas A4' },
  A5: { w: 148, h: 210, label: 'A5 (148 × 210 mm) → páginas A6' },
  CUSTOM: { w: 210, h: 297, label: 'Personalizado' },
} as const;
export type PaperPresetId = keyof typeof PAPER_PRESETS;
export const PaperPresetZ = z.enum(Object.keys(PAPER_PRESETS) as [PaperPresetId, ...PaperPresetId[]]);

/**
 * Números tolerantes: un valor fuera de rango (un archivo editado a mano, un dato viejo) se
 * acomoda al rango en lugar de invalidar toda la agenda, y los enteros se redondean
 * (un «4,5» tipeado en «hojas por cuadernillo» no deja la agenda sin poder abrirse).
 */
const clampTo = (min: number, max: number) => (v: number): number => Math.min(max, Math.max(min, v));
const num = (def: number, min = -10_000, max = 10_000) => z.number().transform(clampTo(min, max)).default(def);
const intIn = (min: number, max: number) => z.number().transform((v) => clampTo(min, max)(Math.round(v)));

export const CalendarZ = z
  .object({
    year: intIn(1900, 2200).default(new Date().getFullYear() + 1),
    startMonth: intIn(1, 12).default(1),
    monthCount: intIn(1, 24).default(12),
    weekStart: z.enum(['auto', 'monday', 'sunday', 'saturday']).default('monday'),
    weekend: z.union([z.literal('auto'), z.array(intIn(1, 7))]).default('auto'),
    numbering: z.enum(['iso', 'simple', 'none']).default('iso'),
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
      })
      .prefault({}),
  })
  .prefault({});

export const ThemeRefZ = z
  .object({
    id: z.string().default('heritage'),
    comfort: z.enum(['compact', 'normal', 'wide']).default('normal'),
    tokens: z.record(z.string(), z.unknown()).default({}),
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
      })
      .prefault({}),
  })
  .prefault({});

export const SectionItemZ = z.object({
  id: z.string(),
  type: z.string(),
  enabled: z.boolean().default(true),
  options: z.record(z.string(), z.unknown()).default({}),
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

export const CustomBlockZ = z.object({
  id: z.string(),
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  kind: z.enum(['text', 'image', 'lines', 'dots', 'grid', 'rect', 'line']),
  x: z.number(),
  y: z.number(),
  w: z.number().min(0.5),
  h: z.number().min(0.5),
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
  mirrorOnVerso: z.boolean().default(true),
  layer: z.enum(['above', 'below']).default('above'),
  /** Grosor mínimo de trazo en puntos para que el dibujo vectorial no desaparezca al imprimir. */
  minStrokePt: num(0.3, 0, 5),
});
export type WatermarkPlacement = z.infer<typeof WatermarkZ>;

export const BlockOverrideZ = z.object({
  pageType: z.string(),
  pageKey: z.string().nullable().default(null),
  blockId: z.string(),
  dx: num(0),
  dy: num(0),
  scale: num(1, 0.05, 20),
  rotation: num(0, -360, 360),
  opacity: num(1, 0, 1),
  hidden: z.boolean().default(false),
});
export type BlockOverride = z.infer<typeof BlockOverrideZ>;

export const AssetRefZ = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['raster', 'vector', 'pdf', 'font']),
  mime: z.string(),
  /** Píxeles (raster) o mm (vector/pdf). */
  width: z.number().default(0),
  height: z.number().default(0),
  /** Recurso integrado servido desde /public (p. ej. «watermarks/colibri.svg»). */
  builtin: z.string().nullable().default(null),
  /** Contenido en base64 cuando el diseño se exporta como archivo autocontenido. */
  data: z.string().nullable().optional(),
  pages: intIn(0, 100_000).optional(),
});
export type AssetRef = z.infer<typeof AssetRefZ>;

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

export const DesignZ = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().default('design'),
  name: z.string().default('Mi agenda'),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
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
  customBlocks: z.array(CustomBlockZ).default([]),
  watermarks: z.array(WatermarkZ).default([]),
  overrides: z.array(BlockOverrideZ).default([]),
  assets: z.array(AssetRefZ).default([]),
  cover: CoverZ,
});

export type Design = z.infer<typeof DesignZ>;
export type DesignInput = z.input<typeof DesignZ>;

/** Valida y completa con valores por defecto. Lanza un error legible si algo no cuadra. */
export function parseDesign(input: unknown): Design {
  const res = DesignZ.safeParse(input);
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
