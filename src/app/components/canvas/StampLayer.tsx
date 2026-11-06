/**
 * El pincel de sello y trazo sobre una página: mientras está en uso, el puntero no elige ni mueve
 * elementos. Un clic deja una copia del recurso (un elemento imagen); arrastrar deja copias a lo largo
 * del trazo, que se ven mientras se arrastra y al soltar quedan como un solo elemento (un solo paso de
 * «Deshacer»). Esc o «Listo» deja el pincel.
 */
import type { AssetRef } from '@core/design/schema';
import type { PageModel } from '@core/layout/prims';
import { stampsAlong, strokeLength, type Stamp } from '@core/layout/stamps';
import { useRef, useState } from 'react';
import { useT } from '../../i18n/ui';
import { placeAsset, placeStampStroke } from '../../state/actions';
import { assetHref } from '../../state/assetUrls';
import { resources } from '../../state/resources';
import { useStore, type StampTool } from '../../state/store';

/** Menos que esto de recorrido (mm) es un clic, no un trazo. */
const CLICK_MM = 1.5;

/** La dirección para mostrar un recurso en una etiqueta `<img>` o `<image>`. */
export function assetPreviewUrl(a: AssetRef | undefined): string | undefined {
  if (!a) return undefined;
  if (a.kind === 'vector' && a.builtin) return `${import.meta.env.BASE_URL}${a.builtin}`;
  return a.kind === 'pdf' ? undefined : assetHref(a.id, 'image');
}

/** Ancho sobre alto de un recurso (1 si no se sabe todavía). */
export function assetAspect(a: Pick<AssetRef, 'id' | 'width' | 'height'> | undefined): number {
  const info = a ? resources.assetInfos.get(a.id) : undefined;
  const aspect = info?.aspect ?? (a && a.width > 0 && a.height > 0 ? a.width / a.height : 1);
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

export function StampLayer({ page, tool }: { page: PageModel; tool: StampTool }) {
  const t = useT();
  const layer = useRef<HTMLDivElement | null>(null);
  const stroke = useRef<{ pointerId: number; points: Array<{ x: number; y: number }>; seed: number } | null>(null);
  const [preview, setPreview] = useState<Stamp[]>([]);
  const asset = useStore((s) => s.design?.assets.find((a) => a.id === tool.assetId));
  const url = assetPreviewUrl(asset);
  const aspect = assetAspect(asset);

  const toMm = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = layer.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * page.w, y: ((e.clientY - r.top) / r.height) * page.h };
  };
  const optionsFor = (seed: number) => ({ size: tool.size, spacing: tool.spacing, rotate: tool.rotate, jitter: tool.jitter, seed });

  const finish = (e: React.PointerEvent<HTMLDivElement>, commit: boolean): void => {
    const s = stroke.current;
    if (!s || s.pointerId !== e.pointerId) return;
    stroke.current = null;
    setPreview([]);
    e.stopPropagation();
    if (!commit || !asset) return;
    const label = asset.name;
    if (strokeLength(s.points) < CLICK_MM) placeAsset(page, asset.id, aspect, { at: s.points[0]!, width: tool.size, tint: tool.tint, label });
    else placeStampStroke(page, s.points, tool, aspect, s.seed, t('stamp.strokeLabel', { name: label }));
  };

  return (
    <div
      ref={layer}
      className="absolute inset-0 z-10"
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      data-testid="stamp-layer"
      onPointerDown={(e) => {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.stopPropagation();
        e.preventDefault();
        const seed = Math.floor(Math.random() * 0x7fffffff);
        stroke.current = { pointerId: e.pointerId, points: [toMm(e)], seed };
        layer.current?.setPointerCapture?.(e.pointerId);
        setPreview(stampsAlong(stroke.current.points, optionsFor(seed)));
      }}
      onPointerMove={(e) => {
        const s = stroke.current;
        if (!s || s.pointerId !== e.pointerId) return;
        e.stopPropagation();
        s.points.push(toMm(e));
        setPreview(stampsAlong(s.points, optionsFor(s.seed)));
      }}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      // El menú de la página no corresponde mientras se pinta.
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {preview.length > 0 && (
        <svg viewBox={`0 0 ${page.w} ${page.h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {preview.map((s, i) => {
            const w = s.size;
            const h = s.size / aspect;
            return (
              <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`} opacity={0.7}>
                {url ? <image href={url} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke="#4f6b3a" strokeWidth={0.3} />}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
