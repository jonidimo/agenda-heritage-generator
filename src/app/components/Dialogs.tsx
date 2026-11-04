/** Biblioteca de agendas y asistente de nueva agenda. */
import { createDesign, duplicateForYear, TEMPLATES, type TemplateId } from '@core/design/defaults';
import { countryName } from '@core/holidays';
import { langOf } from '@core/i18n';
import { Copy, Download, FileUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uiText, useT } from '../i18n/ui';
import { deleteDesign, exportDesignFile, importDesignFile, listDesigns, loadDesign, saveAsset, saveDesign, saveUserFont, type DesignMeta } from '../state/persist';
import { download, fileBase } from '../state/exporter';
import { resources } from '../state/resources';
import { useStore } from '../state/store';
import { LOCALES } from './panels/CalendarPanel';
import { Button, Field, NumberInput, Select, TextInput } from './ui';

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="w-full max-w-lg rounded-xl border border-line bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="font-display text-[22px] italic">{props.title}</h2>
          <button type="button" onClick={props.onClose} className="rounded p-1 hover:bg-black/5" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-3">{props.children}</div>
      </div>
    </div>
  );
}

export function WelcomeDialog() {
  const t = useT();
  const setDesign = useStore((s) => s.setDesign);
  const setShow = useStore((s) => s.setShowWelcome);
  const hasDesign = useStore((s) => s.design !== null);
  const [template, setTemplate] = useState<TemplateId>('heritage-norma');
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [locale, setLocale] = useState('es-AR');
  const [country, setCountry] = useState('AR');
  const [name, setName] = useState('Norma');
  const lang = langOf(locale);
  const countries = useMemo(() => (resources.holidayIndex?.countries ?? []).map((c) => ({ value: c.code, label: countryName(resources.holidayIndex, c.code, lang) })).sort((a, b) => a.label.localeCompare(b.label)), [lang]);

  const create = (): void => {
    const d = createDesign(template, { year, locale, country: country || null, ...(name.trim() ? { name: name.trim() } : {}) });
    if (template !== 'heritage-norma' && name.trim()) d.persona.name = name.trim();
    if (template === 'heritage-norma') {
      d.locale = locale;
      d.holidays.country = country || null;
    }
    setDesign(d);
    setShow(false);
  };

  return (
    <Modal title={t('welcome.title')} onClose={() => hasDesign && setShow(false)}>
      <Field label={t('welcome.template')}>
        <div className="grid gap-1.5">
          {TEMPLATES.map((tp) => (
            <label key={tp.id} className={`flex cursor-pointer gap-2 rounded-md border px-2 py-1.5 ${template === tp.id ? 'border-accent bg-accent-soft' : 'border-line bg-white/60'}`}>
              <input type="radio" name="tpl" checked={template === tp.id} onChange={() => setTemplate(tp.id)} className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-semibold">{uiText(t, `tpl.${tp.id}`, tp.name)}</span>
                <span className="block text-[11.5px] text-ink-soft">{uiText(t, `tpl.${tp.id}.desc`, tp.description)}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('welcome.year')}>
          <NumberInput value={year} min={1900} max={2200} onChange={(v) => setYear(Math.round(v))} />
        </Field>
        <Field label={t('welcome.language')}>
          <Select
            value={locale}
            onChange={(v) => {
              setLocale(v);
              const region = v.split('-')[1];
              if (region) setCountry(region);
            }}
            options={LOCALES}
          />
        </Field>
      </div>
      <Field label={t('welcome.country')}>
        <Select value={country} onChange={setCountry} options={[{ value: '', label: '—' }, ...countries]} />
      </Field>
      <Field label={t('welcome.name')}>
        <TextInput value={name} onChange={setName} />
      </Field>
      <div className="mt-3 flex justify-end gap-2">
        {hasDesign && (
          <Button variant="ghost" onClick={() => setShow(false)}>
            {t('welcome.cancel')}
          </Button>
        )}
        <Button variant="primary" onClick={create}>
          {t('welcome.create')}
        </Button>
      </div>
    </Modal>
  );
}

export function LibraryDialog() {
  const t = useT();
  const design = useStore((s) => s.design);
  const setDesign = useStore((s) => s.setDesign);
  const setShow = useStore((s) => s.setShowLibrary);
  const setShowWelcome = useStore((s) => s.setShowWelcome);
  const bump = useStore((s) => s.bumpResources);
  const [items, setItems] = useState<DesignMeta[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const refresh = (): void => void listDesigns().then(setItems);
  useEffect(refresh, []);

  const onImport = async (files: FileList | null): Promise<void> => {
    const f = files?.[0];
    if (!f) return;
    const { design: d, assets, fonts } = await importDesignFile(await f.text());
    for (const a of assets) {
      await saveAsset(a.id, a.bytes);
      resources.assetBytes.set(a.id, a.bytes);
    }
    for (const fo of fonts) {
      await saveUserFont(fo.id, fo.bytes, fo.spec);
      const face = resources.fonts.register(fo.bytes, { ...fo.spec, source: 'user', file: fo.id });
      resources.userFontBytes.set(fo.id, { bytes: fo.bytes, spec: { family: face.family, weight: face.weight, style: face.style } });
    }
    resources.bump();
    bump(resources.version);
    await saveDesign(d);
    setDesign(d);
    setShow(false);
  };

  return (
    <Modal title={t('lib.title')} onClose={() => setShow(false)}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button
          variant="primary"
          onClick={() => {
            setShow(false);
            setShowWelcome(true);
          }}
        >
          <Plus size={14} /> {t('lib.new')}
        </Button>
        <input ref={fileRef} type="file" accept=".json,.agenda.json,application/json" className="hidden" onChange={(e) => void onImport(e.target.files)} />
        <Button onClick={() => fileRef.current?.click()}>
          <FileUp size={14} /> {t('lib.import')}
        </Button>
        {design && (
          <Button
            onClick={async () => {
              const blob = await exportDesignFile(design, resources.assetBytes, resources.userFontBytes);
              download(blob, `${fileBase(design)}.agenda.json`, 'application/json');
            }}
          >
            <Download size={14} /> {t('lib.exportFile')}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-soft">{t('lib.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-white/60">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 px-2 py-1.5">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={async () => {
                  const d = await loadDesign(it.id);
                  if (d) {
                    setDesign(d);
                    setShow(false);
                  }
                }}
              >
                <span className="block text-[13px] font-semibold">{it.name}</span>
                <span className="block text-[11px] text-ink-soft">
                  {it.year} · {new Date(it.updatedAt).toLocaleString()}
                </span>
              </button>
              <Button
                variant="ghost"
                title={t('lib.duplicate', { year: it.year + 1 })}
                onClick={async () => {
                  const d = await loadDesign(it.id);
                  if (!d) return;
                  const n = duplicateForYear(d, d.calendar.year + 1);
                  await saveDesign(n);
                  setDesign(n);
                  setShow(false);
                }}
              >
                <Copy size={14} /> {it.year + 1}
              </Button>
              <Button
                variant="ghost"
                title={t('lib.delete')}
                onClick={async () => {
                  if (!window.confirm(t('lib.confirmDelete', { name: it.name }))) return;
                  await deleteDesign(it.id);
                  refresh();
                }}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-ink-soft">{t('lib.storageNote')}</p>
    </Modal>
  );
}
