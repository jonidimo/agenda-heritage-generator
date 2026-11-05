/**
 * Planificación del documento: secuencia de páginas con claves semánticas,
 * reglas de recto/verso (páginas que deben caer a la derecha o a la
 * izquierda), páginas propias ancladas por clave y relleno hasta completar
 * los cuadernillos. Cambiar el año, el papel o insertar una página reacomoda
 * todo solo; los ajustes del editor siguen aplicando porque se atan a claves,
 * nunca a números de página.
 */
import type { MonthInfo, WeekInfo } from '../calendar';
import type { Design, SectionItem } from '../design/schema';
import { planSignatures, type SignaturePlan } from '../imposition/signatures';
import type { DocContext } from '../layout/context';
import type { PagePlan, PagePlanDraft, SectionModule } from '../sections/types';

export interface DocumentPlan {
  pages: PagePlan[];
  signatures: SignaturePlan;
  /** Páginas con contenido (sin rellenos de paridad ni de cuadernillo). */
  contentPages: number;
  /** Rellenos para que una sección caiga en el lado correcto. */
  parityFillers: number;
  /** Relleno para completar cuadernillos. */
  signatureFillers: number;
}

export interface PlanOptions {
  /** Plan sin las secciones marcadas como «aparte» (p. ej. libreta de contraseñas). */
  only?: (sectionType: string, options: Record<string, unknown>) => boolean;
}

/**
 * Tope de páginas de una agenda. Una agenda diaria de 24 meses con varias páginas por día queda
 * muy por debajo; un archivo que pide cientos de miles (cantidades altas repetidas cada día) se
 * rechaza en lugar de agotar la memoria al armarlo.
 */
export const MAX_PAGES = 6000;

function checkSize(drafts: readonly PagePlanDraft[]): void {
  if (drafts.length > MAX_PAGES) throw new Error(`La agenda tendría más de ${MAX_PAGES} páginas: bajá las cantidades o las repeticiones por día o por semana.`);
}

export function draftPages(doc: DocContext, registry: ReadonlyMap<string, SectionModule>, opts: PlanOptions = {}): PagePlanDraft[] {
  const drafts: PagePlanDraft[] = [];
  const include = opts.only ?? ((_t: string, o: Record<string, unknown>) => o.separate !== true);
  for (const section of doc.design.sections) {
    if (!section.enabled) continue;
    if (section.type === 'months') {
      if (!include('months', section.options)) continue;
      for (const month of doc.cal.months) {
        drafts.push(...planMonth(doc, registry, section.items ?? [], month));
        checkSize(drafts);
      }
      continue;
    }
    if (!include(section.type, section.options)) continue;
    const mod = registry.get(section.type);
    if (!mod) continue;
    drafts.push(...mod.plan(doc, section).map((d) => ({ ...d, module: d.module ?? mod.type })));
    checkSize(drafts);
  }
  return drafts;
}

/** Copia de las páginas de una sección para un mes, una semana o un día. */
interface Occurrence {
  /** Sufijo de las claves (`2027-03`, `2027-W12`, `2027-03-15`): cada copia tiene claves propias y estables. */
  scope: string;
  month: MonthInfo;
  week?: WeekInfo;
  date?: string;
}

/**
 * Atribuye las páginas de una sección a su mes (y semana o día): grupo del mes, claves únicas
 * por copia y los datos que usan los textos ({month}, {week}, {date}). Sirve para cualquier
 * sección, aunque no sepa de meses: así toda sección puede repetirse.
 */
function placeIn(drafts: PagePlanDraft[], o: Occurrence): PagePlanDraft[] {
  return drafts.map((d) => ({
    ...d,
    key: d.key.includes(o.scope) ? d.key : `${d.key}@${o.scope}`,
    group: `month:${o.month.key}`,
    params: {
      month: { y: o.month.y, m: o.month.m },
      monthName: o.month.name,
      ...(o.week ? { week: o.week.key, weekNumber: o.week.number } : {}),
      ...(o.date ? { date: o.date } : {}),
      ...(d.params ?? {}),
    },
  }));
}

/**
 * Páginas de un mes. Lo que se repite por mes va en el orden de la lista; lo que se repite por
 * semana va después de cada semana (de sus páginas, si las tiene) y lo que se repite por día,
 * después de la página de ese día o, si el día comparte página con su semana, después de la semana.
 */
function planMonth(doc: DocContext, registry: ReadonlyMap<string, SectionModule>, items: readonly SectionItem[], month: MonthInfo): PagePlanDraft[] {
  const out: PagePlanDraft[] = [];
  const later: Array<{ item: SectionItem; mod: SectionModule; at: number }> = [];
  for (const item of items) {
    if (!item.enabled) continue;
    const mod = registry.get(item.type);
    if (!mod) continue;
    const withModule = (ds: PagePlanDraft[]): PagePlanDraft[] => ds.map((d) => ({ ...d, module: d.module ?? mod.type }));
    // Las secciones mensuales ya planifican su mes con claves propias; las demás se atribuyen al mes.
    if (item.repeat === 'month') out.push(...withModule(mod.scope === 'month' ? mod.plan(doc, item, month) : placeIn(mod.plan(doc, item, month), { scope: month.key, month })));
    else later.push({ item, mod, at: out.length });
  }
  // Las repeticiones por semana o día se ubican después de que existen las páginas de las semanas.
  for (const { item, mod, at } of later.reverse()) {
    const copies = (o: Occurrence): PagePlanDraft[] => placeIn(mod.plan(doc, item, month), o).map((d) => ({ ...d, module: d.module ?? mod.type }));
    const pending: PagePlanDraft[] = [];
    for (const week of month.weeks) {
      const isos = item.repeat === 'day' ? week.days.map((d) => d.iso) : [];
      const occ: Occurrence[] = item.repeat === 'week' ? [{ scope: week.key, month, week }] : isos.map((iso) => ({ scope: iso, month, week, date: iso }));
      for (const o of occ) {
        const add = copies(o);
        const ownPage = o.date ? lastIndex(out, (d) => d.type === 'daily' && ((d.params?.days as string[] | undefined) ?? []).includes(o.date!)) : -1;
        const weekEnd = lastIndex(out, (d) => d.params?.week === week.key && d.type !== 'monthGrid');
        const anchor = ownPage >= 0 ? ownPage : weekEnd;
        if (anchor >= 0) out.splice(anchor + 1 + countAfter(out, anchor, add), 0, ...add);
        else pending.push(...add);
      }
    }
    // Sin páginas de semana ni de día en el mes: las copias van juntas donde está la sección en la lista.
    out.splice(Math.min(at, out.length), 0, ...pending);
  }
  return out;
}

