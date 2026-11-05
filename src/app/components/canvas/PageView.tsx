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
import { unionRect } from '@core/layout/align';
import { clampMoveDelta, moveBlocks, resizeRecipeFor, scaleBlock } from '../../state/actions';
import { hasSideHandles } from '@core/layout/handles';
import { frameThrottle, type FrameThrottle } from '../../state/frame';
import { MIN_BOX } from '@core/layout/box';
import { HANDLES, resizeRect, type Handle } from '@core/layout/resize';
import { openMenuAt } from '../ContextMenu';
import { blockMenu, multiMenu, pageMenu, zoneMenu } from './menus';
import { editableInPlace, TextEditor } from './TextEditor';
import { assetHref, onAssetUrlsChange } from '../../state/assetUrls';
import { useT } from '../../i18n/ui';
import { useStore, type Selection } from '../../state/store';
import { printGuides } from '@core/document/binding';
import { jumpToPage } from '../../state/navigation';
import { currentUiZoom } from '../../state/uiScale';

interface Props {
  doc: AgendaDocument;
  index: number;
  /** Píxeles por mm. */
  scale: number;
  interactive?: boolean;
}

interface Drag {
  block: Block;
  mode: 'move' | 'resize' | 'marquee';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  origin: Rect;
  /** Elementos que se mueven (uno, o todos los seleccionados). */
  parts: Array<{ block: Block; el: SVGGElement | null; base: string | null; origin: Rect }>;
  /** Recuadro con Ctrl/Mayús: suma a la selección. */
  additive: boolean;
  dx: number;
  dy: number;
  factor: number;
  /** Tirador con el que se redimensiona y caja resultante (elementos propios). */
  handle: Handle;
  box: Rect | null;
  moved: boolean;
  /** Bloque del programa que se reacomoda en su caja nueva: la vista previa sale del documento, no de una transformación. */
  reflow: boolean;
  /** Entrega la caja a la vista previa a lo sumo una vez por cuadro. */
  push: FrameThrottle<Rect> | null;
}

