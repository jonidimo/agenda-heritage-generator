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
import { clampMoveDelta, moveBlock, scaleBlock } from '../../state/actions';
import { assetHref, onAssetUrlsChange } from '../../state/assetUrls';
import { useT } from '../../i18n/ui';
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
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  origin: Rect;
  el: SVGGElement | null;
  baseTransform: string | null;
  dx: number;
  dy: number;
  factor: number;
  moved: boolean;
}

const SNAP_PX = 7;
/** Movimiento mínimo (px de pantalla) para que un clic se convierta en arrastre. */
const DRAG_START_PX = 3;

export function PageView({ doc, index, scale, interactive = true }: Props) {
  const page = useMemo(() => doc.page(index), [doc, index]);
  const [assetTick, bumpAssets] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onAssetUrlsChange(bumpAssets), []);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [live, setLive] = useState<Rect | null>(null);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const scope = useStore((s) => s.scope);
  const showGuides = useStore((s) => s.guides);
  const snapOn = useStore((s) => s.snap);
  const t = useT();

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

  /** Un bloque que entra en la página no se puede llevar fuera (el documento lo acomodaría igual). */
  const clampMove = (o: Rect, dx: number, dy: number): { dx: number; dy: number } => clampMoveDelta(page, o, dx, dy);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, block: Block, mode: 'move' | 'resize'): void => {
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-block="${CSS.escape(block.id)}"]`) ?? null;
    const p = toMm(e);
    drag.current = {
      block,
      mode,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: p.x,
      startY: p.y,
      origin: blockBounds(block),
      el,
      baseTransform: el?.getAttribute('transform') ?? null,
      dx: 0,
      dy: 0,
      factor: 1,
      moved: false,
    };
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || drag.current) return;
    // Solo el puntero principal y el botón izquierdo: un segundo dedo (pellizco) o el botón derecho no arrastran.
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const touch = e.pointerType === 'touch';
    let target = e.target as Element | null;
    if (target?.closest('[data-handle]') && selected?.editable) return startDrag(e, selected, 'resize');
    if (target?.closest('[data-sel-surface]')) {
      // Con el dedo se arrastra lo que ya está seleccionado; con ratón o lápiz cuenta lo que hay debajo.
      if (touch && selected?.editable) return startDrag(e, selected, 'move');
      target = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n !== e.target && svgRef.current?.contains(n)) ?? null;
    }
    let block: Block | undefined;
    const hit = target?.closest('[data-block]');
    if (hit) {
      const id = hit.getAttribute('data-block') ?? '';
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
    // Con el dedo, el primer toque solo selecciona: así el mismo gesto sigue desplazando la página.
    if (!block.editable || touch) return;
    startDrag(e, block, 'move');
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Unos píxeles de movimiento real antes de arrastrar: un clic con temblor no mueve ni encaja nada.
    if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_START_PX) return;
    d.moved = true;
    const p = toMm(e);
    const tol = SNAP_PX / scale;
    const base = d.baseTransform ?? '';
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
      ({ dx, dy } = clampMove(o, dx, dy));
      d.dx = dx;
      d.dy = dy;
      d.el?.setAttribute('transform', `translate(${fmt(dx)} ${fmt(dy)}) ${base}`);
      setGuides({ x: gx, y: gy });
      setLive({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h });
    } else {
      const o = d.origin;
      const w0 = Math.max(1, o.w);
      const h0 = Math.max(1, o.h);
      const factor = Math.max(0.1, Math.max((p.x - o.x) / w0, (p.y - o.y) / h0));
      d.factor = factor;
      d.el?.setAttribute('transform', `translate(${fmt(o.x)} ${fmt(o.y)}) scale(${fmt(factor, 4)}) translate(${fmt(-o.x)} ${fmt(-o.y)}) ${base}`);
      setLive({ x: o.x, y: o.y, w: o.w * factor, h: o.h * factor });
    }
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    // La vista previa vuelve a su lugar: la posición final la dibuja el documento (aunque no cambie).
    if (d.el) {
      if (d.baseTransform === null) d.el.removeAttribute('transform');
      else d.el.setAttribute('transform', d.baseTransform);
    }
    setGuides({ x: [], y: [] });
    setLive(null);
    if (!commit || !d.moved) return;
    if (d.mode === 'move') moveBlock(page, d.block, d.dx, d.dy, scope);
    else scaleBlock(page, d.block, d.factor, scope);
  };

  const w = page.w * scale;
  const h = page.h * scale;
  const c = page.content;
  return (
    <div
      ref={wrapRef}
      className="page-shadow relative shrink-0 bg-white"
      style={{ width: w, height: h }}
      data-page-index={index}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t('page.keys', { n: index + 1 }) : undefined}
      onKeyDown={(e) => {
        // Teclado: [ y ] recorren los elementos editables de la página (las flechas los mueven).
        if (!interactive || (e.key !== '[' && e.key !== ']')) return;
        const list = page.blocks.filter((b) => b.editable && b.role !== 'chrome');
        if (list.length === 0) return;
        const cur = selected ? list.findIndex((b) => b.id === selected.id) : -1;
        const next = list[(cur + (e.key === ']' ? 1 : -1) + list.length) % list.length]!;
        select({ pageKey: page.key, pageType: page.type, blockId: next.id, role: next.role });
        e.preventDefault();
      }}
    >
      <svg
        ref={svgRef}
        width={w}
        height={h}
        viewBox={`0 0 ${page.w} ${page.h}`}
        className="block select-none"
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
          </g>
        )}
      </svg>
      {interactive && selBounds && selected?.editable && (
        <>
          {/* Capa del elemento seleccionado: con el dedo se arrastra desde acá sin desplazar la página. */}
          <div data-sel-surface="" className="absolute cursor-move" style={{ left: selBounds.x * scale, top: selBounds.y * scale, width: selBounds.w * scale, height: selBounds.h * scale, touchAction: 'none' }} />
          <div
            data-handle="resize"
            className="absolute rounded-sm border-2 border-accent bg-white"
            style={{ left: (selBounds.x + selBounds.w) * scale - 9, top: (selBounds.y + selBounds.h) * scale - 9, width: 18, height: 18, touchAction: 'none', cursor: 'nwse-resize' }}
          />
        </>
      )}
    </div>
  );
}