function lastIndex<T>(arr: readonly T[], f: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (f(arr[i]!)) return i;
  return -1;
}

/** Copias ya puestas después del ancla (para que las del mismo ancla queden en orden de fecha). */
function countAfter(arr: readonly PagePlanDraft[], anchor: number, next: readonly PagePlanDraft[]): number {
  const section = next[0]?.section;
  let n = 0;
  while (anchor + 1 + n < arr.length && arr[anchor + 1 + n]!.section === section && arr[anchor + 1 + n]!.key.includes('@')) n++;
  return n;
}

export function insertCustomPages(drafts: PagePlanDraft[], design: Design, placeholder: string): PagePlanDraft[] {
  const out = [...drafts];
  for (const cp of design.customPages) {
    const anchorKey = cp.after ?? '__start__';
    const draft: PagePlanDraft = {
      key: `custom:${cp.id}`,
      type: 'custom',
      section: 'custom',
      title: cp.title || placeholder,
      group: '',
      startOn: cp.startOn,
      module: 'custom',
      params: { id: cp.id, anchor: anchorKey },
    };
    let at = -1;
    if (cp.after === null) at = 0;
    else {
      const idx = out.findIndex((p) => p.key === cp.after);
      if (idx >= 0) {
        at = idx + 1;
        // No partir un pliego: si el ancla abre una doble página, se inserta después de su pareja.
        const a = out[idx]!;
        const next = out[idx + 1];
        if (a.startOn === 'verso' && next && next.type !== 'custom' && next.section === a.section && next.group === a.group && (next.startOn ?? 'any') === 'any') at = idx + 2;
      } else if (cp.fallback) {
        // Respaldo: después de la última página del grupo (mes), sección o prefijo indicado.
        for (let i = out.length - 1; i >= 0; i--) {
          const p = out[i]!;
          if (p.group === cp.fallback || p.section === cp.fallback || p.key.startsWith(cp.fallback)) {
            at = i + 1;
            break;
          }
        }
      }
    }
    if (at < 0) at = out.length;
    // Varias páginas propias con la misma ancla conservan el orden en que se crearon.
    while (at < out.length && out[at]!.type === 'custom' && out[at]!.params?.anchor === anchorKey) at++;
    draft.group = out[Math.max(0, at - 1)]?.group ?? '';
    out.splice(at, 0, draft);
  }
  return out;
}

function filler(n: number, group: string, style: string, reason: 'parity' | 'signature'): PagePlanDraft {
  // Dentro de un mes, el relleno conserva el mes (pestañas del borde sin huecos).
  const m = /^month:(\d{4})-(\d{2})$/.exec(group);
  const month = m ? { y: Number(m[1]), m: Number(m[2]) } : undefined;
  return { key: `filler:${reason}:${n}`, type: 'filler', section: 'filler', module: 'filler', title: '', group, params: { style, reason, ...(month ? { month } : {}) } };
}

export function planDocument(doc: DocContext, registry: ReadonlyMap<string, SectionModule>, opts: PlanOptions = {}): DocumentPlan {
  const placeholder = doc.strings.custom.placeholder;
  const drafts = insertCustomPages(draftPages(doc, registry, opts), doc.design, placeholder);
  const style = doc.binding.fillWith;
  const pages: PagePlan[] = [];
  let parity = 0;
  const twoSided = true;
  for (const d of drafts) {
    const nextNumber = pages.length + 1; // 1-based: impar = recto (derecha)
    const needsRecto = d.startOn === 'recto' && nextNumber % 2 === 0;
    const needsVerso = d.startOn === 'verso' && nextNumber % 2 === 1;
    if (twoSided && (needsRecto || needsVerso)) {
      const f = filler(parity++, d.group, style, 'parity');
      pages.push({ ...f, module: 'filler', index: pages.length, side: pages.length % 2 === 0 ? 'recto' : 'verso' });
    }
    pages.push({ ...d, module: d.module ?? d.type, index: pages.length, side: pages.length % 2 === 0 ? 'recto' : 'verso' });
  }
  const contentPages = pages.length - parity;
  const signatures = planSignatures(pages.length, doc.binding);
  let padded = 0;
  const lastGroup = pages[pages.length - 1]?.group ?? '';
  while (pages.length < signatures.totalPages) {
    const f = filler(padded++, lastGroup, style, 'signature');
    pages.push({ ...f, module: 'filler', index: pages.length, side: pages.length % 2 === 0 ? 'recto' : 'verso' });
  }
  return { pages, signatures, contentPages, parityFillers: parity, signatureFillers: padded };
}
