/**
 * Plantillas de diseño listas para usar. Todas producen un `Design` válido y
 * completo; la interfaz parte de una de ellas y el usuario ajusta el resto.
 */
import { fmt, langOf, resolveStrings } from '../i18n';
import { isSouthern } from '../layout/widgets';
import { DEFAULT_METHODS } from '../methods/catalog';
import { newId } from '../util/hash';
import { parseDesign, type Design, type DesignInput, type SectionItem, type SectionSpec } from './schema';

export type TemplateId = 'heritage-norma' | 'heritage' | 'clara' | 'minimal';

export const TEMPLATES: Array<{ id: TemplateId; name: string; description: string }> = [
  { id: 'heritage-norma', name: 'Heritage · Con dedicatoria', description: 'Para regalar: dedicatoria, una frase por mes, cumpleaños y colibrí.' },
  { id: 'heritage', name: 'Heritage', description: 'Diseño clásico, durable y legible. Semana Alastair sin horas fijas.' },
  { id: 'clara', name: 'Lectura clara', description: 'Letra grande, alto contraste y renglones amplios (personas mayores o baja visión).' },
  { id: 'minimal', name: 'Mínima', description: 'Una sola tipografía, puntos en vez de renglones, sin sombreado.' },
];

const item = (type: string, options: Record<string, unknown> = {}, enabled = true): SectionItem => ({ id: type, type, enabled, options, repeat: 'month' });
const section = (type: string, options: Record<string, unknown> = {}, enabled = true): SectionSpec => ({ id: type, type, enabled, options, repeat: 'month' });

/** Mes Heritage (orden de 2026): portada, notas, registro diario, semanas, balance, resumen, hábitos, notas. */
export function heritageMonthItems(opts: { grid?: boolean; weekly?: string } = {}): SectionItem[] {
  return [
    { ...item('monthCover'), id: 'cover' },
    { ...item('monthNotes', { count: 1, style: 'auto' }), id: 'notes-a' },
    { ...item('monthLog'), id: 'log' },
    { ...item('monthGrid', { spread: 'auto' }, opts.grid ?? false), id: 'grid' },
    { ...item('weeks', { variant: opts.weekly ?? 'alastair', priorities: 'auto', footer: 'expenses' }), id: 'weeks' },
    { ...item('balance'), id: 'balance' },
    { ...item('review', { variant: 'auto' }), id: 'review' },
    { ...item('habits', { rows: 10, total: true }), id: 'habits' },
    { ...item('monthNotes', { count: 1, style: 'auto' }), id: 'notes-b' },
  ];
}

export function defaultSections(opts: { personal?: boolean; guide?: boolean; health?: boolean; moodYear?: boolean; bestSelf?: boolean; grid?: boolean; toc?: boolean } = {}): SectionSpec[] {
  return [
    section('titlePage', { showName: true, showKicker: true }),
    section('dedication'),
    section('personalInfo', { emergency: true, medical: true }, opts.personal ?? true),
    section('toc', {}, opts.toc ?? false),
    section('guide', {}, opts.guide ?? true),
    section('yearOverview', { years: 2, perPage: 6 }),
    section('birthdays', { pages: 1 }),
    section('bestSelf', {}, opts.bestSelf ?? false),
    section('vision', { perPage: 2 }),
    section('actionPlan', { goals: 3, mantra: true }),
    section('moodYear', {}, opts.moodYear ?? false),
    { ...section('months'), items: heritageMonthItems({ grid: opts.grid ?? false }) },
    section('health', { pages: 1 }, opts.health ?? false),
    section('sleepDiary', { pages: 2 }, false),
    section('unstuck', { pages: 1 }, false),
    section('estimates', { pages: 1 }, false),
    section('passwords', { pages: 2, separate: false, detailed: 'auto' }),
    section('contacts', { pages: 1 }),
    section('notes', { count: 0, style: 'auto' }),
  ];
}

export const COLIBRI_ASSET = {
  id: 'colibri',
  name: 'Colibrí (Heritage)',
  kind: 'vector' as const,
  mime: 'image/svg+xml',
  width: 147.31465,
  height: 121.12654,
  builtin: 'watermarks/colibri.svg',
};

export function colibriWatermark(): Design['watermarks'][number] {
  return {
    id: 'colibri',
    enabled: true,
    assetId: 'colibri',
    scope: ['all'],
    exclude: ['monthCover', 'titlePage', 'custom', 'yearOverview'], excludePages: [],
    hAnchor: 'outer',
    vAnchor: 'bottom',
    dx: 13,
    // En el margen inferior: entre el fin del contenido y la zona que la impresora no imprime,
    // así el dibujo no pisa los renglones de escritura.
    dy: 4.8,
    width: 12,
    opacity: 1,
    rotation: 0,
    mirrorOnVerso: true,
    layer: 'above',
    minStrokePt: 0.3,
  };
}

/**
 * Frases por mes de la plantilla para regalar, con las estaciones del hemisferio sur y las fechas
 * reales de equinoccios y solsticios. Solo para agendas en castellano del hemisferio sur; en las
 * demás se usan las frases del idioma, que no dependen de la estación.
 */
