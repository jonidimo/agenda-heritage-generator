/**
 * Página interactiva: SVG exacto (mismos glifos que el PDF) + capa de edición
 * con selección, arrastre con imán, redimensionado y guías de márgenes.
 */
import { blockBounds } from '@core/document/layout';
import type { AgendaDocument } from '@core/document';
import type { Block } from '@core/layout/prims';
import { pageInnerSvg } from '@core/render/svg';
import { fmt, type Rect } from '@core/util/geometry';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { moveBlock, scaleBlock } from '../../state/actions';
import { assetHref, onAssetUrlsChange } from '../../state/assetUrls';
import { useStore } from '../../state/store';

interface Props {
  doc: AgendaDocument;
  index: number;
  /** Píxeles por mm. */
  scale: number;
  interactive?: boolean;
}

interface Drag {
  block: Block;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origin: Rect;
  el: SVGGElement | null;
  baseTransform: string;
  dx: number;
  dy: number;
  factor: number;
  moved: boolean;
}

const SNAP_PX = 7;

export function PageView({ doc, index, scale, interactive = true }: Props) {
  const page = useMemo(() => doc.page(index), [doc, index]);
  const [assetTick, bumpAssets] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onAssetUrlsChange(bumpAssets), []);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [live, setLive] = useState<Rect | null>(null);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const scope = useStore((s) => s.scope);
  const showGuides = useStore((s) => s.guides);
  const snapOn = useStore((s) => s.snap);

  // Cambia de identidad cuando llega una vista previa de imagen/PDF: así se vuelve a dibujar la página.
  const hrefFor = useMemo(() => {
    void assetTick;
    return (key: string, kind: 'image' | 'pdf'): string | undefined => assetHref(key, kind);
  }, [assetTick]);
  const { body, defs } = useMemo(() => {
    const prefix = `g${index}x`;
    const { body: b, sink } = pageInnerSvg(page, { fonts: doc.ctx.fonts, assetHref: hrefFor, glyphPrefix: prefix, blockAttrs: interactive });
    return { body: b, defs: sink.defs(doc.ctx.fonts, prefix) };
  }, [page, doc, index, interactive, hrefFor]);

  const selected = selection && selection.pageKey === page.key ? page.blocks.find((b) => b.id === selection.blockId) : undefined;
  const selBounds = live ?? (selected ? blockBounds(selected) : null);

  const toMm = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * page.w, y: ((e.clientY - r.top) / r.height) * page.h };
  };

  const snapTargets = (exclude: string): { x: number[]; y: number[] } => {
    const c = page.content;
    const xs = [0, page.w, c.x, c.x + c.w, page.w / 2, c.x + c.w / 2];
    const ys = [0, page.h, c.y, c.y + c.h, page.h / 2, c.y + c.h / 2];
    for (const b of page.blocks) {
      if (b.id === exclude || b.role === 'chrome') continue;
      const r = blockBounds(b);
      if (r.w === 0 && r.h === 0) continue;
      xs.push(r.x, r.x + r.w, r.x + r.w / 2);
      ys.push(r.y, r.y + r.h, r.y + r.h / 2);
    }
    return { x: xs, y: ys };
  };

  const snap1 = (vals: number[], targets: number[], tol: number): { delta: number; hit: number | null } => {
    let best = { delta: 0, hit: null as number | null, dist: tol };
    for (const v of vals) {
      for (const t of targets) {
        const d = Math.abs(t - v);
        if (d < best.dist) best = { delta: t - v, hit: t, dist: d };
      }
    }
    return { delta: best.delta, hit: best.hit };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const target = (e.target as Element).closest('[data-block]');
    const handle = (e.target as Element).closest('[data-handle]');
    if (handle && selected) {
      const el = svgRef.current?.querySelector<SVGGElement>(`[data-block="${CSS.escape(selected.id)}"]`) ?? null;
      const p = toMm(e);
      drag.current = { block: selected, mode: 'resize', startX: p.x, startY: p.y, origin: blockBounds(selected), el, baseTransform: el?.getAttribute('transform') ?? '', dx: 0, dy: 0, factor: 1, moved: false };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    let block: Block | undefined;
    if (target) {
      const id = target.getAttribute('data-block') ?? '';
      block = page.blocks.find((b) => b.id === id);
    }
    if (!block) {
      // Clic en un hueco (entre letras o renglones): el bloque más chico cuya área contiene el punto.
      const p = toMm(e);
      const tol = 0.8;
      const hits = page.blocks
        .filter((b) => b.role !== 'chrome')
        .map((b) => ({ b, r: blockBounds(b) }))
        .filter(({ r }) => r.w > 0 && r.h > 0 && p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol)
        .sort((a, c) => Number(c.b.editable) - Number(a.b.editable) || a.r.w * a.r.h - c.r.w * c.r.h);
      block = hits[0]?.b;
    }
    if (!block) {
      select(null);
      return;
    }
    select({ pageKey: page.key, pageType: page.type, blockId: block.id, role: block.role });
    if (!block.editable) return;
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-block="${CSS.escape(block.id)}"]`) ?? null;
    const p = toMm(e);
    drag.current = { block, mode: 'move', startX: p.x, startY: p.y, origin: blockBounds(block), el, baseTransform: el?.getAttribute('transform') ?? '', dx: 0, dy: 0, factor: 1, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toMm(e);
    const tol = SNAP_PX / scale;
    if (d.mode === 'move') {
      let dx = p.x - d.startX;
      let dy = p.y - d.startY;
      const o = d.origin;
      let gx: number[] = [];
      let gy: number[] = [];
      if (snapOn && !e.altKey) {
        const t = snapTargets(d.block.id);
        const sx = snap1([o.x + dx, o.x + o.w / 2 + dx, o.x + o.w + dx], t.x, tol);
        const sy = snap1([o.y + dy, o.y + o.h / 2 + dy, o.y + o.h + dy], t.y, tol);
        dx += sx.delta;
        dy += sy.delta;
        gx = sx.hit !== null ? [sx.hit] : [];
        gy = sy.hit !== null ? [sy.hit] : [];
      }
      d.dx = dx;
      d.dy = dy;
      d.moved = d.moved || Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2;
      d.el?.setAttribute('transform', `translate(${fmt(dx)} ${fmt(dy)}) ${d.baseTransform}`);
      setGuides({ x: gx, y: gy });
      setLive({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h });
    } else {
      const o = d.origin;
      const w0 = Math.max(1, o.w);
      const h0 = Math.max(1, o.h);
      const factor = Math.max(0.1, Math.max((p.x - o.x) / w0, (p.y - o.y) / h0));
      d.factor = factor;
      d.moved = true;
      d.el?.setAttribute('transform', `translate(${fmt(o.x)} ${fmt(o.y)}) scale(${fmt(factor, 4)}) translate(${fmt(-o.x)} ${fmt(-o.y)}) ${d.baseTransform}`);
      setLive({ x: o.x, y: o.y, w: o.w * factor, h: o.h * factor });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    setLive(null);
    if (!d || !d.moved) return;
    if (d.mode === 'move') moveBlock(page, d.block, d.dx, d.dy, scope);
    else scaleBlock(page, d.block, d.factor, scope);
  };

  const w = page.w * scale;
  const h = page.h * scale;
  const c = page.content;
  return (
    <div className="page-shadow relative shrink-0 bg-white" style={{ width: w, height: h }} data-page-index={index}>
      <svg
        ref={svgRef}
        width={w}
        height={h}
        viewBox={`0 0 ${page.w} ${page.h}`}
        className="block touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`${page.title} — ${index + 1}`}
      >
        <defs dangerouslySetInnerHTML={{ __html: defs }} />
        <g dangerouslySetInnerHTML={{ __html: body }} />
        {showGuides && (
          <g pointerEvents="none">
            <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke="#3b82f6" strokeWidth={0.6 / scale} strokeDasharray={`${3 / scale} ${2 / scale}`} />
            <line x1={page.side === 'recto' ? 0.4 : page.w - 0.4} y1={0} x2={page.side === 'recto' ? 0.4 : page.w - 0.4} y2={page.h} stroke="#d97706" strokeWidth={1.5 / scale} />
          </g>
        )}
        {guides.x.map((x) => (
          <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={page.h} stroke="#e11d48" strokeWidth={1 / scale} pointerEvents="none" />
        ))}
        {guides.y.map((y) => (
          <line key={`gy${y}`} x1={0} y1={y} x2={page.w} y2={y} stroke="#e11d48" strokeWidth={1 / scale} pointerEvents="none" />
        ))}
        {interactive && selBounds && (
          <g>
            <rect x={selBounds.x - 0.6} y={selBounds.y - 0.6} width={selBounds.w + 1.2} height={selBounds.h + 1.2} fill="none" stroke="#4f6b3a" strokeWidth={1.4 / scale} strokeDasharray={selected?.editable === false ? `${3 / scale} ${2 / scale}` : undefined} pointerEvents="none" />
            {selected?.editable !== false && (
              <rect data-handle="resize" x={selBounds.x + selBounds.w + 0.6 - 5 / scale} y={selBounds.y + selBounds.h + 0.6 - 5 / scale} width={10 / scale} height={10 / scale} fill="#ffffff" stroke="#4f6b3a" strokeWidth={1.4 / scale} style={{ cursor: 'nwse-resize' }} />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
