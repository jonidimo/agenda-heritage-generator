import { assetUses, removeAssetFrom, type AssetUse } from '@core/design/assetUse';
import { newId } from '@core/util/hash';
import { FilePlus2, Image as ImageIcon, Stamp, Trash2, Upload } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { sectionName, useT, type UiKey } from '../../i18n/ui';
import { assetHref, onAssetUrlsChange } from '../../state/assetUrls';
import { customPageHere } from '../../state/customPages';
import { useDocument } from '../../state/doc';
import { jumpToPage } from '../../state/navigation';
import { addAssetFiles } from '../../state/uploads';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { WatermarkFields } from '../Inspector';
import { Badge, Button, Field, Group, Select, Toggle } from '../ui';
import { PAGE_TYPES } from '@core/sections/registry';

export function AssetsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const pageIndex = useStore((s) => s.pageIndex);
  const setGoToKey = useStore((s) => s.setGoToKey);
  const { doc } = useDocument();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Las vistas previas de PDF llegan después: al estar listas, la lista se vuelve a dibujar.
  const [, repaint] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onAssetUrlsChange(repaint), []);

  const onFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    setError(null);
    const r = await addAssetFiles(Array.from(files), (name) => t('assets.unsupported', { name }));
    if (r.messages.length > 0) setError(r.messages.join(' '));
  };

  /**
   * Quita la imagen de esta agenda junto con lo que la usaba (en un solo paso que se puede
   * deshacer). Los bytes quedan guardados: otra agenda (p. ej. la del año anterior) puede
   * usarlos, y los que ya nadie usa se limpian al abrir la aplicación.
   */
  const removeAsset = (id: string): void => update((d) => removeAssetFrom(d, id));

  const addWatermark = (assetId: string): void =>
    update((d) =>
      void d.watermarks.push({ id: newId('wm'), enabled: true, assetId, scope: ['all'], exclude: ['monthCover', 'titlePage', 'custom'], excludePages: [], hAnchor: 'outer', vAnchor: 'bottom', dx: 13, dy: 5, width: 14, opacity: 1, rotation: 0, mirrorOnVerso: true, layer: 'above', minStrokePt: 0.3 }),
    );

  /** A qué página lleva un uso de la imagen (la primera donde aparece), o `undefined` si no está en una página. */
  const pageOf = (u: AssetUse): number | undefined => {
    const pages = doc?.plan.pages ?? [];
    const idx = (match: (p: (typeof pages)[number]) => boolean): number | undefined => pages.find(match)?.index;
    if (u.kind === 'block') return u.pageKey ? idx((p) => p.key === u.pageKey) : idx((p) => p.type === u.pageType);
    if (u.kind === 'page') return idx((p) => p.key === `custom:${u.id}`);
    return undefined;
  };
  const describeUse = (u: AssetUse): string => {
    switch (u.kind) {
      case 'watermark':
        return t('assets.use.watermark');
      case 'cover':
        return t('assets.use.cover');
      case 'block':
        return t('assets.use.block', { name: u.label || t('assets.use.element') });
      case 'page':
        return t('assets.use.page', { name: u.title || t('assets.use.untitled') });
      case 'template':
        return t('assets.use.template', { name: u.title || t('assets.use.untitled') });
      case 'ornament':
        return t(`assets.use.ornament.${u.where}` as UiKey);
    }
  };

  /** Página propia con esta imagen, después de la página actual (y se va a ella). */
  const addAsPage = (assetId: string): void => {
    const cp = customPageHere(doc, pageIndex, { kind: 'artwork', assetId, area: 'page', background: 'blank' });
    update((d) => void d.customPages.push(cp));
    setGoToKey(`custom:${cp.id}`);
  };

  return (
    <div>
      {error && <p className="my-2 rounded-md bg-[#fbeee6] px-2 py-1.5 text-[11.5px] text-warn">{error}</p>}
      <Group title={t('assets.images')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('assets.uploadHelp')}</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.svg,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const input = e.target;
            void onFiles(input.files).finally(() => (input.value = ''));
          }}
        />
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> {t('assets.upload')}
        </Button>
        <ul className="mt-2 space-y-2">
          {design.assets.map((a) => {
            const info = resources.assetInfos.get(a.id);
            const href = a.kind === 'pdf' ? assetHref(`${a.id}#1`, 'pdf') : a.kind === 'vector' ? undefined : assetHref(a.id, 'image');
            const vecHref = a.kind === 'vector' && a.builtin ? `${import.meta.env.BASE_URL}${a.builtin}` : a.kind === 'vector' ? assetHref(a.id, 'image') : undefined;
            const dpi = a.kind === 'raster' && info?.pxWidth ? Math.round((info.pxWidth / 100) * 25.4) : null;
            return (
              <li key={a.id} className="flex gap-2 rounded-md border border-line bg-white/60 p-1.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
                  {href || vecHref ? <img src={href ?? vecHref} alt="" className="max-h-full max-w-full" /> : <ImageIcon size={20} className="text-ink-soft" />}
                </div>
                <div className="min-w-0 flex-1 text-[11.5px]">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-ink-soft">
                    <Badge>{a.kind === 'vector' ? 'SVG' : a.kind === 'pdf' ? `PDF${a.pages ? ` · ${a.pages}` : ''}` : a.mime.replace('image/', '').toUpperCase()}</Badge>{' '}
                    {a.kind === 'raster' && info && `${info.pxWidth}×${info.pxHeight}px`}
                    {dpi !== null && <span className={dpi < 300 ? 'text-warn' : ''}> · {t('assets.dpiAt', { dpi, mm: 100 })}</span>}
                  </div>
                  {(() => {
                    const uses = a.builtin ? [] : assetUses(design, a.id);
                    return (
                      <ul className="mt-1 space-y-0.5" data-testid="asset-uses" data-asset={a.id}>
                        {uses.length === 0 && !a.builtin && <li className="text-ink-soft">{t('assets.unused')}</li>}
                        {uses.map((u, i) => {
                          const at = pageOf(u);
                          return (
                            <li key={i} className="flex items-center justify-between gap-2 text-ink-soft">
                              <span className="min-w-0 truncate">{describeUse(u)}</span>
                              {at !== undefined && (
                                <button type="button" className="shrink-0 text-accent underline" onClick={() => jumpToPage(at)}>
                                  {t('assets.go')}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button variant="ghost" onClick={() => addWatermark(a.id)}>
                      <Stamp size={13} /> {t('assets.useAsWatermark')}
                    </Button>
                    <Button variant="ghost" onClick={() => addAsPage(a.id)}>
                      <FilePlus2 size={13} /> {t('assets.useAsPage')}
                    </Button>
                    <Button variant="ghost" onClick={() => update((d) => void (d.cover.imageAssetId = a.id))}>
                      {t('assets.useAsCover')}
                    </Button>
                    {!a.builtin && (
                      <Button variant="ghost" onClick={() => removeAsset(a.id)}>
                        <Trash2 size={13} />
                        <span className="sr-only">{t('assets.remove')}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title={t('assets.watermarks')}>
        {design.watermarks.map((wm) => (
          <div key={wm.id} className="mb-2 rounded-md border border-line bg-white/60 p-2">
            <div className="flex items-center justify-between">
              <Toggle label={`${design.assets.find((a) => a.id === wm.assetId)?.name ?? wm.assetId}`} checked={wm.enabled} onChange={(v) => update((d) => void (d.watermarks.find((x) => x.id === wm.id)!.enabled = v))} />
              <Button variant="ghost" onClick={() => update((d) => void (d.watermarks = d.watermarks.filter((x) => x.id !== wm.id)))}>
                <Trash2 size={13} /> {t('wm.remove')}
              </Button>
            </div>
            <Field label={t('wm.exclude')} group>
              <div className="flex flex-wrap gap-1">
                {PAGE_TYPES.filter((p) => p !== 'filler').map((pt) => {
                  const on = wm.exclude.includes(pt);
                  return (
                    <button
                      key={pt}
                      type="button"
                      onClick={() =>
                        update((d) => {
                          const w = d.watermarks.find((x) => x.id === wm.id)!;
                          w.exclude = on ? w.exclude.filter((x) => x !== pt) : [...w.exclude, pt];
                        })
                      }
                      className={`rounded-full border px-1.5 py-0.5 text-[10.5px] ${on ? 'border-warn bg-[#fbeee6] text-warn line-through' : 'border-line bg-white text-ink-soft'}`}
                    >
                      {sectionName(t, pt)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <WatermarkFields id={wm.id} />
          </div>
        ))}
      </Group>

      <Group title={t('cover.title')} defaultOpen={false}>
        <Field label={t('cover.style')}>
          <Select value={design.cover.style} onChange={(v) => update((d) => void (d.cover.style = v))} options={[{ value: 'board', label: t('cover.board') }, { value: 'wrap', label: t('cover.wrap') }, { value: 'plain', label: t('cover.plain') }]} />
        </Field>
        <Field label={t('cover.image')}>
          <Select value={design.cover.imageAssetId ?? ''} onChange={(v) => update((d) => void (d.cover.imageAssetId = v || null))} options={[{ value: '', label: t('cover.none') }, ...design.assets.map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
        <Toggle label={t('cover.showYear')} checked={design.cover.showYear} onChange={(v) => update((d) => void (d.cover.showYear = v))} />
        <Toggle label={t('cover.showName')} checked={design.cover.showName} onChange={(v) => update((d) => void (d.cover.showName = v))} />
        <Toggle label={t('cover.showTitle')} checked={design.cover.showTitle} onChange={(v) => update((d) => void (d.cover.showTitle = v))} />
      </Group>
    </div>
  );
}