const SOUTHERN_SEASON_PHRASES_ES = [
  '365 días por delante. Empezar de cero, una vez más.',
  'Días de verano. Tiempo para lo que te gusta.',
  '{marchEquinox}: comienza el otoño. Cosechar lo sembrado.',
  'Anotar lo importante, organizar el resto.',
  'Días frescos. El placer de estar en casa.',
  '{juneSolstice}: comienza el invierno. Pausa y reflexión.',
  'El valor de lo analógico: papel, lápiz y tiempo.',
  'Nuevos planes para la segunda mitad del año.',
  '{septemberEquinox}: comienza la primavera. Tiempo de florecer.',
  'Días largos y tibios. Disfrutar lo que florece.',
  'Registrar los logros. Gratitud por lo vivido.',
  'Últimos 31 días. Brindar por lo que pasó.',
];

export interface CreateOptions {
  year?: number;
  locale?: string;
  country?: string | null;
  name?: string;
}

export function createDesign(template: TemplateId, opts: CreateOptions = {}): Design {
  const year = opts.year ?? new Date().getFullYear() + 1;
  const locale = opts.locale ?? 'es-AR';
  const country = opts.country === undefined ? (locale.split('-')[1]?.toUpperCase() ?? null) : opts.country;
  const now = new Date().toISOString();
  const strings = resolveStrings(locale);
  const named = (key: keyof typeof strings.designName): string => fmt(strings.designName[key], { year, name: opts.name?.trim() ?? '' });
  const base: DesignInput = {
    id: newId('agenda'),
    name: named('base'),
    createdAt: now,
    updatedAt: now,
    locale,
    calendar: { year, weekStart: 'auto', numbering: 'iso' },
    holidays: { country, types: ['public', 'bank'] },
    paper: { preset: 'A4' },
    binding: { method: 'sewn', signature: { mode: 'uniform', sheets: 4, last: 'shrink' } },
    theme: { id: 'heritage', comfort: 'normal' },
    methods: { enabled: [...DEFAULT_METHODS] },
    sections: defaultSections(),
    // El nombre de la persona (portada, dedicatoria, variables de texto), en toda plantilla.
    persona: { name: opts.name?.trim() ?? '' },
    assets: [COLIBRI_ASSET],
    watermarks: [colibriWatermark()],
  };

  switch (template) {
    case 'heritage-norma': {
      // Textos de ejemplo en el idioma de la agenda; las frases de estaciones, solo donde valen.
      const gift = strings.gift;
      const seasonal = langOf(locale) === 'es' && isSouthern(country);
      return parseDesign({
        ...base,
        name: named(opts.name?.trim() ? 'person' : 'base'),
        persona: {
          name: opts.name?.trim() ?? '',
          title: gift.title,
          dedicationTitle: gift.dedicationTitle,
          dedication: gift.dedication,
          ...(seasonal ? { phrases: SOUTHERN_SEASON_PHRASES_ES } : {}),
        },
        sections: defaultSections({ personal: true, guide: true, health: true }),
      });
    }
    case 'clara':
      return parseDesign({
        ...base,
        name: named('clara'),
        theme: { id: 'clara', comfort: 'wide' },
        methods: { enabled: [...DEFAULT_METHODS, 'legibility'] },
        sections: defaultSections({ personal: true, guide: true, health: true, grid: true }),
        watermarks: [{ ...colibriWatermark(), width: 11, opacity: 0.85 }],
      });
    case 'minimal':
      return parseDesign({ ...base, name: named('minimal'), theme: { id: 'minimal', comfort: 'normal' }, watermarks: [] });
    default:
      return parseDesign(base);
  }
}

/** Duplica un diseño para el año siguiente (conserva todo, cambia año y nombre). */
/**
 * Corre los años de una clave semántica (`week:2027-W12:left`, `month:2027-03:log`,
 * `day:2027-05-03`, `month:2027-03`) para que anclas y ajustes sigan en su lugar al
 * duplicar la agenda para otro año.
 */
export function shiftKeyYears(key: string, delta: number): string {
  return key.replace(/(^|[:+@])(\d{4})(?=-|:|$)/g, (_m, pre: string, y: string) => `${pre}${Number(y) + delta}`);
}

export function duplicateForYear(d: Design, year: number): Design {
  const delta = year - d.calendar.year;
  const shift = (k: string | null): string | null => (k === null ? null : shiftKeyYears(k, delta));
  return parseDesign({
    ...d,
    id: newId('agenda'),
    name: d.name.replace(String(d.calendar.year), String(year)),
    calendar: { ...d.calendar, year },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Los feriados agregados o quitados a mano son del año anterior (puentes por decreto).
    holidays: { ...d.holidays, added: [], removed: [], renamed: {} },
    overrides: d.overrides.map((o) => ({ ...o, pageKey: shift(o.pageKey) })),
    customBlocks: d.customBlocks.map((c) => ({ ...c, pageKey: shift(c.pageKey) })),
    watermarks: d.watermarks.map((w) => ({ ...w, excludePages: w.excludePages.map((k) => shiftKeyYears(k, delta)) })),
    pageStyles: d.pageStyles.map((p) => ({ ...p, pageKey: shift(p.pageKey) })),
    blockStyles: d.blockStyles.map((s) => ({ ...s, pageKey: shift(s.pageKey) })),
    // Los enlaces a mano siguen en su página y a la misma página del año nuevo.
    links: { ...d.links, blocks: d.links.blocks.map((l) => ({ ...l, pageKey: shift(l.pageKey), page: l.mode === 'page' ? shiftKeyYears(l.page, delta) : l.page })) },
    // Si el ancla no existe en el año nuevo, la página propia cae por su respaldo.
    customPages: d.customPages.map((c) => ({ ...c, after: shift(c.after), fallback: shift(c.fallback) })),
  });
}
