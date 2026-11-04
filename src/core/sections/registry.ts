import { BACK_SECTIONS } from './back';
import { FRONT_SECTIONS } from './front';
import { methodsGuide } from './guide';
import { MONTH_SECTIONS } from './month';
import type { SectionModule } from './types';
import { WEEK_SECTIONS } from './weekly';

export const SECTION_MODULES: SectionModule[] = [...FRONT_SECTIONS, methodsGuide, ...MONTH_SECTIONS, ...WEEK_SECTIONS, ...BACK_SECTIONS];

export const SECTION_REGISTRY: ReadonlyMap<string, SectionModule> = new Map(SECTION_MODULES.map((m) => [m.type, m]));

/** Tipos de página que existen (alcance de marcas de agua, ajustes y bloques propios). */
export const PAGE_TYPES = [
  'titlePage',
  'dedication',
  'personalInfo',
  'guide',
  'toc',
  'yearOverview',
  'birthdays',
  'bestSelf',
  'vision',
  'actionPlan',
  'moodYear',
  'monthCover',
  'monthLog',
  'monthGrid',
  'weekLeft',
  'weekRight',
  'daily',
  'habits',
  'balance',
  'review',
  'notes',
  'passwords',
  'contacts',
  'health',
  'sleepDiary',
  'unstuck',
  'estimates',
  'custom',
  'filler',
] as const;
export type PageType = (typeof PAGE_TYPES)[number];
