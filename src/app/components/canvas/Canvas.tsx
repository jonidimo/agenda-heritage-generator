/** Área central: página, pliego, hoja impresa (frente/dorso) o libro completo. */
import type { AgendaDocument } from '@core/document';
import { primsToSvg, GlyphSink } from '@core/render/svg';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pageTitle, useT } from '../../i18n/ui';
import { assetHref } from '../../state/assetUrls';
import { pageStep, spreadOf } from '../../state/paging';
import { useStore } from '../../state/store';
import { IconButton } from '../ui';
import { ErrorBoundary, ViewError } from '../ErrorBoundary';
import { PageView } from './PageView';
import { Thumb } from './Thumb';
import { jumpToPage } from '../../state/navigation';

function useSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * `live` es el documento que se ve (con la vista previa de lo que se está arrastrando); `committed`,
 * el confirmado, para el libro de miniaturas, que no se redibuja en cada cuadro del arrastre.
 */
export function Canvas({ committed, live }: { committed: AgendaDocument; live: AgendaDocument }) {
  const t = useT();
  const view = useStore((s) => s.view);
  const pageIndex = useStore((s) => Math.min(s.pageIndex, live.pageCount - 1));
  const goToPage = useStore((s) => s.goToPage);
  const zoom = useStore((s) => s.zoom);
  const fit = useStore((s) => s.fit);
  const [ref, size] = useSize();
  const pad = 48;

  // Un pliego con una sola página (la primera o la última) se muestra como página suelta, centrada.
  const [spreadL, spreadR] = spreadOf(pageIndex, live.pageCount);
  const singleSpread = view === 'spread' && (spreadL === null || spreadR === null);
  const contentMm =
    view === 'page' || singleSpread ? { w: live.format.w, h: live.format.h } : view === 'spread' ? { w: live.format.w * 2, h: live.format.h } : { w: live.format.sheetW, h: live.format.sheetH };
  const fitScale = Math.max(0.5, Math.min((size.w - pad) / contentMm.w, (size.h - pad - 40) / contentMm.h));
  const scale = fit ? fitScale : fitScale * zoom;

  const prev = (): void => goToPage(pageStep(view, pageIndex, live.pageCount, -1));
  const next = (): void => goToPage(pageStep(view, pageIndex, live.pageCount, 1));

  const plan = live.plan.pages[pageIndex];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Centrado con márgenes automáticos: al acercar, todo el contenido sigue alcanzable con el desplazamiento. */}
      <div ref={ref} className="desk scroll-thin relative flex min-h-0 flex-1 overflow-auto">
        {view === 'book' ? (
          <BookView doc={committed} />
        ) : view === 'sheet' ? (
          <div className="m-auto">
            <SheetView doc={live} index={pageIndex} scale={scale} />
          </div>
        ) : view === 'page' ? (
          <div className="m-auto p-6">
            <SafePage doc={live} index={pageIndex} scale={scale} />
          </div>
        ) : (
          <div className="m-auto">
            <SpreadView doc={live} index={pageIndex} scale={scale} />
          </div>
        )}
      </div>
      {view !== 'book' && (
        <div className="flex items-center justify-center gap-2 border-t border-line bg-paper/90 px-3 py-1.5 text-[12px]">
          <IconButton label="←" onClick={prev} disabled={pageIndex === 0}>
            <ChevronLeft size={18} />
          </IconButton>
          <span className="min-w-[220px] text-center text-ink-soft tabular-nums">
            {t('nav.page', { n: pageIndex + 1 })} / {live.pageCount} · {plan ? pageTitle(t, plan) : ''}
          </span>
          <IconButton label="→" onClick={next} disabled={pageIndex >= live.pageCount - 1}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

/** Una página que no se puede dibujar ocupa su lugar con el motivo; la otra del pliego se sigue viendo. */
function SafePage({ doc, index, scale }: { doc: AgendaDocument; index: number; scale: number }) {
  const t = useT();
  return (
    <ErrorBoundary
      resetKeys={[doc, index]}
      fallback={(e) => (
        <div className="page-shadow flex bg-white" style={{ width: doc.format.w * scale, height: doc.format.h * scale }}>
          <ViewError error={e} message={t('view.pageError', { n: index + 1 })} />
        </div>
      )}
    >
      <PageView doc={doc} index={index} scale={scale} />
    </ErrorBoundary>
  );
}

function SpreadView({ doc, index, scale }: { doc: AgendaDocument; index: number; scale: number }) {
  const [left, right] = spreadOf(index, doc.pageCount);
  const h = doc.format.h * scale;
  if (left === null || right === null) {
    const only = left ?? right;
    return <div className="p-6">{only !== null && <SafePage doc={doc} index={only} scale={scale} />}</div>;
  }
  return (
    <div className="flex p-6">
      <SafePage doc={doc} index={left} scale={scale} />
      <div className="w-px bg-black/20" style={{ height: h }} aria-hidden="true" />
      <SafePage doc={doc} index={right} scale={scale} />
    </div>
  );
}

function SheetView({ doc, index, scale }: { doc: AgendaDocument; index: number; scale: number }) {
  const t = useT();
  const sideWanted = useStore((s) => s.sheetSide);
  const setSide = useStore((s) => s.setSheetSide);
  const sides = doc.sides();
  const containing = doc.sideOfPage(index);
  const sheetNo = containing?.sheet ?? 0;
  const side = sides.find((s) => s.sheet === sheetNo && s.side === sideWanted) ?? containing ?? sides[0];
  const svg = useMemo(() => {
    if (!side) return '';
    const r = doc.sheet(side, { guides: false });
    const sink = new GlyphSink();
    const body = primsToSvg(r.prims, { fonts: doc.ctx.fonts, assetHref }, sink, 'sh');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${r.w * scale}" height="${r.h * scale}" viewBox="0 0 ${r.w} ${r.h}"><defs>${sink.defs(doc.ctx.fonts, 'sh')}</defs><rect width="${r.w}" height="${r.h}" fill="#fff"/>${body}</svg>`;
  }, [doc, side, scale]);
  if (!side) return null;
  const totalSheets = doc.plan.signatures.totalSheets;
  return (
    <div className="flex flex-col items-center gap-3 p-6">
      <div className="flex items-center gap-3 text-[12px] text-ink-soft">
        <span>{t('sheet.info', { sheet: side.sheet + 1, total: totalSheets, sig: side.signature + 1, i: side.sheetInSignature + 1, n: side.sheetsInSignature })}</span>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 font-semibold text-ink hover:bg-paper" onClick={() => setSide(side.side === 'front' ? 'back' : 'front')}>
          <RefreshCw size={13} /> {t('sheet.flip')} · {side.side === 'front' ? t('sheet.front') : t('sheet.back')}
        </button>
      </div>
      <div
        className="page-shadow cursor-pointer bg-white"
        dangerouslySetInnerHTML={{ __html: svg }}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const xView = ((e.clientX - r.left) / r.width) * doc.format.sheetW;
          // Con el dorso girado 180°, la mitad izquierda que se ve es la derecha de la hoja.
          const xMm = side.rotate180 ? doc.format.sheetW - xView : xView;
          const slot = side.slots.find((s) => xMm >= s.x && xMm <= s.x + s.w);
          if (slot && slot.page !== null) jumpToPage(slot.page);
        }}
      />
      <div className="grid text-center text-[11.5px] text-ink-soft" style={{ width: doc.format.sheetW * scale, gridTemplateColumns: `repeat(${side.slots.length}, 1fr)` }}>
        {(side.rotate180 ? [...side.slots].reverse() : side.slots).map((s, i) => (
          <span key={i}>{s.page !== null ? t('nav.page', { n: s.page + 1 }) : '—'}</span>
        ))}
      </div>
    </div>
  );
}

function BookView({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const setView = useStore((s) => s.setView);
  const current = useStore((s) => s.pageIndex);
  const width = 92;
  const items = Array.from({ length: doc.pageCount }, (_, i) => i);
  return (
    <div className="flex w-full flex-wrap content-start justify-center gap-x-1 gap-y-4 self-start p-6">
      {items.map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            jumpToPage(i);
            setView('spread');
          }}
          className={`flex flex-col items-center gap-1 ${i % 2 === 1 ? 'ml-3' : ''}`}
          title={doc.plan.pages[i] ? pageTitle(t, doc.plan.pages[i]!) : undefined}
        >
          <span className={`page-shadow block ${current === i ? 'ring-2 ring-accent' : ''}`}>
            <Thumb doc={doc} index={i} width={width} />
          </span>
          <span className="text-[10.5px] text-ink-soft tabular-nums">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
