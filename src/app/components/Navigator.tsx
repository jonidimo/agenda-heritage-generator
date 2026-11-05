/** Tira de miniaturas agrupadas (inicio, cada mes, final) con navegación rápida. */
import type { AgendaDocument } from '@core/document';
import { monthNames } from '@core/calendar/locale';
import { memo, useEffect, useMemo, useRef } from 'react';
import { pageTitle, useT } from '../i18n/ui';
import { PANEL_LIMITS } from '../state/prefs';
import { useStore } from '../state/store';
import { thumbMenu } from './canvas/menus';
import { Thumb } from './canvas/Thumb';
import { openMenuAt } from './ContextMenu';
import { jumpToPage } from '../state/navigation';
import { Splitter } from './ui';

export function Navigator({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const current = useStore((s) => s.pageIndex);
  const thumbWidth = useStore((s) => s.panelSizes.thumbs);
  const setPanelSize = useStore((s) => s.setPanelSize);
  const commitPanelSizes = useStore((s) => s.commitPanelSizes);
  // Arrastrar el divisor cambia el alto de la tira; el ancho de cada miniatura sigue la proporción de la página.
  const aspect = doc.format.h / doc.format.w;
  const stripRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; first: number }> = [];
    doc.plan.pages.forEach((p, i) => {
      const last = out[out.length - 1];
      if (last && last.key === p.group) return;
      if (p.type === 'filler' && last) return;
      let label = p.group;
      if (p.group === 'front') label = t('nav.front');
      else if (p.group === 'back') label = t('nav.back');
      else if (p.group.startsWith('month:')) {
        const [y, m] = p.group.slice(6).split('-').map(Number);
        label = `${monthNames(doc.ctx.locale, 'short')[(m ?? 1) - 1]} ${String(y).slice(2)}`;
      }
      out.push({ key: p.group, label, first: i });
    });
    return out;
  }, [doc, t]);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-thumb="${current}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);

  return (
    <div className="border-t border-line bg-paper-2/70">
      <Splitter
        orientation="horizontal"
        label={t('panel.resize.thumbs')}
        value={thumbWidth}
        min={PANEL_LIMITS.thumbs.min}
        max={PANEL_LIMITS.thumbs.max}
        defaultValue={PANEL_LIMITS.thumbs.default}
        invert
        ratio={1 / aspect}
        onChange={(v) => setPanelSize('thumbs', v)}
        onCommit={commitPanelSizes}
      />
      <div className="scroll-thin flex gap-1 overflow-x-auto px-2 pt-1.5 text-[11px]">
        {groups.map((g) => (
          <button key={`${g.key}-${g.first}`} type="button" onClick={() => jumpToPage(g.first)} className="shrink-0 rounded px-1.5 py-0.5 font-semibold whitespace-nowrap text-ink-soft hover:bg-white hover:text-ink">
            {g.label}
          </button>
        ))}
      </div>
      <div ref={stripRef} className="scroll-thin flex gap-1.5 overflow-x-auto px-2 py-2">
        {doc.plan.pages.map((p, i) => (
          <ThumbButton key={p.key} doc={doc} index={i} current={current === i} width={Math.round(thumbWidth)} />
        ))}
      </div>
    </div>
  );
}

/** Una miniatura de la tira. Solo se vuelve a dibujar cuando cambia el documento, la página actual o el ancho. */
const ThumbButton = memo(function ThumbButton({ doc, index, current, width }: { doc: AgendaDocument; index: number; current: boolean; width: number }) {
  const t = useT();
  const plan = doc.plan.pages[index]!;
  return (
    <button
      type="button"
      data-thumb={index}
      onClick={() => jumpToPage(index)}
      onContextMenu={(e) => openMenuAt(e, thumbMenu(t, doc, index))}
      title={`${index + 1} · ${pageTitle(t, plan)}`}
      className={`flex shrink-0 flex-col items-center gap-0.5 ${index % 2 === 1 ? 'ml-1.5' : ''}`}
    >
      <span className={`block border ${current ? 'border-accent ring-2 ring-accent/40' : 'border-black/10'}`}>
        <Thumb doc={doc} index={index} width={width} />
      </span>
      <span className="text-[9.5px] text-ink-soft tabular-nums">{index + 1}</span>
    </button>
  );
});
