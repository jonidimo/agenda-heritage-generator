import { holidayName } from '@core/holidays';
import { langOf, listStringKeys, resolveStrings } from '@core/i18n';
import { facesForDesign } from '@core/resources';
import { PAGE_TYPES } from '@core/sections/registry';
import { detectFaceMeta } from '@core/text/fonts';
import { openFont } from '@core/text/fontkit';
import { newId } from '@core/util/hash';
import { FilePlus2, Image as ImageIcon, Stamp, Trash2, Type, Upload } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { sectionName, useT } from '../../i18n/ui';
import { assetHref, onAssetUrlsChange } from '../../state/assetUrls';
import { customPageHere } from '../../state/customPages';
import { useDocument } from '../../state/doc';
import { saveUserFont } from '../../state/persist';
import { addAssetFiles } from '../../state/uploads';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { WatermarkFields } from '../Inspector';
import { Badge, Button, Field, Group, Select, Toggle } from '../ui';

export function AssetsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const bump = useStore((s) => s.bumpResources);
  const pageIndex = useStore((s) => s.pageIndex);
  const setGoToKey = useStore((s) => s.setGoToKey);
  const { doc } = useDocument();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fontRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resVersion = useStore((s) => s.resVersion);
  // Las vistas previas de PDF llegan después: al estar listas, la lista se vuelve a dibujar.
  const [, repaint] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onAssetUrlsChange(repaint), []);

  const onFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    setError(null);
    const r = await addAssetFiles(Array.from(files), (name) => t('assets.unsupported', { name }));
    if (r.messages.length > 0) setError(r.messages.join(' '));
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

  /**
   * Quita la imagen de esta agenda junto con lo que la usaba (en un solo paso que se puede
   * deshacer). Los bytes quedan guardados: otra agenda (p. ej. la del año anterior) puede
   * usarlos, y los que ya nadie usa se limpian al abrir la aplicación.
   */
  const removeAsset = (id: string): void => {
    update((d) => {
      d.assets = d.assets.filter((a) => a.id !== id);
      d.watermarks = d.watermarks.filter((w) => w.assetId !== id);
      if (d.cover.imageAssetId === id) d.cover.imageAssetId = null;
      d.customBlocks = d.customBlocks.filter((c) => !(c.kind === 'image' && c.props.assetId === id));
      for (const cp of d.customPages) if (cp.content.assetId === id) cp.content.assetId = null;
    });
  };

  const addWatermark = (assetId: string): void =>
    update((d) =>
      void d.watermarks.push({ id: newId('wm'), enabled: true, assetId, scope: ['all'], exclude: ['monthCover', 'titlePage', 'custom'], excludePages: [], hAnchor: 'outer', vAnchor: 'bottom', dx: 13, dy: 5, width: 14, opacity: 1, rotation: 0, mirrorOnVerso: true, layer: 'above', minStrokePt: 0.3 }),
    );

  /** Página propia con esta imagen, después de la página actual (y se va a ella). */
  const addAsPage = (assetId: string): void => {
    const cp = customPageHere(doc, pageIndex, { kind: 'artwork', assetId, area: 'page', background: 'blank' });
    update((d) => void d.customPages.push(cp));
    setGoToKey(`custom:${cp.id}`);
  };

  // Cobertura de caracteres: todos los textos de la agenda (incluidos feriados, textos propios y
  // métodos propios) frente a cada cara que la agenda usa. Falta un carácter si le falta a alguna cara.
  const coverage = useMemo(() => {
    const strings = resolveStrings(design.locale, design.persona.labels);
    const data = resources.holidaysFor(design.holidays.country);
    // Los nombres de feriados en el idioma en que se van a imprimir.
    const hlang = design.holidays.language === 'auto' ? langOf(design.locale) : design.holidays.language;
    const holidayNames = data ? data.dict.map((_, i) => holidayName(data, i, hlang)) : [];
    const own = [
      ...design.customBlocks.map((c) => String(c.props.text ?? '')),
      ...design.customPages.flatMap((c) => [c.title, c.content.text]),
      ...design.methods.custom.flatMap((m) => [m.name, m.text, m.evidenceText]),
      ...design.holidays.added.map((h) => h.name),
      ...Object.values(design.holidays.renamed),
    ];
    const text = [...listStringKeys(strings).map((r) => r.value), design.persona.name, design.persona.title, design.persona.dedication, ...design.persona.phrases, ...design.personalDates.map((p) => p.label), ...holidayNames, ...own].join(' ');
    const cps = [...new Set(Array.from(text).map((c) => c.codePointAt(0)!))].filter((cp) => cp > 32);
    const used = new Map(facesForDesign(design).map((spec) => {
      const face = resources.fonts.resolveWithFallback(spec);
      return [face.key, face] as const;
    }));
    const out = new Map<string, string[]>();
    for (const f of used.values()) {
      const missing = cps.filter((cp) => !f.font.hasGlyphForCodePoint(cp)).map((cp) => String.fromCodePoint(cp));
      out.set(f.family, [...new Set([...(out.get(f.family) ?? []), ...missing])]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, resVersion]);

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
        <input
          ref={fontRef}
          type="file"
          multiple
          accept=".ttf,.otf,.woff,.woff2,font/*"
          className="hidden"
          onChange={(e) => {
            const input = e.target;
            void onFonts(input.files).finally(() => (input.value = ''));
          }}
        />
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
