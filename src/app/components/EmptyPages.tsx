/**
 * Una agenda sin páginas (la plantilla «En blanco», o al apagar todas las secciones): en lugar de un lienzo
 * vacío, qué se puede hacer para empezar.
 */
import type { AgendaDocument } from '@core/document';
import { FilePlus2, LayoutTemplate, ListPlus, Sparkles } from 'lucide-react';
import { useT } from '../i18n/ui';
import { useAssistant } from '../state/ai/assistant';
import { customPageHere } from '../state/customPages';
import { reveal } from '../state/reveal';
import { createTemplate } from '../state/sections';
import { shortcutHint } from '../state/shortcutHints';
import { useStore } from '../state/store';
import { AssistantDock } from './assistant/AssistantDock';

export function EmptyPages({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const pill = useAssistant((s) => s.settings.pill);
  const addPage = (): void => {
    const cp = customPageHere(doc, 0, {});
    useStore.getState().update((d) => void d.customPages.push(cp));
    useStore.getState().setGoToKey(`custom:${cp.id}`);
  };
  const btn = 'inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-ink hover:bg-paper';
  return (
    <div className="desk relative flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-ink-soft" data-testid="no-pages">
      <p className="max-w-md text-[14px] text-ink">{t('app.noPages')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-white hover:bg-[#435c31]" onClick={() => void reveal({ panel: 'sections', selector: '[data-testid="add-section"]' })}>
          <ListPlus size={15} /> {t('sections.add')}
        </button>
        <button type="button" className={btn} onClick={addPage}>
          <FilePlus2 size={15} /> {t('sections.insertHere')}
        </button>
        <button type="button" className={btn} onClick={() => useStore.getState().setGoToKey(createTemplate(t('ptpl.defaultTitle')))}>
          <LayoutTemplate size={15} /> {t('ptpl.new')}
        </button>
      </div>
      {pill && (
        <p className="inline-flex items-center gap-1.5 text-[12px]">
          <Sparkles size={13} className="text-accent" aria-hidden="true" /> {t('app.noPagesAssistant', { keys: shortcutHint('ai.focus', t) ?? '' })}
        </p>
      )}
      <AssistantDock footer={false} />
    </div>
  );
}
