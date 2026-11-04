import type { CustomMethod } from '@core/design/schema';
import { CATEGORY_ORDER, METHODS, methodText, type PlannerMethod } from '@core/methods/catalog';
import { newId } from '@core/util/hash';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { sectionName, useT, type UiKey } from '../../i18n/ui';
import { useStore } from '../../state/store';
import { Badge, Button, Field, Group, Select, TextArea, TextInput, Toggle } from '../ui';

function MethodCard({ m }: { m: PlannerMethod }) {
  const t = useT();
  const lang = useStore((s) => s.uiLang);
  const enabled = useStore((s) => s.design?.methods.enabled.includes(m.id) ?? false);
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState(false);
  const txt = methodText(m, lang);
  const toggle = (v: boolean): void =>
    update((d) => {
      const set = new Set(d.methods.enabled);
      if (v) set.add(m.id);
      else set.delete(m.id);
      d.methods.enabled = [...set];
    });
  const enableSuggested = (): void =>
    update((d) => {
      for (const type of m.suggests ?? []) {
        const s = d.sections.find((x) => x.type === type);
        if (s) s.enabled = true;
        for (const sec of d.sections) for (const it of sec.items ?? []) if (it.type === type) it.enabled = true;
      }
    });
  return (
    <li className="rounded-md border border-line bg-white/60 px-2 py-1.5">
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={enabled} onChange={(e) => toggle(e.target.checked)} aria-label={txt.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold">{txt.name}</span>
            <Badge tone={m.evidence}>{t(`level.${m.evidence}`)}</Badge>
          </div>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={txt.name}
            className="mt-0.5 flex w-full items-start gap-1 text-left text-[11px] text-ink-soft hover:text-ink"
          >
            <span className="mt-[1px] shrink-0">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            <span>{open ? '' : `${txt.text.slice(0, 70)}…`}</span>
          </button>
          {open && (
            <div className="mt-1 space-y-1.5 text-[11.5px] leading-snug">
              <p>{txt.text}</p>
              {(m.affects?.length ?? 0) > 0 && (
                <p className="text-ink-soft">
                  <b>{t('methods.affects')}:</b> {m.affects!.map((a) => sectionName(t, a)).join(', ')}
                </p>
              )}
              {(m.suggests?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-ink-soft">
                    <b>{t('methods.suggests')}:</b> {m.suggests!.map((a) => sectionName(t, a)).join(', ')}
                  </span>
                  <Button variant="ghost" onClick={enableSuggested}>
                    {t('methods.enableSuggested')}
                  </Button>
                </div>
              )}
              <div>
                <b className="text-ink-soft">{t('methods.refs')}:</b>
                <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-[10.5px] text-ink-soft">
                  {m.refs.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function MethodsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const [draft, setDraft] = useState<CustomMethod>({ id: '', name: '', text: '', evidence: 'practice', evidenceText: '', references: [] });
  return (
    <div>
      <p className="py-2 text-[12px] leading-snug text-ink-soft">{t('methods.intro')}</p>
      <Toggle label={t('methods.evidence')} checked={design.methods.guide.evidence} onChange={(v) => update((d) => void (d.methods.guide.evidence = v))} />
      <Toggle label={t('methods.references')} checked={design.methods.guide.references} onChange={(v) => update((d) => void (d.methods.guide.references = v))} />
      {CATEGORY_ORDER.map((cat) => {
        const list = METHODS.filter((m) => m.category === cat);
        if (list.length === 0) return null;
        return (
          <Group key={cat} title={t(`cat.${cat}` as UiKey)} defaultOpen={cat === 'planning' || cat === 'goals' || cat === 'habits'}>
            <ul className="space-y-1.5">
              {list.map((m) => (
                <MethodCard key={m.id} m={m} />
              ))}
            </ul>
          </Group>
        );
      })}
      <Group title={t('methods.custom')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('methods.customHelp')}</p>
        <ul className="mb-2 space-y-1.5">
          {design.methods.custom.map((m, i) => (
            <li key={m.id} className="flex items-start justify-between gap-2 rounded-md border border-line bg-white/60 px-2 py-1.5 text-[12px]">
              <span>
                <b>{m.name}</b> <Badge tone={m.evidence}>{t(`level.${m.evidence}`)}</Badge>
                <span className="block text-[11px] text-ink-soft">{m.text.slice(0, 90)}</span>
              </span>
              <button type="button" className="rounded p-1 text-warn hover:bg-black/5" onClick={() => update((d) => void d.methods.custom.splice(i, 1))} aria-label={t('common.remove')}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <Field label={t('methods.name')}>
          <TextInput value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
        </Field>
        <Field label={t('methods.text')}>
          <TextArea value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })} rows={3} />
        </Field>
        <Field label={t('methods.level')}>
          <Select value={draft.evidence} onChange={(v) => setDraft({ ...draft, evidence: v })} options={(['strong', 'moderate', 'limited', 'practice', 'contested'] as const).map((v) => ({ value: v, label: t(`level.${v}`) }))} />
        </Field>
        <Field label={t('methods.evidenceText')}>
          <TextArea value={draft.evidenceText} onChange={(v) => setDraft({ ...draft, evidenceText: v })} rows={2} />
        </Field>
        <Field label={t('methods.refList')}>
          <TextArea value={draft.references.join('\n')} onChange={(v) => setDraft({ ...draft, references: v.split('\n').map((x) => x.trim()).filter(Boolean) })} rows={2} />
        </Field>
        <Button
          variant="primary"
          disabled={!draft.name.trim()}
          onClick={() => {
            const m = { ...draft, id: newId('metodo') };
            update((d) => void d.methods.custom.push(m));
            setDraft({ id: '', name: '', text: '', evidence: 'practice', evidenceText: '', references: [] });
          }}
        >
          <Plus size={14} /> {t('methods.add')}
        </Button>
      </Group>
    </div>
  );
}
