/**
 * Planificación del documento: secuencia de páginas con claves semánticas,
 * reglas de recto/verso (páginas que deben caer a la derecha o a la
 * izquierda), páginas propias ancladas por clave y relleno hasta completar
 * los cuadernillos. Cambiar el año, el papel o insertar una página reacomoda
 * todo solo; los ajustes del editor siguen aplicando porque se atan a claves,
 * nunca a números de página.
 */
import type { Design } from '../design/schema';
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

export function draftPages(doc: DocContext, registry: ReadonlyMap<string, SectionModule>, opts: PlanOptions = {}): PagePlanDraft[] {
  const drafts: PagePlanDraft[] = [];
  const include = opts.only ?? ((_t: string, o: Record<string, unknown>) => o.separate !== true);
  for (const section of doc.design.sections) {
    if (!section.enabled) continue;
    if (section.type === 'months') {
      if (!include('months', section.options)) continue;
      for (const month of doc.cal.months) {
        for (const item of section.items ?? []) {
          if (!item.enabled) continue;
          const mod = registry.get(item.type);
          if (!mod) continue;
          drafts.push(...mod.plan(doc, item, month).map((d) => ({ ...d, module: d.module ?? mod.type })));
        }
      }
      continue;
    }
    if (!include(section.type, section.options)) continue;
    const mod = registry.get(section.type);
    if (!mod) continue;
    drafts.push(...mod.plan(doc, section).map((d) => ({ ...d, module: d.module ?? mod.type })));
  }
  return drafts;
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
  const style = doc.design.binding.fillWith;
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
  const signatures = planSignatures(pages.length, doc.design.binding);
  let padded = 0;
  const lastGroup = pages[pages.length - 1]?.group ?? '';
  while (pages.length < signatures.totalPages) {
    const f = filler(padded++, lastGroup, style, 'signature');
    pages.push({ ...f, module: 'filler', index: pages.length, side: pages.length % 2 === 0 ? 'recto' : 'verso' });
  }
  return { pages, signatures, contentPages, parityFillers: parity, signatureFillers: padded };
}
