/**
 * Elegir un ornamento: los integrados (con su dibujo de muestra) y las imágenes de la agenda
 * (SVG o PNG propios), o subir uno nuevo. Devuelve una referencia `builtin:<id>` o `asset:<id>`.
 */
import { BUILTIN_ORNAMENTS, type OrnamentKind } from '@core/layout/ornaments';
import clsx from 'clsx';
import { Upload } from 'lucide-react';
import { useT, uiText } from '../i18n/ui';
import { uploadOne } from '../state/uploads';
import { useStore } from '../state/store';

/** Muestra vectorial de un ornamento integrado (los mismos trazados que van al PDF). */
function Preview({ id }: { id: string }) {
  const o = BUILTIN_ORNAMENTS.find((x) => x.id === id);
  if (!o) return null;
  const h = 10;
  const w = h * o.aspect;
  return (
    <svg viewBox={`-1 -1 ${w + 2} ${h + 2}`} className="h-5 max-w-[84px]" aria-hidden="true">
      {o.draw(0, 0, w, h).map((s, i) =>
        s.mode === 'fill' ? <path key={i} d={s.d} fill="currentColor" /> : <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round" />,
      )}
    </svg>
  );
}

export function OrnamentPicker(props: { label: string; value: string; kinds: readonly OrnamentKind[]; onChange: (ref: string) => void; allowNone?: boolean }) {
  const t = useT();
  const assets = useStore((s) => s.design?.assets ?? []);
  const images = assets.filter((a) => a.kind === 'vector' || a.kind === 'raster');
  const option = (ref: string, content: React.ReactNode, title: string) => (
    <button
      key={ref || 'none'}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={props.value === ref}
      onClick={() => props.onChange(ref)}
      className={clsx('flex h-9 min-w-[44px] items-center justify-center rounded-md border px-1.5 text-[11px] text-ink', props.value === ref ? 'border-accent bg-accent-soft' : 'border-line bg-white hover:bg-paper')}
    >
      {content}
    </button>
  );
  return (
    <div className="py-1.5" role="group" aria-label={props.label}>
      <div className="mb-1 text-[11.5px] font-semibold text-ink-soft">{props.label}</div>
      <div className="flex flex-wrap gap-1">
        {props.allowNone !== false && option('', t('orn.none'), t('orn.none'))}
        {BUILTIN_ORNAMENTS.filter((o) => props.kinds.includes(o.kind)).map((o) => option(`builtin:${o.id}`, <Preview id={o.id} />, uiText(t, `orn.${o.id}`, o.id)))}
        {images.map((a) => option(`asset:${a.id}`, <span className="max-w-[90px] truncate">{a.name}</span>, a.name))}
        <button
          type="button"
          className="flex h-9 items-center gap-1 rounded-md border border-dashed border-line px-2 text-[11px] text-ink-soft hover:bg-paper"
          onClick={() =>
            void uploadOne('image/svg+xml,image/png,.svg,.png', (name) => t('assets.unsupported', { name })).then((id) => {
              if (id) props.onChange(`asset:${id}`);
            })
          }
        >
          <Upload size={13} /> {t('orn.upload')}
        </button>
      </div>
    </div>
  );
}
