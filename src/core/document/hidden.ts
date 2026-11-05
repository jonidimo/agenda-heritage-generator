/**
 * Elementos que el editor ocultó en una página: los de la sección (ajuste «oculto», por página o por
 * tipo de página) y las marcas de agua que se la saltan. Los elementos propios ocultos se borran, así
 * que no figuran. Sirve para listarlos y devolverlos a la página sin tener que acordarse de cuáles eran.
 */
import type { Design } from '../design/schema';
import type { DocContext } from '../layout/context';
import { SECTION_REGISTRY } from '../sections/registry';
import { findOverride, layoutPage, pageInputs } from './layout';
import type { PagePlan } from '../sections/types';

export interface HiddenElement {
  /** Identificador del elemento (`header.title`, `wm.<id>`). */
  id: string;
  /** Nombre que se ve en la página (o el archivo, para una marca de agua). */
  label: string;
  /** `type`: oculto en todas las páginas de este tipo; `page`: solo en esta. */
  scope: 'type' | 'page';
  kind: 'block' | 'watermark';
}

export function hiddenElements(ctx: DocContext, design: Design, plan: PagePlan, totalPages: number): HiddenElement[] {
  const inputs = pageInputs(design, plan);
  const ids = new Set<string>();
  const winners: Array<{ id: string; scope: 'type' | 'page' }> = [];
  for (const o of inputs.overrides) {
    if (ids.has(o.blockId)) continue;
    ids.add(o.blockId);
    // Manda el ajuste de la página; si ese no oculta, el elemento se ve aunque el del tipo diga lo contrario.
    const effective = findOverride(inputs.overrides, plan, o.blockId);
    if (effective?.hidden) winners.push({ id: o.blockId, scope: effective.pageKey === null ? 'type' : 'page' });
  }
  const out: HiddenElement[] = [];
  if (winners.length > 0) {
    // Se maqueta la página con esos elementos a la vista solo para saber cómo se llaman.
    const shown = layoutPage(ctx, plan, SECTION_REGISTRY, totalPages, { ...inputs, overrides: inputs.overrides.map((o) => (o.hidden ? { ...o, hidden: false } : o)) });
    for (const w of winners) out.push({ id: w.id, label: shown.blocks.find((b) => b.id === w.id)?.label ?? w.id, scope: w.scope, kind: 'block' });
  }
  for (const wm of design.watermarks) {
    if (!wm.enabled || !(wm.scope.includes('all') || wm.scope.includes(plan.type))) continue;
    const byPage = wm.excludePages.includes(plan.key);
    const byType = wm.exclude.includes(plan.type);
    if (!byPage && !byType) continue;
    out.push({ id: `wm.${wm.id}`, label: design.assets.find((a) => a.id === wm.assetId)?.name ?? wm.assetId, scope: byPage ? 'page' : 'type', kind: 'watermark' });
  }
  return out;
}
