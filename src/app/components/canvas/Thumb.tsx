/** Miniatura de página dibujada en Canvas, perezosa (solo cuando es visible). */
import type { AgendaDocument } from '@core/document';
import { pagePrims } from '@core/document/layout';
import { useEffect, useRef, useState } from 'react';
import { paintPrims } from '../../canvas/paint';
import { onAssetUrlsChange } from '../../state/assetUrls';

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

export function Thumb({ doc, index, width }: { doc: AgendaDocument; index: number; width: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
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
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setVisible(true);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    schedule(() => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
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
        paintPrims(ctx, pagePrims(doc.page(index)), doc.ctx.fonts, () => setTick((t) => t + 1));
      } catch (err) {
        console.warn(err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, doc, index, width, height, pw, tick]);

  return <canvas ref={ref} style={{ width, height }} className="block bg-white" aria-hidden="true" />;
}
