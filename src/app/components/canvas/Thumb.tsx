/**
 * Miniatura de página dibujada en Canvas, perezosa (solo cuando es visible) y sin repintar de más:
 * si el documento nuevo reutilizó la página (el mismo modelo), el lienzo ya tiene el dibujo correcto.
 */
import type { AgendaDocument } from '@core/document';
import { pagePrims } from '@core/document/layout';
import type { PageModel } from '@core/layout/prims';
import { memo, useEffect, useRef, useState } from 'react';
import { paintPrims } from '../../canvas/paint';
import { onAssetUrlsChange } from '../../state/assetUrls';
import { stats } from '../../state/stats';

const queue: Array<() => void> = [];
let running = false;

function schedule(job: () => void): void {
  queue.push(job);
  if (running) return;
  running = true;
  const tick = (): void => {
    const start = performance.now();
    while (queue.length > 0 && performance.now() - start < 12) queue.shift()!();
    if (queue.length > 0) requestAnimationFrame(tick);
    else running = false;
  };
  requestAnimationFrame(tick);
}

/** Lo último que se dibujó en un lienzo: con lo mismo, no hay nada que repintar. */
interface Painted {
  model: PageModel;
  width: number;
  height: number;
  pageWidth: number;
  tick: number;
}

export const Thumb = memo(function Thumb({ doc, index, width }: { doc: AgendaDocument; index: number; width: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const painted = useRef<Painted | null>(null);
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const pw = doc.format.w;
  const ph = doc.format.h;
  const height = Math.round((width * ph) / pw);
  // Cuando termina de prepararse la vista previa de una imagen o un PDF, se vuelve a dibujar.
  useEffect(() => onAssetUrlsChange(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Visible o no: fuera de la vista no se maqueta ni se dibuja nada.
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setVisible(last.isIntersecting);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    schedule(() => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      let model: PageModel;
      try {
        // En el turno de dibujo (no al renderizar): maquetar varias páginas no traba la interfaz.
        model = doc.page(index);
      } catch (err) {
        console.warn(err);
        return;
      }
      const last = painted.current;
      if (last && last.model === model && last.width === width && last.height === height && last.pageWidth === pw && last.tick === tick) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const k = (width * dpr) / pw;
      ctx.scale(k, k);
      try {
        paintPrims(ctx, pagePrims(model), doc.ctx.fonts, () => setTick((t) => t + 1));
      } catch (err) {
        console.warn(err);
      }
      painted.current = { model, width, height, pageWidth: pw, tick };
      stats.thumbPaints++;
    });
    return () => {
      cancelled = true;
    };
  }, [visible, doc, index, width, height, pw, tick]);

  return <canvas ref={ref} style={{ width, height }} className="block bg-white" aria-hidden="true" />;
});
