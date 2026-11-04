import { monthNames } from '@core/calendar/locale';
import { computeHolidays, countryName, HOLIDAY_TYPES, type HolidayType } from '@core/holidays';
import { langOf } from '@core/i18n';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT, type UiKey } from '../../i18n/ui';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { Button, Field, Group, NumberInput, Select, TextInput, Toggle } from '../ui';

export const LOCALES = [
  { value: 'es-AR', label: 'Español (Argentina)' },
  { value: 'es-UY', label: 'Español (Uruguay)' },
  { value: 'es-CL', label: 'Español (Chile)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'es-CO', label: 'Español (Colombia)' },
  { value: 'es-PE', label: 'Español (Perú)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'it-IT', label: 'Italiano (Italia)' },
];

export function CalendarPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
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
  const list = useMemo(() => {
    if (!data) return [];
    const from = `${c.year}-01-01`;
    const to = `${c.year}-12-31`;
    const all = computeHolidays(data, { subdivision: design.holidays.subdivision, types: HOLIDAY_TYPES, lang, from, to });
    return [...all.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).flatMap(([, hs]) => hs);
  }, [data, c.year, design.holidays.subdivision, lang]);
  const [newDate, setNewDate] = useState(`${c.year}-01-01`);
  const [newName, setNewName] = useState('');
  const range = index?.range;

  return (
    <div>
      <Group title={t('tab.calendar')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('cal.year')}>
            <NumberInput value={c.year} min={1900} max={2200} onChange={(v) => update((d) => void (d.calendar.year = Math.round(v)), 'cal:year')} />
          </Field>
          <Field label={t('cal.monthCount')}>
            <NumberInput value={c.monthCount} min={1} max={24} onChange={(v) => update((d) => void (d.calendar.monthCount = Math.round(v)), 'cal:count')} />
          </Field>
        </div>
        <Field label={t('cal.startMonth')}>
          <Select value={String(c.startMonth)} onChange={(v) => update((d) => void (d.calendar.startMonth = Number(v)))} options={months.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        <Field label={t('cal.locale')}>
          <Select value={design.locale} onChange={(v) => update((d) => void (d.locale = v))} options={LOCALES.some((l) => l.value === design.locale) ? LOCALES : [...LOCALES, { value: design.locale, label: design.locale }]} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('cal.weekStart')}>
            <Select value={c.weekStart} onChange={(v) => update((d) => void (d.calendar.weekStart = v))} options={(['auto', 'monday', 'sunday', 'saturday'] as const).map((v) => ({ value: v, label: t(`cal.weekStart.${v}`) }))} />
          </Field>
          <Field label={t('cal.numbering')}>
            <Select value={c.numbering} onChange={(v) => update((d) => void (d.calendar.numbering = v))} options={(['iso', 'simple', 'none'] as const).map((v) => ({ value: v, label: t(`cal.numbering.${v}`) }))} />
          </Field>
        </div>
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
        <div className="mt-1 text-[11.5px] font-semibold text-ink-soft">{t('cal.list', { year: c.year })}</div>
        <ul className="mt-1 space-y-1">
          {list.map((h, i) => {
            const removed = design.holidays.removed.includes(h.date) || design.holidays.removed.includes(`${h.date}|${h.name}`);
            const active = design.holidays.types.includes(h.type);
            return (
              <li key={`${h.date}-${i}`} className={`flex items-start gap-1.5 text-[11.5px] ${removed || !active ? 'opacity-45' : ''}`}>
                <span className="w-[74px] shrink-0 tabular-nums text-ink-soft">{dayMonth(h.date, design.locale)}</span>
                <span className="flex-1">
                  {design.holidays.renamed[h.date] ?? h.name}
                  <span className="ml-1 text-[10px] text-ink-soft">({t(`type.${h.type}` as UiKey)})</span>
                </span>
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
              <span className="w-[74px] shrink-0 tabular-nums text-ink-soft">{dayMonth(a.date, design.locale)}</span>
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

/** Día y mes en el orden del idioma de la agenda (18/01 en es-AR, 01/18 en en-US). */
function dayMonth(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso.slice(5).split('-').reverse().join('/');
  }
}
