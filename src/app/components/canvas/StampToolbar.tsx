/**
 * La barra del pincel de sello y trazo, arriba del lienzo mientras está en uso: el recurso, el tamaño
 * de cada copia, el espaciado, cómo giran, cuánto varían, el tinte (en un dibujo vectorial) y «Listo».
 * Esc también deja el pincel.
 */
import { STAMP_LIMITS } from '@core/layout/stamps';
import { Brush, X } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '../../i18n/ui';
import { useStore, type StampTool } from '../../state/store';
import { Segmented, Slider } from '../ui';
import { assetPreviewUrl } from './StampLayer';

export function StampToolbar() {
  const t = useT();
  const tool = useStore((s) => s.stamp);
  const setStamp = useStore((s) => s.setStamp);
  const asset = useStore((s) => (tool ? s.design?.assets.find((a) => a.id === tool.assetId) : undefined));

  // Esc deja el pincel (antes que cualquier otra cosa que haga Esc).
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      useStore.getState().setStamp(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tool]);

  // Si el recurso ya no está en la agenda (se borró, se deshizo), el pincel se deja.
  useEffect(() => {
    if (tool && !asset) setStamp(null);
  }, [tool, asset, setStamp]);

  if (!tool || !asset) return null;
  const set = (patch: Partial<StampTool>): void => setStamp({ ...tool, ...patch });
  const plain = (key: 'size' | 'spacing' | 'jitter') => ({ onPreview: (v: number) => set({ [key]: v }), onChange: (v: number) => set({ [key]: v }) });
  const url = assetPreviewUrl(asset);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3" data-testid="stamp-toolbar">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-paper/95 px-3 py-1.5 text-[12px] shadow-lg backdrop-blur" role="toolbar" aria-label={t('stamp.title')}>
        <span className="flex items-center gap-1.5 font-semibold">
          <Brush size={14} className="text-accent" aria-hidden="true" />
          {url && <img src={url} alt="" className="h-5 w-5 object-contain" />}
          <span className="max-w-[120px] truncate">{asset.name}</span>
        </span>
        <div className="w-[130px]">
          <Slider label={t('stamp.size')} value={tool.size} min={STAMP_LIMITS.size.min} max={STAMP_LIMITS.size.max} step={0.5} unit="mm" {...plain('size')} />
        </div>
        <div className="w-[130px]">
          <Slider label={t('stamp.spacing')} value={Math.round(tool.spacing * 100)} min={STAMP_LIMITS.spacing.min * 100} max={STAMP_LIMITS.spacing.max * 100} step={5} unit="%" onPreview={(v) => set({ spacing: v / 100 })} onChange={(v) => set({ spacing: v / 100 })} />
        </div>
        <Segmented
          compact
          value={tool.rotate}
          onChange={(rotate) => set({ rotate })}
          options={[
            { value: 'none', label: t('stamp.rotate.none') },
            { value: 'follow', label: t('stamp.rotate.follow') },
            { value: 'random', label: t('stamp.rotate.random') },
          ]}
        />
        <div className="w-[120px]">
          <Slider label={t('stamp.jitter')} value={Math.round(tool.jitter * 100)} min={0} max={STAMP_LIMITS.jitter.max * 100} step={5} unit="%" onPreview={(v) => set({ jitter: v / 100 })} onChange={(v) => set({ jitter: v / 100 })} />
        </div>
        {asset.kind === 'vector' && (
          <label className="flex items-center gap-1">
            <span>{t('stamp.tint')}</span>
            <input type="color" aria-label={t('stamp.tint')} className="h-6 w-8 cursor-pointer rounded border border-line bg-white p-0" value={tool.tint ?? '#000000'} onChange={(e) => set({ tint: e.target.value })} />
          </label>
        )}
        <button type="button" className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-semibold text-white hover:bg-accent/90" onClick={() => setStamp(null)} title={`${t('stamp.done')} (Esc)`}>
          <X size={13} aria-hidden="true" /> {t('stamp.done')}
        </button>
        <span className="w-full text-[11px] text-ink-soft">{t('stamp.help')}</span>
      </div>
    </div>
  );
}
