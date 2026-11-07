import { dateOrder, formatDayMonth, formatNumeric, monthNames } from '@core/calendar/locale';
import { computeHolidays, countryName, HOLIDAY_TYPES, type HolidayType } from '@core/holidays';
import { LANGUAGES, langOf, localeFor } from '@core/i18n';
import { addMonths, daysInMonth, isoDate } from '@core/util/dates';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { isUiLang, UI_LANG_NAMES, useT, type UiKey } from '../../i18n/ui';

/** Idioma de una etiqueta tal como viene ('es-AR' → 'es', 'de-DE' → 'de'). */
const baseLang = (locale: string): string => locale.toLowerCase().split(/[-_]/)[0] || 'es';
import { showMonth } from '../../state/months';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { Button, Field, Group, NumberInput, Select, TextInput, Toggle } from '../ui';

export function CalendarPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const uiLang = useStore((s) => s.uiLang);
  const setUiLang = useStore((s) => s.setUiLang);
  const update = useStore((s) => s.update);
  const resVersion = useStore((s) => s.resVersion);
  const c = design.calendar;
  const months = monthNames(design.locale);
  const index = resources.holidayIndex;
  const lang = langOf(design.locale);
  const countries = useMemo(
    () =>
      (index?.countries ?? [])
        .map((x) => ({ value: x.code, label: countryName(index, x.code, lang) }))
        .sort((a, b) => a.label.localeCompare(b.label, lang)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, lang, resVersion],
  );
  const subdivisions = useMemo(() => {
    const entry = index?.countries.find((x) => x.code === design.holidays.country);
    return Object.entries(entry?.subdivisions ?? {}).map(([code, name]) => ({ value: code, label: name }));
  }, [index, design.holidays.country]);
  const data = resources.holidaysFor(design.holidays.country);
  // Los feriados de los meses de la agenda (que puede empezar a mitad de año o durar más de doce meses).
  const span = useMemo(() => {
    const last = addMonths(c.year, c.startMonth, c.monthCount - 1);
    return { from: isoDate(c.year, c.startMonth, 1), to: isoDate(last.y, last.m, daysInMonth(last.y, last.m)) };
  }, [c.year, c.startMonth, c.monthCount]);
  const list = useMemo(() => {
    if (!data) return [];
    const q = { subdivision: design.holidays.subdivision, lang, from: span.from, to: span.to };
    const all = computeHolidays(data, { ...q, types: HOLIDAY_TYPES });
    // El que va impreso cada día (y al que un nombre propio reemplaza) es el primero de los que quedan con
    // los tipos elegidos y lo quitado o agregado a mano: puede no ser el primero de la lista completa.
    const printed = computeHolidays(data, { ...q, types: design.holidays.types as HolidayType[], edits: { added: design.holidays.added, removed: design.holidays.removed, renamed: {} } });
    return [...all.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).flatMap(([date, hs]) => {
      const shown = printed.get(date)?.[0];
      return hs.map((h) => ({ ...h, first: shown !== undefined && !shown.custom && shown.name === h.name }));
    });
  }, [data, span, design.holidays.subdivision, design.holidays.types, design.holidays.added, design.holidays.removed, lang]);
  // El feriado cuyo nombre se está cambiando (su fecha) y lo escrito.
  const [renaming, setRenaming] = useState<{ date: string; text: string } | null>(null);
  // Esc cierra el campo sin guardar: el `blur` que pueda llegar al cerrarse no debe guardar.
  const cancelled = useRef(false);
  const rename = (date: string, original: string, text: string): void => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const name = text.trim();
    update((d) => {
      // Vacío o igual al original: vuelve al nombre de siempre.
      if (!name || name === original) delete d.holidays.renamed[date];
      else d.holidays.renamed[date] = name;
    }, `holiday:rename:${date}`);
    setRenaming(null);
  };
  const [newDate, setNewDate] = useState(`${c.year}-01-01`);
  const [newName, setNewName] = useState('');
  const range = index?.range;

  return (
    <div>
      <Group title={t('tab.calendar')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('cal.year')}>
            <NumberInput value={c.year} min={1900} max={2200} integer onChange={(v) => update((d) => void (d.calendar.year = Math.round(v)), 'cal:year')} />
          </Field>
          <Field label={t('cal.monthCount')}>
            <NumberInput value={c.monthCount} min={1} max={24} integer onChange={(v) => update((d) => void (d.calendar.monthCount = Math.round(v)), 'cal:count')} />
          </Field>
        </div>
        <Field label={t('cal.startMonth')}>
          <Select value={String(c.startMonth)} onChange={(v) => update((d) => void (d.calendar.startMonth = Number(v)))} options={months.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        {c.hiddenMonths.length > 0 && (
          <Field label={t('cal.hiddenMonths')} group>
            <div className="flex flex-wrap gap-1.5">
              {c.hiddenMonths.map((k) => {
                const [y, m] = k.split('-').map(Number);
                return (
                  <Button key={k} variant="outline" onClick={() => showMonth(k)}>
                    {t('cal.showMonth', { month: `${months[(m ?? 1) - 1] ?? k} ${y}` })}
                  </Button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label={t('cal.locale')} hint={t('cal.uiHint')}>
          <Select
            value={baseLang(design.locale)}
            onChange={(v) => update((d) => void (d.locale = localeFor(v, d.holidays.country)))}
            options={[
              ...LANGUAGES.map((l) => ({ value: l as string, label: UI_LANG_NAMES[l] })),
              // Un idioma de un archivo hecho a mano que la agenda no trae: se muestra tal cual.
              ...((LANGUAGES as readonly string[]).includes(baseLang(design.locale)) ? [] : [{ value: baseLang(design.locale), label: design.locale }]),
            ]}
          />
        </Field>
        {(() => {
          const l = langOf(design.locale);
          return isUiLang(l) && l !== uiLang ? (
            <button type="button" className="mb-1 text-left text-[12px] font-semibold text-accent underline" onClick={() => setUiLang(l)}>
              {t('cal.useForUi', { lang: UI_LANG_NAMES[l] })}
            </button>
          ) : null;
        })()}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('cal.weekStart')}>
            <Select value={c.weekStart} onChange={(v) => update((d) => void (d.calendar.weekStart = v))} options={(['auto', 'monday', 'sunday', 'saturday'] as const).map((v) => ({ value: v, label: t(`cal.weekStart.${v}`) }))} />
          </Field>
          <Field label={t('cal.numbering')}>
            <Select value={c.numbering} onChange={(v) => update((d) => void (d.calendar.numbering = v))} options={(['iso', 'simple', 'none'] as const).map((v) => ({ value: v, label: t(`cal.numbering.${v}`) }))} />
          </Field>
        </div>
        <Field label={t('cal.dateFormat')} hint={t('cal.dateFormatHint')}>
          <Select
            value={c.dateFormat}
            onChange={(v) => update((d) => void (d.calendar.dateFormat = v))}
            options={(['auto', 'dmy', 'mdy', 'ymd'] as const).map((v) => {
              const o = dateOrder(design.locale, v);
              const ex = `${formatNumeric(`${c.year}-03-31`, o, true)} · ${formatDayMonth(design.locale, `${c.year}-03-31`, o)}`;
              return { value: v, label: `${t(`cal.dateFormat.${v}`)} (${ex})` };
            })}
          />
        </Field>
      </Group>

      <Group title={t('cal.holidays')}>
        {range && (c.year < range[0] || c.year > range[1]) && <p className="mb-1 text-[11.5px] text-warn">{t('cal.outOfRange', { from: range[0], to: range[1] })}</p>}
        <Field label={t('cal.country')}>
          <Select
            value={design.holidays.country ?? ''}
            onChange={(v) =>
              update((d) => {
                d.holidays.country = v || null;
                d.holidays.subdivision = null;
                // La región de la agenda (fechas, moneda, semana) es la del país.
                d.locale = localeFor(baseLang(d.locale), v || null);
              })
            }
            options={[{ value: '', label: t('cal.noCountry') }, ...countries]}
          />
        </Field>
        {subdivisions.length > 0 && (
          <Field label={t('cal.subdivision')}>
            <Select value={design.holidays.subdivision ?? ''} onChange={(v) => update((d) => void (d.holidays.subdivision = v || null))} options={[{ value: '', label: t('cal.allCountry') }, ...subdivisions]} />
          </Field>
        )}
        <div className="py-1">
          <div className="mb-0.5 text-[11.5px] font-semibold text-ink-soft">{t('cal.types')}</div>
          {HOLIDAY_TYPES.map((ty) => (
            <Toggle
              key={ty}
              label={t(`type.${ty}` as UiKey)}
              checked={design.holidays.types.includes(ty)}
              onChange={(v) =>
                update((d) => {
                  const s = new Set<HolidayType>(d.holidays.types as HolidayType[]);
                  if (v) s.add(ty);
                  else s.delete(ty);
                  d.holidays.types = [...s];
                })
              }
            />
          ))}
        </div>
        <div className="mt-1 text-[11.5px] font-semibold text-ink-soft">{span.from.slice(0, 4) === span.to.slice(0, 4) ? t('cal.list', { year: c.year }) : t('cal.listSpan', { from: span.from.slice(0, 4), to: span.to.slice(0, 4) })}</div>
        <p className="text-[11px] leading-snug text-ink-soft">{t('cal.renameHelp')}</p>
        <ul className="mt-1 space-y-1" data-testid="holiday-list">
          {list.map((h, i) => {
            const removed = design.holidays.removed.includes(h.date) || design.holidays.removed.includes(`${h.date}|${h.name}`);
            const active = design.holidays.types.includes(h.type);
            // Un nombre propio reemplaza al feriado que va en la agenda ese día (el primero).
            const own = h.first ? design.holidays.renamed[h.date] : undefined;
            const editing = renaming?.date === h.date && h.first;
            return (
              <li key={`${h.date}-${i}`} className={`flex items-start gap-1.5 text-[11.5px] ${removed || !active ? 'opacity-45' : ''}`} data-holiday={h.date}>
                <span className="w-[74px] shrink-0 tabular-nums text-ink-soft">{formatNumeric(h.date, dateOrder(design.locale, c.dateFormat))}</span>
                {editing ? (
                  <span className="min-w-0 flex-1">
                    <TextInput
                      value={renaming.text}
                      ariaLabel={t('cal.renameField', { name: h.name })}
                      autoFocus
                      onChange={(text) => setRenaming({ date: h.date, text })}
                      onBlur={() => rename(h.date, h.name, renaming.text)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(h.date, h.name, renaming.text);
                        else if (e.key === 'Escape') {
                          e.stopPropagation();
                          cancelled.current = true;
                          setRenaming(null);
                          // Solo para el `blur` de este cierre: si no llega, no debe tragarse el próximo cambio de nombre.
                          setTimeout(() => {
                            cancelled.current = false;
                          }, 0);
                        }
                      }}
                    />
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    {own ?? h.name}
                    <span className="ml-1 text-[10px] text-ink-soft">({t(`type.${h.type}` as UiKey)})</span>
                    {own && (
                      <span className="block text-[10.5px] text-ink-soft" title={h.name}>
                        {t('cal.renamedFrom', { name: h.name })}
                      </span>
                    )}
                  </span>
                )}
                {h.first && !removed && !editing && (
                  <button
                    type="button"
                    className="text-ink-soft hover:text-ink"
                    title={t('cal.rename')}
                    aria-label={`${t('cal.rename')}: ${own ?? h.name}`}
                    onClick={() => {
                      cancelled.current = false;
                      setRenaming({ date: h.date, text: own ?? h.name });
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {own && !editing && (
                  <button type="button" className="text-accent" title={t('cal.renameUndo')} aria-label={`${t('cal.renameUndo')}: ${h.name}`} onClick={() => rename(h.date, h.name, '')}>
                    <RotateCcw size={13} />
                  </button>
                )}
                {removed ? (
                  <button type="button" className="text-accent" title={t('cal.restore')} onClick={() => update((d) => void (d.holidays.removed = d.holidays.removed.filter((x) => x !== h.date && x !== `${h.date}|${h.name}`)))}>
                    <RotateCcw size={13} />
                  </button>
                ) : (
                  <button type="button" className="text-warn" title={t('cal.removeOne')} onClick={() => update((d) => void d.holidays.removed.push(`${h.date}|${h.name}`))}>
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            );
          })}
          {design.holidays.added.map((a, i) => (
            <li key={`add-${i}`} className="flex items-start gap-1.5 text-[11.5px]">
              <span className="w-[74px] shrink-0 tabular-nums text-ink-soft">{formatNumeric(a.date, dateOrder(design.locale, c.dateFormat))}</span>
              <span className="flex-1 font-semibold">{a.name}</span>
              <button type="button" className="text-warn" onClick={() => update((d) => void d.holidays.added.splice(i, 1))} aria-label={t('common.remove')}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-[110px_1fr] gap-1.5">
          <input type="date" className="rounded-md border border-line bg-white px-1.5 py-1 text-[12px]" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label={t('cal.date')} />
          <TextInput value={newName} onChange={setNewName} placeholder={t('cal.name')} />
        </div>
        <div className="pt-1.5">
          <Button
            disabled={!newName.trim()}
            onClick={() => {
              update((d) => void d.holidays.added.push({ date: newDate, name: newName.trim(), type: 'public' }));
              setNewName('');
            }}
          >
            <Plus size={14} /> {t('cal.add')}
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-ink-soft">{t('cal.sourceCheck')}</p>
        <p className="mt-1 text-[11px] leading-snug text-ink-soft">
          {t('cal.source')}{' '}
          <a className="underline" href="https://github.com/commenthol/date-holidays" target="_blank" rel="noreferrer">
            date-holidays
          </a>{' '}
          · <a className="underline" href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a>
        </p>
      </Group>

      <Group title={t('cal.moon')} defaultOpen={false}>
        <Toggle label={t('cal.moon')} checked={design.astronomy.moonPhases} onChange={(v) => update((d) => void (d.astronomy.moonPhases = v))} />
        <div className="text-[11.5px] font-semibold text-ink-soft">{t('cal.moonWhere')}</div>
        {(['monthLog', 'week', 'yearOverview', 'monthGrid', 'daily'] as const).map((w) => (
          <Toggle
            key={w}
            label={t(`cal.where.${w}`)}
            checked={design.astronomy.showIn.includes(w)}
            onChange={(v) =>
              update((d) => {
                const s = new Set(d.astronomy.showIn);
                if (v) s.add(w);
                else s.delete(w);
                d.astronomy.showIn = [...s];
              })
            }
          />
        ))}
        <Field label={t('cal.hemisphere')}>
          <Select value={design.astronomy.hemisphere} onChange={(v) => update((d) => void (d.astronomy.hemisphere = v))} options={(['auto', 'north', 'south'] as const).map((v) => ({ value: v, label: t(`cal.hemisphere.${v}`) }))} />
        </Field>
        <Field label={t('cal.timeZone')}>
          <TextInput value={c.timeZone} onChange={(v) => update((d) => void (d.calendar.timeZone = v || 'auto'), 'cal:tz')} placeholder="auto / America/Argentina/Buenos_Aires" />
        </Field>
      </Group>
    </div>
  );
}

