import type { MonthInfo } from '../calendar';
import type { SectionItem } from '../design/schema';
import type { DocContext, LayoutContext } from '../layout/context';
import type { Side } from '../layout/prims';

/** Página planificada (antes de maquetar). */
export interface PagePlan {
  /** Clave semántica única y estable (p. ej. `week:2027-W12:left`). */
  key: string;
  /** Tipo de página: alcance de ajustes, marcas de agua y bloques propios. */
  type: string;
  /** Sección de origen (id del ítem del diseño). */
  section: string;
  /** Módulo que maqueta la página (tipo de sección). */
  module: string;
  title: string;
  /** Grupo para el navegador (p. ej. «Enero 2027»). */
  group: string;
  startOn?: 'recto' | 'verso' | 'any';
  params?: Record<string, unknown>;
  /** Asignados por la paginación. */
  index: number;
  side: Side;
}

export type PagePlanDraft = Omit<PagePlan, 'index' | 'side' | 'module'> & { module?: string };

export interface SectionModule {
  type: string;
  /** Dónde tiene sentido: al inicio, dentro de cada mes o al final. */
  scope: 'front' | 'month' | 'back' | 'any';
  /** Opciones por defecto (la interfaz las usa para construir el formulario). */
  defaults: Record<string, unknown>;
  plan(doc: DocContext, item: SectionItem, month?: MonthInfo): PagePlanDraft[];
  layout(ctx: LayoutContext, page: PagePlan): void;
}

/** Ensancha literales (6 → number) para que los valores por defecto no restrinjan el tipo. */
type Widen<T> = T extends number ? number : T extends string ? string : T extends boolean ? boolean : T;

export function opt<T>(item: SectionItem | undefined, key: string, def: T): Widen<T> {
  const v = item?.options?.[key];
  return (v === undefined ? def : v) as Widen<T>;
}

export function param<T>(page: PagePlan, key: string, def: T): Widen<T> {
  const v = page.params?.[key];
  return (v === undefined ? def : v) as Widen<T>;
}
