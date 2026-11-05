/** Tira de miniaturas agrupadas (inicio, cada mes, final) con navegación rápida. */
import type { AgendaDocument } from '@core/document';
import { monthNames } from '@core/calendar/locale';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { pageTitle, useT } from '../i18n/ui';
import { PANEL_LIMITS } from '../state/prefs';
import { useStore } from '../state/store';
import { monthMenu, stripGroupMenu, thumbMenu, type StripGroup } from './canvas/menus';
import { useHorizontalWheel } from '../state/wheel';
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
  const labelsRef = useRef<HTMLDivElement | null>(null);
  // Mes al que se limita la tira (las miniaturas de los demás se esconden), o ninguno.
  const [only, setOnly] = useState<string | null>(null);
  const groups = useMemo(() => {
    const out: StripGroup[] = [];
    doc.plan.pages.forEach((p, i) => {
      const last = out[out.length - 1];
      if (last && last.key === p.group) {
        last.pages.push(i);
        return;
      }
      // Un relleno junto al grupo anterior se cuenta con él.
      if (p.type === 'filler' && last) {
        last.pages.push(i);
        return;
      }
      let label = p.group;
      if (p.group === 'front') label = t('nav.front');
      else if (p.group === 'back') label = t('nav.back');
      else if (p.group.startsWith('month:')) {
        const [y, m] = p.group.slice(6).split('-').map(Number);
        label = `${monthNames(doc.ctx.locale, 'short')[(m ?? 1) - 1]} ${String(y).slice(2)}`;
      }
      out.push({ key: p.group, label, first: i, pages: [i] });
    });
    // «Año»: atajo al calendario anual, que está dentro de las páginas del inicio.
    const year = doc.plan.pages.findIndex((p) => p.type === 'yearOverview');
    if (year >= 0) {
      const at = Math.max(0, out.findIndex((g) => g.key === 'front') + 1);
      out.splice(at, 0, { key: 'year', label: t('nav.year'), first: year, pages: doc.plan.pages.flatMap((p) => (p.type === 'yearOverview' ? [p.index] : [])) });
    }
    return out;
  }, [doc, t]);

  // Si el mes elegido deja de existir (se ocultó), la tira vuelve a mostrar todo.
  useEffect(() => {
    if (only !== null && !groups.some((g) => g.key === only)) setOnly(null);
  }, [only, groups]);

  useHorizontalWheel(stripRef);
  useHorizontalWheel(labelsRef);
  // Las dos filas se desplazan juntas: el rótulo de un mes queda sobre sus miniaturas.
  useEffect(() => {
    const strip = stripRef.current;
    const labels = labelsRef.current;
    if (!strip || !labels) return;
    const sync = (from: HTMLElement, to: HTMLElement) => () => {
      const max = Math.max(1, from.scrollWidth - from.clientWidth);
      to.scrollLeft = (from.scrollLeft / max) * Math.max(0, to.scrollWidth - to.clientWidth);
    };
    const a = sync(strip, labels);
    strip.addEventListener('scroll', a, { passive: true });
    return () => strip.removeEventListener('scroll', a);
  }, [doc]);

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
      <div ref={labelsRef} className="scroll-thin flex gap-1 overflow-x-auto px-2 pt-1.5 text-[11px]">
        {only && (
          <button type="button" onClick={() => setOnly(null)} className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-semibold whitespace-nowrap text-accent hover:bg-accent/25">
            {t('nav.onlyChip', { month: groups.find((g) => g.key === only)?.label ?? '' })}
          </button>
        )}
        {groups.map((g) => (
          <button
            key={`${g.key}-${g.first}`}
            type="button"
            onClick={() => jumpToPage(g.first)}
            onContextMenu={(e) => openMenuAt(e, g.key.startsWith('month:') ? monthMenu(t, doc, g, { onlyHere: () => setOnly(g.key) }) : stripGroupMenu(t, doc, g))}
            className="shrink-0 rounded px-1.5 py-0.5 font-semibold whitespace-nowrap text-ink-soft hover:bg-white hover:text-ink"
          >
            {g.label}
          </button>
        ))}
      </div>
      <div ref={stripRef} className="scroll-thin flex gap-1.5 overflow-x-auto px-2 py-2">
        {doc.plan.pages.map((p, i) => (only === null || p.group === only ? <ThumbButton key={p.key} doc={doc} index={i} current={current === i} width={Math.round(thumbWidth)} /> : null))}
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
      onDoubleClick={() => useStore.getState().zoomFit()}
      aria-current={current ? 'page' : undefined}
      title={`${index + 1} · ${pageTitle(t, plan)}`}
      className={`flex shrink-0 flex-col items-center gap-0.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${index % 2 === 1 ? 'ml-1.5' : ''}`}
    >
      <span className={`block border ${current ? 'border-accent ring-2 ring-accent/40' : 'border-black/10'}`}>
        <Thumb doc={doc} index={index} width={width} />
      </span>
      <span className="text-[9.5px] text-ink-soft tabular-nums">{index + 1}</span>
    </button>
  );
});
