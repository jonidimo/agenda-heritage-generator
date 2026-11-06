/**
 * Lo que la aplicación le da a las herramientas del asistente (ver `ToolHost` en `core/ai/tools.ts`):
 * qué está mirando la persona, la agenda abierta, mostrar una página, cambiar la vista y, si se permite,
 * dibujar páginas como imágenes. Nada de acá cambia la agenda: eso solo pasa al aprobar una propuesta.
 */
import type { AiContext, RevealResult, ToolHost } from '@core/ai/tools';
import { AgendaDocument } from '@core/document';
import type { Design } from '@core/design/schema';
import { blockBounds } from '@core/document/layout';
import type { Box } from '@core/document/inspect';
import { blockLabel } from '../../i18n/messages';
import { translate } from '../../i18n/ui';
import { resources } from '../resources';
import { revealTarget } from '../revealTarget';
import { currentDocument, selectionContext } from '../selectionContext';
import { activeView, useStore, viewsOf, type View } from '../store';
import { renderPagePng } from './rasterize';

/** Páginas que se maquetan seguidas antes de ceder el hilo. */
const LAYOUT_BATCH = 12;

const box = (r: { x: number; y: number; w: number; h: number }): Box => [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 10) / 10) as Box;

function context(): AiContext {
  const s = useStore.getState();
  const doc = currentDocument();
  const t = (k: Parameters<typeof translate>[1]) => translate(s.uiLang, k);
  const index = doc && doc.pageCount > 0 ? Math.min(Math.max(0, s.pageIndex), doc.pageCount - 1) : -1;
  const plan = doc && index >= 0 ? doc.plan.pages[index] : undefined;
  const sel = selectionContext();
  return {
    uiLanguage: s.uiLang,
    mode: s.mode,
    view: activeView(s),
    agenda: s.design ? { name: s.design.name, year: s.design.calendar.year, locale: s.design.locale, pages: doc?.pageCount ?? 0, revision: s.revision } : null,
    page: doc && plan ? { number: index + 1, key: plan.key, type: plan.type, side: plan.side, title: doc.pageLabel(index) } : null,
    selection: (sel?.selected ?? []).map((b) => ({ blockId: b.id, label: blockLabel(t, b.id, b.label, b.renamed), box: box(blockBounds(b)) })),
  };
}

function documentFor(design: Design): AgendaDocument | null {
  if (resources.fonts.list().length === 0) return null;
  // Un documento aparte (no el de la caché del editor, que guarda solo el confirmado y la vista previa).
  const reuse = currentDocument();
  return new AgendaDocument(design, { fonts: resources.fonts, holidays: resources.holidaysFor(design.holidays.country), assets: resources.assetInfos }, {}, reuse ? { reuse } : {});
}

function reveal(req: { page?: number | undefined; key?: string | undefined; blockId?: string | undefined }): RevealResult {
  const out = revealTarget(req);
  if (out.ok) return { ok: true, page: out.page, key: out.key, selected: out.selected };
  return { ok: false, message: out.reason === 'noDocument' ? 'La agenda no se puede armar ahora.' : `No existe esa página (la agenda tiene ${out.pageCount}).` };
}

function setView(req: { view?: string | undefined; mode?: 'design' | 'print' | undefined; zoom?: number | 'fit' | undefined }): string {
  const s = useStore.getState();
  const done: string[] = [];
  if (req.mode) {
    s.setMode(req.mode);
    done.push(`modo ${req.mode}`);
  }
  if (req.view) {
    const st = useStore.getState();
    const allowed = viewsOf(st.mode, st.design?.binding.target === 'screen');
    if (!(allowed as readonly string[]).includes(req.view)) return `La vista «${req.view}» no existe en este modo. Vistas: ${allowed.join(', ')}.`;
    st.setView(req.view as View);
    done.push(`vista ${req.view}`);
  }
  if (req.zoom !== undefined) {
    if (req.zoom === 'fit') useStore.getState().zoomFit();
    else useStore.getState().setZoom(req.zoom, false);
    done.push(`zoom ${req.zoom}`);
  }
  return done.length > 0 ? `Listo: ${done.join(', ')}.` : 'No se pidió ningún cambio.';
}

const abortError = (): Error => Object.assign(new Error('Cancelado.'), { name: 'AbortError' });

/** Maqueta una agenda de a tandas, cediendo el hilo: la interfaz sigue respondiendo (y «Detener» también). */
async function paced(doc: AgendaDocument, signal: AbortSignal | undefined): Promise<void> {
  for (let i = 0; i < doc.pageCount; i++) {
    if (signal?.aborted) throw abortError();
    try {
      doc.pageWarnings(i);
    } catch {
      // Una página que no se puede maquetar se informa en la revisión: acá solo se adelanta el trabajo.
    }
    if (i % LAYOUT_BATCH === LAYOUT_BATCH - 1) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export interface HostOptions {
  vision: boolean;
  /** El turno: si se detiene, la maquetación en curso se corta. */
  signal?: AbortSignal | undefined;
  /** Una propuesta que la persona pidió ajustar: las herramientas leen y cambian esto, no la agenda confirmada. */
  draft?: Design | null | undefined;
}

/** El anfitrión de las herramientas; con `vision`, también puede dibujar páginas. */
export function appToolHost({ vision, signal, draft }: HostOptions): ToolHost {
  let draftDoc: AgendaDocument | null = null;
  const doc = (): AgendaDocument | null => {
    if (!draft) return currentDocument();
    draftDoc ??= documentFor(draft);
    return draftDoc;
  };
  return {
    context,
    design: () => draft ?? useStore.getState().design,
    document: doc,
    documentFor,
    render: vision
      ? async (index, width) => {
          const d = doc();
          if (!d) throw new Error('La agenda no se puede armar ahora.');
          return renderPagePng(d, index, width);
        }
      : undefined,
    reveal,
    setView,
    catalogueExtra: () => ({ fonts: resources.fonts.families() }),
    layoutAll: async () => {
      const d = doc();
      if (d) await paced(d, signal);
    },
    pace: (d) => paced(d, signal),
    ...(draft ? { baseline: () => useStore.getState().design } : {}),
  };
}
