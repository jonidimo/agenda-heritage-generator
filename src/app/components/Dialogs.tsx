/** Biblioteca de agendas y asistente de nueva agenda. */
import { createDesign, duplicateForYear, TEMPLATES, type TemplateId } from '@core/design/defaults';
import type { Design } from '@core/design/schema';
import { countryName } from '@core/holidays';
import { monthNames, regionOf, regionWeekInfo } from '@core/calendar/locale';
import { countryLang, homeCountry, LANGUAGES, langOf, localeFor, type Lang } from '@core/i18n';
import { Archive, Copy, Download, FileUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UI_LANG_NAMES, uiText, useT, type UiKey } from '../i18n/ui';
import { chordLabels } from '../state/shortcutHints';
import { SHORTCUT_GROUPS, SHORTCUTS } from '../state/shortcuts';
import { deleteDesign, deleteTemplate, exportDesignFile, listDesigns, listTemplates, loadDesign, saveDesign, type DesignMeta, type TemplateRecord } from '../state/persist';
import { backupAll, openAnyFile } from '../state/fileActions';
import { designFromTemplate, exportTemplateFile, importText, saveAsTemplate } from '../state/files';
import { download, fileBase } from '../state/exporter';
import { dataFolderFor } from '../state/platform';
import { resources } from '../state/resources';
import { useStore } from '../state/store';
import { Button, Field, NumberInput, Select, TextArea, TextInput, Toggle } from './ui';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  // Foco: entra al diálogo, no se escapa con Tab y vuelve a donde estaba al cerrar.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const items = (): HTMLElement[] => Array.from(box?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    (items().find((el) => el.tagName !== 'BUTTON' || !el.getAttribute('aria-label')) ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current();
      else if (e.key === 'Tab') {
        const list = items();
        if (list.length === 0) return;
        const first = list[0]!;
        const last = list[list.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div ref={boxRef} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={props.title}>
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
  const welcomeOnStart = useStore((s) => s.welcomeOnStart);
  const setWelcomeOnStart = useStore((s) => s.setWelcomeOnStart);
  const [template, setTemplate] = useState<string>('heritage-norma');
  const [userTpls, setUserTpls] = useState<TemplateRecord[]>([]);
  useEffect(() => void listTemplates().then(setUserTpls), []);
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  // El idioma se elige solo (español, inglés…); la región sale del país de los feriados.
  const [lang, setLang] = useState<Lang>(() => langOf(useStore.getState().uiLang));
  // País propuesto: el del navegador si habla el idioma; si no, el más probable para ese idioma.
  const userRegion = typeof navigator !== 'undefined' ? regionOf(navigator.language) : undefined;
  const [country, setCountry] = useState(() => homeCountry(langOf(useStore.getState().uiLang), userRegion) ?? '');
  const [name, setName] = useState('');
  const [weekStart, setWeekStart] = useState<'auto' | 'monday' | 'sunday' | 'saturday'>('auto');
  const [startMonth, setStartMonth] = useState(1);
  const [monthCount, setMonthCount] = useState(12);
  const locale = localeFor(lang, country || null);
  const regionFirst = regionWeekInfo(locale).firstDay;
  const firstName = regionFirst === 7 ? t('cal.weekStart.sunday') : regionFirst === 6 ? t('cal.weekStart.saturday') : t('cal.weekStart.monday');
  const uiMonths = monthNames(locale);
  const countries = useMemo(() => (resources.holidayIndex?.countries ?? []).map((c) => ({ value: c.code, label: countryName(resources.holidayIndex, c.code, lang) })).sort((a, b) => a.label.localeCompare(b.label)), [lang]);

  const create = (): void => {
    const own = template.startsWith('user:') ? userTpls.find((x) => `user:${x.id}` === template) : undefined;
    const calendar = (d: Design): Design => ({ ...d, calendar: { ...d.calendar, weekStart, startMonth, monthCount } });
    if (own) {
      setDesign(calendar(designFromTemplate(own.design, { year, locale, country: country || null, name })));
      setShow(false);
      return;
    }
    const d = createDesign(template as TemplateId, { year, locale, country: country || null, ...(name.trim() ? { name: name.trim() } : {}) });
    setDesign(calendar(d));
    setShow(false);
  };

  return (
    <Modal title={t('welcome.title')} onClose={() => hasDesign && setShow(false)}>
      <Field label={t('welcome.template')} group>
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
          {userTpls.length > 0 && <p className="mt-1 text-[11px] font-extrabold tracking-[0.08em] text-ink-soft uppercase">{t('tpl.mine')}</p>}
          {userTpls.map((tp) => (
            <label key={tp.id} className={`flex cursor-pointer gap-2 rounded-md border px-2 py-1.5 ${template === `user:${tp.id}` ? 'border-accent bg-accent-soft' : 'border-line bg-white/60'}`}>
              <input type="radio" name="tpl" checked={template === `user:${tp.id}`} onChange={() => setTemplate(`user:${tp.id}`)} className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-semibold">{tp.name}</span>
                {tp.description && <span className="block text-[11.5px] text-ink-soft">{tp.description}</span>}
              </span>
            </label>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('welcome.year')}>
          <NumberInput value={year} min={1900} max={2200} integer onChange={(v) => setYear(Math.round(v))} />
        </Field>
        <Field label={t('welcome.language')}>
          <Select
            value={lang}
            onChange={(v) => {
              setLang(v);
              // Un país de otro idioma pasa al país típico del nuevo (Argentina → Estados Unidos).
              const spoken = countryLang(country);
              if (spoken && spoken !== v) setCountry(homeCountry(v, userRegion) ?? '');
              // La interfaz se pasa al mismo idioma y vuelve a seguir al de la agenda.
              useStore.getState().followAgendaLang(v);
            }}
            options={LANGUAGES.map((l) => ({ value: l, label: UI_LANG_NAMES[l] }))}
          />
        </Field>
      </div>
      <Field label={t('welcome.country')} hint={t('welcome.countryHint')}>
        <Select value={country} onChange={setCountry} options={[{ value: '', label: '—' }, ...countries]} />
      </Field>
      {/* Los controles se alinean por abajo: un rótulo largo puede ocupar dos líneas sin descolocar a los demás. */}
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] items-end gap-2">
        <Field label={t('cal.weekStart')}>
          <Select
            value={weekStart}
            onChange={setWeekStart}
            options={[
              { value: 'auto', label: `${t('cal.weekStart.auto')} (${firstName})` },
              ...(['monday', 'sunday', 'saturday'] as const).map((v) => ({ value: v, label: t(`cal.weekStart.${v}`) })),
            ]}
          />
        </Field>
        <Field label={t('cal.startMonth')}>
          <Select value={String(startMonth)} onChange={(v) => setStartMonth(Number(v))} options={uiMonths.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        <Field label={t('cal.monthCount')}>
          <NumberInput value={monthCount} min={1} max={24} integer onChange={(v) => setMonthCount(Math.min(24, Math.max(1, Math.round(v))))} />
        </Field>
      </div>
      <Field label={t('welcome.name')}>
        <TextInput value={name} onChange={setName} />
      </Field>
      <div className="mt-3 flex justify-end gap-2">
        {hasDesign && (
          <Button variant="ghost" onClick={() => setShow(false)}>
            {t('welcome.cancel')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => void openAnyFile()}>
          <FileUp size={14} /> {t('welcome.openFile')}
        </Button>
        <Button variant="primary" onClick={create}>
          {t('welcome.create')}
        </Button>
      </div>
      <div className="mt-2 border-t border-line pt-1">
        <Toggle label={t('welcome.showAtStart')} checked={welcomeOnStart} onChange={setWelcomeOnStart} />
      </div>
    </Modal>
  );
}

/** Enlace a una dirección web: se abre fuera de la aplicación (el navegador o, en el escritorio, el predeterminado). */
function ExternalLink(props: { href: string; children: React.ReactNode }) {
  return (
    <a href={props.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">
      {props.children}
    </a>
  );
}

/** «Acerca de»: versión, enlaces, dónde se guardan los datos y licencias. */
export function AboutDialog() {
  const t = useT();
  const setShow = useStore((s) => s.setShowAbout);
  const [copied, setCopied] = useState(false);
  const folder = dataFolderFor(navigator.userAgent);
  const fonts = resources.manifest?.families ?? [];
  const copyFolder = (): void => {
    if (!folder) return;
    navigator.clipboard.writeText(folder).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <Modal title={t('about.title')} onClose={() => setShow(false)}>
      <p className="text-[12.5px] font-semibold text-ink-soft">{t('about.version', { version: __APP_VERSION__ })}</p>
      <p className="mt-1 text-[12.5px] leading-snug">{t('app.tagline')}</p>

      <h3 className="mt-3 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('about.links')}</h3>
      <ul className="mt-1 space-y-0.5 text-[12.5px]">
        <li>
          <ExternalLink href={__APP_HOMEPAGE__}>{t('about.repository')}</ExternalLink>
        </li>
        <li>
          <ExternalLink href={`${__APP_HOMEPAGE__}/releases`}>{t('about.releases')}</ExternalLink>
        </li>
        <li>
          <ExternalLink href={`${__APP_HOMEPAGE__}/issues`}>{t('about.issues')}</ExternalLink>
        </li>
      </ul>

      <h3 className="mt-3 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('about.dataTitle')}</h3>
      {folder ? (
        <>
          <p className="mt-1 text-[12.5px] leading-snug">{t('about.dataDesktop')}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[12px] break-all">{folder}</code>
            <Button onClick={copyFolder}>
              <Copy size={13} /> {copied ? t('about.copied') : t('about.copyPath')}
            </Button>
          </p>
        </>
      ) : (
        <p className="mt-1 text-[12.5px] leading-snug">{t('about.dataWeb', { origin: location.origin })}</p>
      )}

      <h3 className="mt-3 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('about.licenses')}</h3>
      <p className="mt-1 text-[12px] font-semibold">{t('about.fonts')}</p>
      <ul className="text-[12px] text-ink-soft">
        {fonts.map((f) => (
          <li key={f.family}>
            {f.family} — {f.designer}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] leading-snug text-ink-soft">{t('about.holidays')}</p>
      <p className="mt-2 text-[12px] leading-snug text-ink-soft">{t('about.libraries')}</p>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" onClick={() => setShow(false)}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  );
}

/** «Guardar como plantilla»: el diseño completo para empezar otras agendas. */
export function SaveTemplateDialog() {
  const t = useT();
  const design = useStore((s) => s.design);
  const setShow = useStore((s) => s.setShowSaveTemplate);
  const setNotice = useStore((s) => s.setNotice);
  const [name, setName] = useState(design?.name ?? '');
  const [description, setDescription] = useState('');
  const [strip, setStrip] = useState(false);
  if (!design) return null;
  return (
    <Modal title={t('tpl.saveTitle')} onClose={() => setShow(false)}>
      <p className="pb-2 text-[12px] leading-snug text-ink-soft">{t('tpl.saveHelp')}</p>
      <Field label={t('tpl.name')}>
        <TextInput value={name} onChange={setName} />
      </Field>
      <Field label={t('tpl.description')}>
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Toggle label={t('tpl.stripPersonal')} checked={strip} onChange={setStrip} />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setShow(false)}>
          {t('welcome.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={async () => {
            const tpl = await saveAsTemplate(design, name, description, strip);
            setNotice(t('tpl.saved', { name: tpl.name }));
            setShow(false);
          }}
        >
          {t('tpl.save')}
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
  const closeDesign = useStore((s) => s.closeDesign);
  const setNotice = useStore((s) => s.setNotice);
  const [items, setItems] = useState<DesignMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tpls, setTpls] = useState<TemplateRecord[]>([]);
  const refreshTemplates = (): void => void listTemplates().then(setTpls);
  useEffect(refreshTemplates, []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const refresh = (): void => void listDesigns().then(setItems);
  useEffect(refresh, []);

  const close = (): void => {
    setShow(false);
    // Sin agenda abierta (p. ej. se borró la actual), se ofrece crear una.
    if (!useStore.getState().design) setShowWelcome(true);
  };

  const open = async (id: string, transform?: (d: Design) => Design): Promise<void> => {
    try {
      const d = await loadDesign(id);
      if (!d) return;
      const next = transform ? transform(d) : d;
      if (transform) await saveDesign(next);
      setDesign(next);
      setShow(false);
    } catch (e) {
      setErr(`${t('notice.loadFailed')} ${(e as Error).message}`);
    }
  };

  const onImport = async (files: FileList | null): Promise<void> => {
    const f = files?.[0];
    if (!f) return;
    try {
      const r = await importText(await f.text());
      if (r.kind === 'design') {
        setDesign(r.design);
        setNotice(null);
        setShow(false);
      } else if (r.kind === 'template') {
        setInfo(t('file.templateAdded', { name: r.template.name }));
        refreshTemplates();
      } else {
        setInfo(t('file.restored', { designs: r.designs, templates: r.templates }));
        refresh();
        refreshTemplates();
      }
    } catch (e) {
      setErr(`${t('notice.importFailed')} ${(e as Error).message}`);
    }
  };

  return (
    <Modal title={t('lib.title')} onClose={close}>
      {err && (
        <p role="alert" className="mb-2 rounded-md border border-warn/40 bg-[#fbf3e4] px-2 py-1.5 text-[12px] break-words text-ink">
          {err}
        </p>
      )}
      {info && (
        <p role="status" className="mb-2 rounded-md border border-line bg-accent-soft px-2 py-1.5 text-[12px] break-words text-ink">
          {info}
        </p>
      )}
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
        <input
          ref={fileRef}
          type="file"
          accept=".json,.agenda.json,application/json"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            void onImport(files).finally(() => {
              // Permite volver a elegir el mismo archivo.
              e.target.value = '';
            });
          }}
        />
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
                onClick={() => void open(it.id)}
              >
                <span className="block text-[13px] font-semibold">{it.name}</span>
                <span className="block text-[11px] text-ink-soft">
                  {it.year} · {new Date(it.updatedAt).toLocaleString()}
                </span>
              </button>
              <Button
                variant="ghost"
                title={t('lib.duplicate', { year: it.year + 1 })}
                onClick={() => void open(it.id, (d) => duplicateForYear(d, d.calendar.year + 1))}
              >
                <Copy size={14} /> {it.year + 1}
              </Button>
              <Button
                variant="ghost"
                title={t('lib.delete')}
                onClick={async () => {
                  if (!window.confirm(t('lib.confirmDelete', { name: it.name }))) return;
                  // Si es la agenda abierta, se cierra sin volver a guardarla.
                  if (useStore.getState().design?.id === it.id) closeDesign();
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
      <h3 className="mt-4 mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('tpl.mine')}</h3>
      {tpls.length === 0 ? (
        <p className="text-[12px] text-ink-soft">{t('tpl.none')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-white/60">
          {tpls.map((tp) => (
            <li key={tp.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{tp.name}</span>
                {tp.description && <span className="block truncate text-[11px] text-ink-soft">{tp.description}</span>}
              </span>
              <Button variant="ghost" title={t('tpl.export')} onClick={() => void exportTemplateFile(tp)}>
                <Download size={14} />
              </Button>
              <Button
                variant="ghost"
                title={t('tpl.delete')}
                onClick={async () => {
                  if (!window.confirm(t('tpl.confirmDelete', { name: tp.name }))) return;
                  await deleteTemplate(tp.id);
                  refreshTemplates();
                }}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button onClick={() => void backupAll()}>
          <Archive size={14} /> {t('file.backup')}
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-ink-soft">{t('lib.storageNote')}</p>
    </Modal>
  );
}

/** Los atajos de teclado, por grupo, generados del registro: lo que se lista es lo que existe. */
export function ShortcutsDialog() {
  const t = useT();
  const setShow = useStore((s) => s.setShowShortcuts);
  const groups = SHORTCUT_GROUPS.map((g) => ({ g, items: SHORTCUTS.filter((s) => s.group === g) })).filter((x) => x.items.length > 0);
  return (
    <Modal title={t('sc.title')} onClose={() => setShow(false)}>
      <p className="mb-2 text-[12px] leading-snug text-ink-soft">{t('sc.intro')}</p>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {groups.map(({ g, items }) => (
          <section key={g} aria-label={t(`sc.group.${g}`)}>
            <h3 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t(`sc.group.${g}`)}</h3>
            <dl className="space-y-1 text-[12.5px]">
              {items.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3">
                  <dt className="min-w-0">{t(`sc.${s.id}` as UiKey)}</dt>
                  <dd className="shrink-0 text-right text-ink-soft tabular-nums">{chordLabels(s.id, t).join('  ·  ')}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-soft">{t('sc.browserNote')}</p>
    </Modal>
  );
}
