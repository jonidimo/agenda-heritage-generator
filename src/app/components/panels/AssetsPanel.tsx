import { rasterInfo } from '@core/assets/image';
import { resolveStrings, listStringKeys } from '@core/i18n';
import { assetInfoFromBytes } from '@core/resources';
import { PAGE_TYPES } from '@core/sections/registry';
import { detectFaceMeta } from '@core/text/fonts';
import { openFont } from '@core/text/fontkit';
import { newId } from '@core/util/hash';
import { FilePlus2, Image as ImageIcon, Stamp, Trash2, Type, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { sectionName, useT } from '../../i18n/ui';
import { assetHref, forgetAsset } from '../../state/assetUrls';
import { deleteAsset, saveAsset, saveUserFont } from '../../state/persist';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { WatermarkFields } from '../Inspector';
import { Badge, Button, Field, Group, Select, Toggle } from '../ui';

function kindOf(file: File, bytes: Uint8Array): { kind: 'raster' | 'vector' | 'pdf'; mime: string } | null {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return { kind: 'vector', mime: 'image/svg+xml' };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { kind: 'pdf', mime: 'application/pdf' };
  const r = rasterInfo(bytes);
  if (r) return { kind: 'raster', mime: r.mime };
  return null;
}

/** Convierte WebP/HEIC/GIF/AVIF (lo que el navegador sepa abrir) a PNG sin pérdida. */
async function toPng(file: File): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d')?.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export function AssetsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const bump = useStore((s) => s.bumpResources);
  const pageIndex = useStore((s) => s.pageIndex);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fontRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resVersion = useStore((s) => s.resVersion);

  const onFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      let k = kindOf(file, bytes);
      if (!k) {
        const png = await toPng(file);
        if (!png) {
          setError(`${file.name}: formato no soportado`);
          continue;
        }
        bytes = png;
        k = { kind: 'raster', mime: 'image/png' };
      }
      const id = newId('img');
      const ref = { id, name: file.name, kind: k.kind, mime: k.mime, width: 0, height: 0, builtin: null };
      try {
        const info = await assetInfoFromBytes(ref, bytes);
        resources.assetBytes.set(id, bytes);
        resources.assetInfos.set(id, info);
        await saveAsset(id, bytes);
        update((d) => void d.assets.push({ ...ref, width: info.width, height: info.height, ...(info.pages ? { pages: info.pages } : {}) }));
        resources.bump();
        bump(resources.version);
        if (info.vector?.warnings.length) setError(info.vector.warnings.join(' '));
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
  };

  const onFonts = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const meta = detectFaceMeta(openFont(bytes));
        const id = newId('font');
        resources.fonts.register(bytes, { ...meta, source: 'user', file: id });
        resources.userFontBytes.set(id, { bytes, spec: meta });
        await saveUserFont(id, bytes, meta);
        resources.bump();
        bump(resources.version);
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
  };

  const removeAsset = (id: string): void => {
    update((d) => {
      d.assets = d.assets.filter((a) => a.id !== id);
      d.watermarks = d.watermarks.filter((w) => w.assetId !== id);
      if (d.cover.imageAssetId === id) d.cover.imageAssetId = null;
    });
    forgetAsset(id);
    void deleteAsset(id);
  };

  const addWatermark = (assetId: string): void =>
    update((d) =>
      void d.watermarks.push({ id: newId('wm'), enabled: true, assetId, scope: ['all'], exclude: ['monthCover', 'titlePage', 'custom'], hAnchor: 'outer', vAnchor: 'bottom', dx: 13, dy: 5, width: 14, opacity: 1, rotation: 0, mirrorOnVerso: true, layer: 'above', minStrokePt: 0.3 }),
    );

  const addAsPage = (assetId: string): void => {
    update((d) =>
      void d.customPages.push({
        id: newId('pagina'),
        after: null,
        fallback: null,
        startOn: 'any',
        title: '',
        content: { kind: 'artwork', assetId, pdfPage: 1, fit: 'contain', area: 'page', background: 'blank', text: '', rotation: 0, opacity: 1 },
      }),
    );
    void pageIndex;
  };

  // Cobertura de caracteres de cada familia frente a todos los textos de la agenda.
  const coverage = useMemo(() => {
    const strings = resolveStrings(design.locale, design.persona.labels);
    const text = [...listStringKeys(strings).map((r) => r.value), design.persona.name, design.persona.title, design.persona.dedication, ...design.persona.phrases, ...design.personalDates.map((p) => p.label)].join(' ');
    const cps = [...new Set(Array.from(text).map((c) => c.codePointAt(0)!))].filter((cp) => cp > 32);
    const out = new Map<string, string[]>();
    for (const f of resources.fonts.list()) {
      const missing = cps.filter((cp) => !f.font.hasGlyphForCodePoint(cp)).map((cp) => String.fromCodePoint(cp));
      const prev = out.get(f.family);
      out.set(f.family, prev ? prev.filter((c) => missing.includes(c)) : missing);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.locale, design.persona, design.personalDates, resVersion]);

  return (
    <div>
      {error && <p className="my-2 rounded-md bg-[#fbeee6] px-2 py-1.5 text-[11.5px] text-warn">{error}</p>}
      <Group title={t('assets.images')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('assets.uploadHelp')}</p>
        <input ref={fileRef} type="file" multiple accept="image/*,.svg,.pdf,application/pdf" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
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

      <Group title={t('assets.fonts')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('assets.fontsHelp')}</p>
        <input ref={fontRef} type="file" multiple accept=".ttf,.otf,.woff,.woff2,font/*" className="hidden" onChange={(e) => void onFonts(e.target.files)} />
        <Button onClick={() => fontRef.current?.click()}>
          <Type size={14} /> {t('assets.uploadFont')}
        </Button>
        <ul className="mt-2 space-y-1">
          {[...new Set([...(resources.manifest?.families.map((f) => f.family) ?? []), ...resources.fonts.families()])].map((fam) => {
            const missing = coverage.get(fam);
            const user = resources.fonts.facesOf(fam).some((f) => f.source === 'user');
            return (
              <li key={fam} className="text-[12px]">
                <span className="font-semibold">{fam}</span> <Badge>{user ? t('assets.user') : t('assets.builtin')}</Badge>
                {missing && (missing.length === 0 ? <span className="ml-1 text-[11px] text-accent">✓ {t('assets.coverageOk')}</span> : <span className="ml-1 text-[11px] text-warn">{t('assets.missing', { chars: missing.slice(0, 20).join(' ') })}</span>)}
              </li>
            );
          })}
        </ul>
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
