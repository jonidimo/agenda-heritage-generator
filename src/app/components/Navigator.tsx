/** Tira de miniaturas agrupadas (inicio, cada mes, final) con navegación rápida. */
import type { AgendaDocument } from '@core/document';
import { monthNames } from '@core/calendar/locale';
import { useEffect, useMemo, useRef } from 'react';
import { pageTitle, useT } from '../i18n/ui';
import { useStore } from '../state/store';
import { Thumb } from './canvas/Thumb';

export function Navigator({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const current = useStore((s) => s.pageIndex);
  const goToPage = useStore((s) => s.goToPage);
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
      <div className="scroll-thin flex gap-1 overflow-x-auto px-2 pt-1.5 text-[11px]">
        {groups.map((g) => (
          <button key={`${g.key}-${g.first}`} type="button" onClick={() => goToPage(g.first)} className="shrink-0 rounded px-1.5 py-0.5 font-semibold whitespace-nowrap text-ink-soft hover:bg-white hover:text-ink">
            {g.label}
          </button>
        ))}
      </div>
      <div ref={stripRef} className="scroll-thin flex gap-1.5 overflow-x-auto px-2 py-2">
        {doc.plan.pages.map((p, i) => (
          <button
            key={p.key}
            type="button"
            data-thumb={i}
            onClick={() => goToPage(i)}
            title={`${i + 1} · ${pageTitle(t, p)}`}
            className={`flex shrink-0 flex-col items-center gap-0.5 ${i % 2 === 1 ? 'ml-1.5' : ''}`}
          >
            <span className={`block border ${current === i ? 'border-accent ring-2 ring-accent/40' : 'border-black/10'}`}>
              <Thumb doc={doc} index={i} width={46} />
            </span>
            <span className="text-[9.5px] text-ink-soft tabular-nums">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
