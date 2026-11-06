/**
 * Páginas propias creadas desde la interfaz: se anclan después de la página actual
 * (nunca después de un relleno, que puede desaparecer) con su mes o sección como respaldo.
 */
import type { AgendaDocument } from '@core/document';
import type { CustomPage } from '@core/design/schema';
import type { PagePlan } from '@core/sections/types';
import { newId } from '@core/util/hash';

export function customPageHere(doc: AgendaDocument | null, pageIndex: number, content: Partial<CustomPage['content']>): CustomPage {
  let anchor = doc && doc.pageCount > 0 ? doc.plan.pages[Math.min(Math.max(0, pageIndex), doc.pageCount - 1)] : undefined;
  if (doc && anchor?.type === 'filler') {
    // Un relleno no sirve de ancla (su clave cambia sola): la página de contenido anterior, o el principio si no hay.
    let found: PagePlan | undefined;
    for (let i = anchor.index - 1; i >= 0; i--) {
      const p = doc.plan.pages[i]!;
      if (p.type !== 'filler') {
        found = p;
        break;
      }
    }
    anchor = found;
  }
  return {
    id: newId('pagina'),
    after: anchor?.key ?? null,
    fallback: anchor?.group || anchor?.section || null,
    startOn: 'any',
    title: '',
    content: { kind: 'template', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'dots', text: '', rotation: 0, opacity: 1, ...content },
  };
}
