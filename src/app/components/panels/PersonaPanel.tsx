import { monthNames } from '@core/calendar/locale';
import { listStringKeys, resolveStrings } from '@core/i18n';
import { newId } from '@core/util/hash';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '../../i18n/ui';
import { useStore } from '../../state/store';
import { Button, Field, Group, NumberInput, Select, TextArea, TextInput } from '../ui';

export function PersonaPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const p = design.persona;
  const months = monthNames(design.locale);
  const defaults = useMemo(() => resolveStrings(design.locale, {}), [design.locale]);
  const [query, setQuery] = useState('');
  const labelRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listStringKeys(defaults)
      .filter((r) => !r.key.startsWith('phrases.') && !r.key.startsWith('calibration.'))
      .filter((r) => !q || r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q) || (p.labels[r.key] ?? '').toLowerCase().includes(q))
      .slice(0, 80);
  }, [defaults, query, p.labels]);
  const phrases = p.phrases.length >= 12 ? p.phrases : defaults.phrases;

  return (
    <div>
      <Group title={t('tab.persona')}>
        <Field label={t('persona.name')}>
          <TextInput value={p.name} onChange={(v) => update((d) => void (d.persona.name = v), 'p:name')} />
        </Field>
        <Field label={t('persona.title')}>
          <TextInput value={p.title} placeholder={defaults.titlePage.title} onChange={(v) => update((d) => void (d.persona.title = v), 'p:title')} />
        </Field>
        <Field label={t('persona.subtitle')}>
          <TextInput value={p.subtitle} onChange={(v) => update((d) => void (d.persona.subtitle = v), 'p:subtitle')} />
        </Field>
        <Field label={t('persona.dedicationTitle')}>
          <TextInput value={p.dedicationTitle} onChange={(v) => update((d) => void (d.persona.dedicationTitle = v), 'p:dt')} />
        </Field>
        <Field label={t('persona.dedication')}>
          <TextArea value={p.dedication} onChange={(v) => update((d) => void (d.persona.dedication = v), 'p:ded')} rows={5} />
        </Field>
      </Group>

      <Group title={t('persona.dates')}>
        <ul className="space-y-1.5">
          {design.personalDates.map((pd, i) => (
            <li key={pd.id} className="grid grid-cols-[52px_1fr_1.6fr_28px] items-center gap-1.5">
              <NumberInput value={pd.day} min={1} max={31} onChange={(v) => update((d) => void (d.personalDates[i]!.day = v), `pd:${pd.id}:d`)} />
              <Select value={String(pd.month)} onChange={(v) => update((d) => void (d.personalDates[i]!.month = Number(v)))} options={months.map((m, k) => ({ value: String(k + 1), label: m }))} />
              <TextInput value={pd.label} onChange={(v) => update((d) => void (d.personalDates[i]!.label = v), `pd:${pd.id}:l`)} />
              <button type="button" className="rounded p-1 text-warn hover:bg-black/5" onClick={() => update((d) => void d.personalDates.splice(i, 1))} aria-label={t('common.remove')}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="pt-2">
          <Button onClick={() => update((d) => void d.personalDates.push({ id: newId('fecha'), day: 1, month: 1, label: '', kind: 'birthday', year: null }))}>
            <Plus size={14} /> {t('persona.addDate')}
          </Button>
        </div>
      </Group>

      <Group title={t('persona.phrases')} defaultOpen={false}>
        <p className="pb-1 text-[11px] leading-snug text-ink-soft">{t('persona.phrasesHelp')}</p>
        {months.map((m, i) => (
          <Field key={m} label={m}>
            <TextInput
              value={phrases[i] ?? ''}
              onChange={(v) =>
                update((d) => {
                  const arr = d.persona.phrases.length >= 12 ? [...d.persona.phrases] : [...phrases];
                  arr[i] = v;
                  d.persona.phrases = arr;
                }, `p:ph:${i}`)
              }
            />
          </Field>
        ))}
        <Button variant="ghost" onClick={() => update((d) => void (d.persona.phrases = []))}>
          <RotateCcw size={14} /> {t('persona.useDefaults')}
        </Button>
      </Group>

      <Group title={t('persona.labels')} defaultOpen={false}>
        <p className="pb-1 text-[11px] leading-snug text-ink-soft">{t('persona.labelsHelp')}</p>
        <TextInput value={query} onChange={setQuery} placeholder={t('persona.search')} />
        <ul className="mt-2 space-y-1.5">
          {labelRows.map((r) => (
            <li key={r.key}>
              <div className="text-[10.5px] text-ink-soft">{r.key}</div>
              <TextInput
                value={p.labels[r.key] ?? r.value}
                onChange={(v) =>
                  update((d) => {
                    if (v === r.value) delete d.persona.labels[r.key];
                    else d.persona.labels[r.key] = v;
                  }, `lab:${r.key}`)
                }
              />
            </li>
          ))}
        </ul>
      </Group>
    </div>
  );
}