const SNAP_PX = 7;
/** Alto o ancho (px) por debajo del cual los tiradores de los lados se corren hacia afuera, y cuánto. */
const SIDE_ROOM_PX = 44;
const SIDE_OUTSET_PX = 12;
/** Clave que liga la vista previa de un redimensionado con su confirmación. */
const reflowKey = (page: { key: string }, block: Block): string => `box:${page.key}:${block.id}`;
const RESIZE_CURSOR: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
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
  const [liveDelta, setLiveDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /** Elemento cuyo texto se edita en su lugar. */
  const [editing, setEditing] = useState<string | null>(null);
  // Pedido de editar un texto desde el teclado (F2 / Enter): la página que lo tiene lo atiende.
  const textEditRequest = useStore((s) => s.textEditRequest);
  useEffect(() => {
    if (!textEditRequest || textEditRequest.pageKey !== page.key) return;
    useStore.getState().requestTextEdit(null);
    const target = page.blocks.find((b) => b.id === textEditRequest.blockId);
    if (target && editableInPlace(target)) setEditing(target.id);
  }, [textEditRequest, page]);
  const selection = useStore((s) => s.selection);
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const setSelection = useStore((s) => s.setSelection);
  const setLinkArea = useStore((s) => s.setLinkArea);
  const scope = useStore((s) => s.scope);
  const showGuides = useStore((s) => s.guides);
  // En el modo «Impresión» se ve la franja que la impresora no imprime y la que se reserva para coser.
  const printMode = useStore((s) => s.mode === 'print');
  const press = printMode && interactive && !doc.screen ? printGuides(doc.binding, page) : null;
  const snapOn = useStore((s) => s.snap);
  const showLinks = useStore((s) => s.showLinks);
  const t = useT();
  // Zonas tocables del PDF de páginas: se ven en celeste y un clic lleva al destino, como en el lector.
  const links = useMemo(() => (showLinks && interactive ? doc.links(index) : []), [showLinks, interactive, doc, index]);
  const linkTarget = (l: (typeof links)[number]): string => (l.page !== undefined ? `→ ${doc.pageLabel(l.page)} · ${t('nav.page', { n: l.page + 1 })}` : `→ ${l.url ?? ''}`);
  const linkTitle = (l: (typeof links)[number]): string => `${linkTarget(l)} (${t('link.followHint')})`;
  const followLink = (l: (typeof links)[number]): void => {
    if (l.page !== undefined) jumpToPage(l.page);
    else if (l.url) window.open(l.url, '_blank', 'noopener,noreferrer');
  };
  /**
   * Doble clic: sigue el enlace que hay bajo el puntero (el más chico, si se superponen). Se resuelve
   * acá y no en cada zona: un elemento ya elegido tiene encima su capa de arrastre y el segundo clic
   * no llegaría al botón del enlace.
   */
  const followLinkAt = (e: React.MouseEvent): boolean => {
    if (links.length === 0) return false;
    const p = toMm(e);
    const hit = links
      .filter((l) => p.x >= l.rect.x && p.x <= l.rect.x + l.rect.w && p.y >= l.rect.y && p.y <= l.rect.y + l.rect.h)
      .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0];
    if (hit) followLink(hit);
    return Boolean(hit);
  };
  /** Doble clic: el enlace que hay bajo el puntero y, si no hay, edita el texto del elemento en su lugar. */
  const onDoubleClick = (e: React.MouseEvent): void => {
    if (followLinkAt(e) || !interactive) return;
    const block = blockAt(e);
    if (!block || !editableInPlace(block)) return;
    select(selOf(block));
    setEditing(block.id);
  };

  // Cambia de identidad cuando llega una vista previa de imagen/PDF: así se vuelve a dibujar la página.
  const hrefFor = useMemo(() => {
    void assetTick;
    return (key: string, kind: 'image' | 'pdf'): string | undefined => assetHref(key, kind);
  }, [assetTick]);
  // Depende del modelo de la página y no del documento: si el documento nuevo reutilizó la página, el dibujo es el mismo.
  const fonts = doc.ctx.fonts;
  const { body, defs } = useMemo(() => {
    const prefix = `g${index}x`;
    const { body: b, sink } = pageInnerSvg(page, { fonts, assetHref: hrefFor, glyphPrefix: prefix, blockAttrs: interactive });
    return { body: b, defs: sink.defs(fonts, prefix) };
  }, [page, fonts, index, interactive, hrefFor]);

  const selected = selection && selection.pageKey === page.key ? page.blocks.find((b) => b.id === selection.blockId) : undefined;
  // Selección múltiple de esta página (incluye el principal).
  const group = useMemo(
    () => (selection && selection.pageKey === page.key ? page.blocks.filter((b) => selectedIds.includes(b.id)) : []),
    [selection, selectedIds, page],
  );
  const single = group.length <= 1;
  const selBounds = live ?? (selected ? blockBounds(selected) : null);

  const toMm = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * page.w, y: ((e.clientY - r.top) / r.height) * page.h };
  };

  const snapTargets = (exclude: ReadonlySet<string>): { x: number[]; y: number[] } => {
    const c = page.content;
    const xs = [0, page.w, c.x, c.x + c.w, page.w / 2, c.x + c.w / 2];
    const ys = [0, page.h, c.y, c.y + c.h, page.h / 2, c.y + c.h / 2];
    for (const b of page.blocks) {
      if (exclude.has(b.id) || b.role === 'chrome') continue;
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

  const selOf = (b: Block): Selection => ({ pageKey: page.key, pageType: page.type, blockId: b.id, role: b.role });

  /** Elemento bajo el puntero (atravesando la capa de selección); en un hueco, el más chico que lo contiene. */
  const blockAt = (e: { clientX: number; clientY: number; target: EventTarget | null }): Block | undefined => {
    let target = e.target as Element | null;
    if (target?.closest('[data-sel-surface]') || target?.closest('[data-handle]'))
      target = document.elementsFromPoint(e.clientX, e.clientY).find((n) => svgRef.current?.contains(n)) ?? null;
    const hit = target?.closest('[data-block]');
    if (hit) {
      const id = hit.getAttribute('data-block') ?? '';
      const b = page.blocks.find((x) => x.id === id);
      if (b) return b;
    }
    const p = toMm(e);
    const tol = 0.8;
    return page.blocks
      .filter((b) => b.role !== 'chrome')
      .map((b) => ({ b, r: blockBounds(b) }))
      .filter(({ r }) => r.w > 0 && r.h > 0 && p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol)
      .sort((a, c) => Number(c.b.editable) - Number(a.b.editable) || a.r.w * a.r.h - c.r.w * c.r.h)[0]?.b;
  };

  /** Ctrl/Mayús + clic: suma o quita un elemento de la selección. */
  const toggle = (b: Block): void => {
    const ids = selection?.pageKey === page.key ? selectedIds : [];
    if (!ids.includes(b.id)) return setSelection(selOf(b), [...ids, b.id]);
    const rest = ids.filter((i) => i !== b.id);
    const primary = [...rest].reverse().map((i) => page.blocks.find((x) => x.id === i)).find(Boolean);
    if (primary) setSelection(selOf(primary), rest);
    else select(null);
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, block: Block, mode: 'move' | 'resize', members: Block[] = [block], handle: Handle = 'se'): void => {
    const p = toMm(e);
    const parts = members
      .filter((b) => b.editable)
      .map((b) => {
        const el = svgRef.current?.querySelector<SVGGElement>(`[data-block="${CSS.escape(b.id)}"]`) ?? null;
        return { block: b, el, base: el?.getAttribute('transform') ?? null, origin: blockBounds(b) };
      });
    const reflow = mode === 'resize' && hasSideHandles(block);
    drag.current = {
      block,
      mode,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: p.x,
      startY: p.y,
      origin: mode === 'resize' ? blockBounds(block) : unionRect(parts.map((m) => m.origin)),
      parts,
      dx: 0,
      dy: 0,
      factor: 1,
      handle,
      box: null,
      moved: false,
      additive: false,
      reflow,
      push: reflow ? frameThrottle((r: Rect) => useStore.getState().preview(resizeRecipeFor(page, block, r, scope), reflowKey(page, block))) : null,
    };
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || drag.current) return;
    // Solo el puntero principal y el botón izquierdo: un segundo dedo (pellizco) o el botón derecho no arrastran.
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const touch = e.pointerType === 'touch';
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const target = e.target as Element | null;
    const grip = target?.closest('[data-handle]')?.getAttribute('data-handle') as Handle | null | undefined;
    if (grip && selected?.editable && single) return startDrag(e, selected, 'resize', [selected], grip);
    // Con el dedo se arrastra lo que ya está seleccionado (sin que la página se desplace).
    if (target?.closest('[data-sel-surface]') && touch && selected?.editable && !additive) return startDrag(e, selected, 'move');
    const block = blockAt(e);
    if (!block) {
      if (touch) {
        if (!additive) select(null);
        return;
      }
      // Recuadro de selección desde un lugar vacío.
      const p = toMm(e);
      drag.current = { block: page.blocks[0]!, mode: 'marquee', pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y, origin: { x: p.x, y: p.y, w: 0, h: 0 }, parts: [], dx: 0, dy: 0, factor: 1, handle: 'se', box: null, moved: false, additive, reflow: false, push: null };
      wrapRef.current?.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (additive) {
      toggle(block);
      e.preventDefault();
      return;
    }
    const inGroup = group.length > 1 && group.some((b) => b.id === block.id);
    if (inGroup) setSelection(selOf(block), selectedIds);
    else select(selOf(block));
    // Con el dedo, el primer toque solo selecciona: así el mismo gesto sigue desplazando la página.
    if (!block.editable || touch) return;
    startDrag(e, block, 'move', inGroup ? group : [block]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Unos píxeles de movimiento real antes de arrastrar: un clic con temblor no mueve ni encaja nada.
    if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_START_PX) return;
    d.moved = true;
    const p = toMm(e);
    if (d.mode === 'marquee') {
      setMarquee({ x: Math.min(d.startX, p.x), y: Math.min(d.startY, p.y), w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY) });
      return;
    }
    // El imán se mide en píxeles de pantalla: con zoom de interfaz, un milímetro ocupa scale × zoom.
    const tol = SNAP_PX / (scale * currentUiZoom());
    if (d.mode === 'move') {
      let dx = p.x - d.startX;
      let dy = p.y - d.startY;
      const o = d.origin;
      let gx: number[] = [];
      let gy: number[] = [];
      if (snapOn && !e.altKey) {
        const t = snapTargets(new Set(d.parts.map((m) => m.block.id)));
        const sx = snap1([o.x + dx, o.x + o.w / 2 + dx, o.x + o.w + dx], t.x, tol);
        const sy = snap1([o.y + dy, o.y + o.h / 2 + dy, o.y + o.h + dy], t.y, tol);
        dx += sx.delta;
        dy += sy.delta;
        gx = sx.hit !== null ? [sx.hit] : [];
        gy = sy.hit !== null ? [sy.hit] : [];
      }
      // El grupo entero queda dentro de la página.
      ({ dx, dy } = clampMoveDelta(page, o, dx, dy));
      d.dx = dx;
      d.dy = dy;
      for (const m of d.parts) m.el?.setAttribute('transform', `translate(${fmt(dx)} ${fmt(dy)}) ${m.base ?? ''}`);
      setGuides({ x: gx, y: gy });
      setLiveDelta({ dx, dy });
      if (d.parts.length === 1) setLive({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h });
    } else {
      const o = d.origin;
      const m = d.parts[0];
      const pageBox = { x: 0, y: 0, w: page.w, h: page.h };
      // Un elemento propio cambia de ancho y alto por separado; los demás (composiciones del diseño)
      // solo en proporción. Mayús mantiene la proporción también en los propios.
      const free = d.block.role === 'custom' || d.reflow;
      const r = resizeRect(o, free ? d.handle : 'se', p.x - d.startX, p.y - d.startY, { keepAspect: !free || e.shiftKey, min: MIN_BOX, bounds: pageBox });
      d.box = r;
      if (d.reflow) {
        // El contenido se reacomoda en la caja nueva: la vista previa es la página maquetada otra vez.
        d.push?.push(r);
        setLive(r);
        return;
      }
      d.factor = r.w / Math.max(0.01, o.w);
      const sx = r.w / Math.max(0.01, o.w);
      const sy = r.h / Math.max(0.01, o.h);
      m?.el?.setAttribute('transform', `translate(${fmt(r.x)} ${fmt(r.y)}) scale(${fmt(sx, 4)} ${fmt(sy, 4)}) translate(${fmt(-o.x)} ${fmt(-o.y)}) ${m.base ?? ''}`);
      setLive(r);
    }
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (d.reflow) {
      setLive(null);
      setGuides({ x: [], y: [] });
      if (commit && d.moved && d.box) {
        // Lo último que se movió llega a la vista previa antes de confirmarla (la confirmación la adopta).
        d.push?.flush();
        useStore.getState().commit(resizeRecipeFor(page, d.block, d.box, scope), reflowKey(page, d.block));
      } else {
        d.push?.cancel();
        useStore.getState().clearPreview();
      }
      return;
    }
    if (d.mode === 'marquee') {
      setMarquee(null);
      if (!commit) return;
      if (!d.moved) {
        if (!d.additive) select(null);
        return;
      }
      const p = toMm(e);
      const r = { x: Math.min(d.startX, p.x), y: Math.min(d.startY, p.y), w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY) };
      // Entran los elementos que quedan completos dentro del recuadro.
      const inside = page.blocks.filter((b) => {
        if (!b.editable || b.role === 'chrome') return false;
        const q = blockBounds(b);
        return q.w > 0 && q.x >= r.x && q.y >= r.y && q.x + q.w <= r.x + r.w && q.y + q.h <= r.y + r.h;
      });
      const before = d.additive && selection?.pageKey === page.key ? selectedIds : [];
      const ids = [...new Set([...before, ...inside.map((b) => b.id)])];
      const primary = inside[inside.length - 1] ?? page.blocks.find((b) => b.id === before[before.length - 1]);
      if (primary && ids.length > 0) setSelection(selOf(primary), ids);
      else if (!d.additive) select(null);
      return;
    }
    // La vista previa vuelve a su lugar: la posición final la dibuja el documento (aunque no cambie).
    for (const m of d.parts) {
      if (!m.el) continue;
      if (m.base === null) m.el.removeAttribute('transform');
      else m.el.setAttribute('transform', m.base);
    }
    setGuides({ x: [], y: [] });
    setLive(null);
    setLiveDelta(null);
    if (!commit || !d.moved) return;
    if (d.mode === 'move') moveBlocks(page, d.parts.map((m) => ({ block: m.block, dx: d.dx, dy: d.dy })), scope);
    else scaleBlock(page, d.block, d.factor, scope);
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!interactive) return;
    const ctx = { t, doc, page, scope, at: toMm(e) };
    const block = blockAt(e);
    if (!block) {
      select(null);
      openMenuAt(e, pageMenu(ctx));
      return;
    }
    if (group.length > 1 && group.some((b) => b.id === block.id)) {
      openMenuAt(e, multiMenu(ctx, group, selected ?? block));
      return;
    }
    select(selOf(block));
    openMenuAt(e, blockMenu(ctx, block));
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
      data-page-key={page.key}
      data-page-type={page.type}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t('page.keys', { n: index + 1 }) : undefined}
    >
      <svg ref={svgRef} width={w} height={h} viewBox={`0 0 ${page.w} ${page.h}`} className="block select-none" role="img" aria-label={`${page.title} — ${index + 1}`}>
        <defs dangerouslySetInnerHTML={{ __html: defs }} />
        <g dangerouslySetInnerHTML={{ __html: body }} />
        {press && (
          <g pointerEvents="none" data-testid="press-guides">
            {/* Lo que no se imprime: el papel entero menos el área segura (relleno con regla par-impar). */}
            {press.safe.w < page.w || press.safe.h < page.h ? (
              <path
                d={`M0 0H${page.w}V${page.h}H0Z M${press.safe.x} ${press.safe.y}V${press.safe.y + press.safe.h}H${press.safe.x + press.safe.w}V${press.safe.y}Z`}
                fillRule="evenodd"
                fill="#dc2626"
                fillOpacity={0.14}
              />
            ) : null}
            <rect x={press.safe.x} y={press.safe.y} width={press.safe.w} height={press.safe.h} fill="none" stroke="#dc2626" strokeWidth={0.6 / scale} strokeDasharray={`${3 / scale} ${2 / scale}`} />
            {press.gutter && <rect x={press.gutter.x} y={press.gutter.y} width={press.gutter.w} height={press.gutter.h} fill="#2563eb" fillOpacity={0.14} />}
          </g>
        )}
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
        {interactive && !single &&
          group.map((b) => {
            const r = blockBounds(b);
            const dd = liveDelta ?? { dx: 0, dy: 0 };
            return (
              <rect
                key={b.id}
                x={r.x - 0.6 + dd.dx}
                y={r.y - 0.6 + dd.dy}
                width={r.w + 1.2}
                height={r.h + 1.2}
                fill="none"
                stroke="#4f6b3a"
                strokeWidth={(b.id === selected?.id ? 1.6 : 1) / scale}
                strokeDasharray={b.editable ? undefined : `${3 / scale} ${2 / scale}`}
                pointerEvents="none"
              />
            );
          })}
        {interactive && single && selBounds && (
          <rect x={selBounds.x - 0.6} y={selBounds.y - 0.6} width={selBounds.w + 1.2} height={selBounds.h + 1.2} fill="none" stroke="#4f6b3a" strokeWidth={1.4 / scale} strokeDasharray={selected?.editable === false ? `${3 / scale} ${2 / scale}` : undefined} pointerEvents="none" />
        )}
        {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="#4f6b3a14" stroke="#4f6b3a" strokeWidth={1 / scale} strokeDasharray={`${3 / scale} ${2 / scale}`} pointerEvents="none" />}
      </svg>
      {links.length > 0 && (
        <div className="pointer-events-none absolute inset-0" data-links={links.length}>
          {links.map((l, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              data-link-to={l.page ?? l.url}
              className={`pointer-events-auto absolute rounded-[2px] border border-[#2563eb]/70 bg-[#2563eb]/15 hover:bg-[#2563eb]/30 ${l.cat === 'manual' ? 'border-dashed' : ''}`}
              style={{ left: l.rect.x * scale, top: l.rect.y * scale, width: l.rect.w * scale, height: l.rect.h * scale }}
              title={linkTitle(l)}
              aria-label={linkTarget(l)}
              // Un clic elige el elemento al que pertenece la zona (así se ven y se cambian sus enlaces;
              // Ctrl o Mayús lo suman o lo quitan de la selección); el doble clic sigue el enlace.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const owner = page.blocks.find((b) => b.id === l.blockId);
                if (!owner) return;
                if (e.ctrlKey || e.metaKey || e.shiftKey) toggle(owner);
                else {
                  // Elige el elemento y esa zona: el panel de enlaces muestra y cambia solo su destino.
                  select(selOf(owner));
                  setLinkArea(l.area);
                }
              }}
              onContextMenu={(e) => {
                const owner = page.blocks.find((b) => b.id === l.blockId);
                if (!owner) return;
                e.preventDefault();
                e.stopPropagation();
                select(selOf(owner));
                setLinkArea(l.area);
                openMenuAt(e, zoneMenu({ t, doc, page, scope, at: toMm(e) }, l, () => followLink(l)));
              }}

            />
          ))}
        </div>
      )}
      {interactive && editing && (() => {
        const target = page.blocks.find((b) => b.id === editing);
        return target?.text ? <TextEditor key={`${page.key}:${editing}`} doc={doc} page={page} blockId={editing} source={target.text} scale={scale} onDone={() => setEditing(null)} /> : null;
      })()}
      {interactive && single && selBounds && selected?.editable && !editing && (
        <>
          {/* Capa del elemento seleccionado: con el dedo se arrastra desde acá sin desplazar la página. */}
          <div data-sel-surface="" className="absolute cursor-move" style={{ left: selBounds.x * scale, top: selBounds.y * scale, width: selBounds.w * scale, height: selBounds.h * scale, touchAction: 'none' }} />
          {(hasSideHandles(selected) ? HANDLES : (['se'] as const)).map((h) => {
            // Esquinas: cuadrados; lados: barras sobre el borde. Grandes para el dedo.
            const corner = h.length === 2;
            // En una caja chica (un renglón de texto) las barras de los lados quedarían debajo de las esquinas:
            // se corren hacia afuera para que cada tirador se pueda tomar.
            const tightV = selBounds.h * scale < SIDE_ROOM_PX;
            const tightH = selBounds.w * scale < SIDE_ROOM_PX;
            const out = SIDE_OUTSET_PX;
            const cx = (h.includes('w') ? selBounds.x : h.includes('e') ? selBounds.x + selBounds.w : selBounds.x + selBounds.w / 2) * scale + (tightV && h === 'e' ? out : tightV && h === 'w' ? -out : 0);
            const cy = (h.includes('n') ? selBounds.y : h.includes('s') ? selBounds.y + selBounds.h : selBounds.y + selBounds.h / 2) * scale + (tightH && h === 's' ? out : tightH && h === 'n' ? -out : 0);
            const [w, hh] = corner ? [14, 14] : h === 'n' || h === 's' ? [22, 8] : [8, 22];
            return (
              <div
                key={h}
                data-handle={h}
                aria-label={t(`resize.${h}`)}
                title={t(corner ? 'resize.cornerHint' : 'resize.sideHint')}
                className="absolute rounded-sm border-2 border-accent bg-white"
                style={{ left: cx - w / 2, top: cy - hh / 2, width: w, height: hh, touchAction: 'none', cursor: RESIZE_CURSOR[h] }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
