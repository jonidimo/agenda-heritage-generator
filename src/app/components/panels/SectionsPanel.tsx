import type { CustomPage, SectionItem } from '@core/design/schema';
import { SECTION_REGISTRY } from '@core/sections/registry';
import { newId } from '@core/util/hash';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, FilePlus2, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { sectionName, useT, type UiKey } from '../../i18n/ui';
import { useDocument } from '../../state/doc';
import { useStore } from '../../state/store';
import { Button, Field, Group, NumberInput, Select, TextInput, Toggle } from '../ui';

/** Valores posibles de las opciones de texto (por «tipo.opción» o por opción). */
const OPTION_VALUES: Record<string, string[]> = {
  'weeks.variant': ['alastair', 'horizontal', 'vertical', 'daily'],
  'review.variant': ['auto', 'heritage', 'reflective'],
  footer: ['expenses', 'review', 'none'],
  style: ['auto', 'dots', 'lines', 'grid', 'blank'],
  spread: ['auto', 'true', 'false'],
  woop: ['auto', 'true', 'false'],
  priorities: ['auto', 'true', 'false'],
  detailed: ['auto', 'true', 'false'],
};

function OptionsForm({ type, options, onChange }: { type: string; options: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const t = useT();
  const mod = SECTION_REGISTRY.get(type);
  if (!mod) return null;
  const keys = Object.keys(mod.defaults);
  if (keys.length === 0) return null;
  return (
    <div className="mt-1 rounded-md bg-white/60 px-2 py-1">
      {keys.map((k) => {
        const def = mod.defaults[k];
        const cur = options[k] ?? def;
        const label = t(`opt.${k}` as UiKey);
        const values = OPTION_VALUES[`${type}.${k}`] ?? OPTION_VALUES[k];
        if (values) {
          const asStr = typeof cur === 'boolean' ? String(cur) : String(cur);
          return (
            <Field key={k} label={label}>
              <Select
                value={asStr}
                onChange={(v) => onChange(k, v === 'true' ? true : v === 'false' ? false : v)}
                options={values.map((v) => ({ value: v, label: t(`val.${v}` as UiKey) }))}
              />
            </Field>
          );
        }
        if (typeof def === 'boolean') return <Toggle key={k} label={label} checked={Boolean(cur)} onChange={(v) => onChange(k, v)} />;
        if (typeof def === 'number') {
          return (
            <Field key={k} label={label} inline>
              <div className="w-20">
                <NumberInput value={Number(cur)} min={0} max={200} step={1} onChange={(v) => onChange(k, v)} />
              </div>
            </Field>
          );
        }
        return null;
      })}
    </div>
  );
}

function ItemRow(props: { item: SectionItem; index: number; count: number; onToggle: (v: boolean) => void; onMove: (d: -1 | 1) => void; onOption: (k: string, v: unknown) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hasOptions = Object.keys(SECTION_REGISTRY.get(props.item.type)?.defaults ?? {}).length > 0;
  return (
    <li className={clsx('rounded-md px-1.5 py-1', props.item.enabled ? '' : 'opacity-60')}>
      <div className="flex items-center gap-1.5">
        <input type="checkbox" className="h-4 w-4" checked={props.item.enabled} onChange={(e) => props.onToggle(e.target.checked)} aria-label={sectionName(t, props.item.type)} />
        <span className="flex-1 truncate text-[12.5px]">{sectionName(t, props.item.type)}</span>
        {hasOptions && (
          <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5" onClick={() => setOpen(!open)} aria-label={t('common.options')} title={t('common.options')}>
            <Settings2 size={14} />
          </button>
        )}
        <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5 disabled:opacity-30" disabled={props.index === 0} onClick={() => props.onMove(-1)} aria-label={t('sections.up')} title={t('sections.up')}>
          <ArrowUp size={14} />
        </button>
        <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5 disabled:opacity-30" disabled={props.index === props.count - 1} onClick={() => props.onMove(1)} aria-label={t('sections.down')} title={t('sections.down')}>
          <ArrowDown size={14} />
        </button>
      </div>
      {open && <OptionsForm type={props.item.type} options={props.item.options} onChange={props.onOption} />}
    </li>
  );
}

export function SectionsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const pageIndex = useStore((s) => s.pageIndex);
  const goToPage = useStore((s) => s.goToPage);
  const { doc } = useDocument();

  const move = <T,>(arr: T[], i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  };

  const addCustomPage = (): void => {
    const anchor = doc?.plan.pages[pageIndex];
    const cp: CustomPage = {
      id: newId('pagina'),
      after: anchor?.key ?? null,
      fallback: anchor?.group ?? null,
      startOn: 'any',
      title: '',
      content: { kind: 'template', assetId: design.assets.find((a) => !a.builtin)?.id ?? null, pdfPage: 1, fit: 'contain', area: 'content', background: 'dots', text: '', rotation: 0, opacity: 1 },
    };
    update((d) => {
      d.customPages.push(cp);
    });
    setTimeout(() => goToPage(pageIndex + 1), 0);
  };

  return (
    <div>
      <p className="py-2 text-[12px] leading-snug text-ink-soft">{t('sections.intro')}</p>
      <ul className="space-y-0.5">
        {design.sections.map((sec, i) => (
          <div key={`${sec.id}-${i}`}>
            <ItemRow
              item={sec}
              index={i}
              count={design.sections.length}
              onToggle={(v) => update((d) => void (d.sections[i]!.enabled = v))}
              onMove={(dir) => update((d) => move(d.sections, i, dir))}
              onOption={(k, v) => update((d) => void (d.sections[i]!.options[k] = v), `sec:${i}:${k}`)}
            />
            {sec.type === 'months' && sec.enabled && (
              <div className="mt-0.5 mb-2 ml-5 border-l border-line pl-2">
                <p className="py-0.5 text-[10.5px] font-semibold tracking-wider text-ink-soft uppercase">{t('sections.monthItems')}</p>
                <ul>
                  {(sec.items ?? []).map((it, j) => (
                    <ItemRow
                      key={`${it.id}-${j}`}
                      item={it}
                      index={j}
                      count={sec.items?.length ?? 0}
                      onToggle={(v) => update((d) => void (d.sections[i]!.items![j]!.enabled = v))}
                      onMove={(dir) => update((d) => move(d.sections[i]!.items!, j, dir))}
                      onOption={(k, v) => update((d) => void (d.sections[i]!.items![j]!.options[k] = v), `item:${i}:${j}:${k}`)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </ul>

      <Group title={t('sections.customPages')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('sections.customHelp')}</p>
        <Button variant="primary" onClick={addCustomPage}>
          <FilePlus2 size={14} /> {t('sections.insertHere')}
        </Button>
        <ul className="mt-2 space-y-2">
          {design.customPages.map((cp, i) => (
            <li key={cp.id} className="rounded-md border border-line bg-white/60 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="truncate text-left text-[12px] font-semibold text-accent underline"
                  onClick={() => {
                    const idx = doc?.indexOfKey(`custom:${cp.id}`) ?? -1;
                    if (idx >= 0) goToPage(idx);
                  }}
                >
                  {cp.title || t('sec.custom')} · {t('sections.anchor', { key: cp.after ?? '—' })}
                </button>
                <button type="button" className="rounded p-1 text-warn hover:bg-black/5" onClick={() => update((d) => void d.customPages.splice(i, 1))} aria-label={t('sections.remove')}>
                  <Trash2 size={14} />
                </button>
              </div>
              <Field label={t('persona.title')}>
                <TextInput value={cp.title} onChange={(v) => update((d) => void (d.customPages[i]!.title = v), `cp:${cp.id}:title`)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('opt.style')}>
                  <Select
                    value={cp.content.kind}
                    onChange={(v) => update((d) => void (d.customPages[i]!.content.kind = v))}
                    options={[
                      { value: 'artwork', label: t('cover.image') },
                      { value: 'template', label: t('val.dots') + ' / ' + t('val.lines') },
                      { value: 'text', label: t('insp.text') },
                    ]}
                  />
                </Field>
                <Field label={t('val.blank')}>
                  <Select
                    value={cp.content.background}
                    onChange={(v) => update((d) => void (d.customPages[i]!.content.background = v))}
                    options={(['blank', 'dots', 'lines', 'grid'] as const).map((v) => ({ value: v, label: t(`val.${v}`) }))}
                  />
                </Field>
              </div>
              {cp.content.kind === 'artwork' && (
                <>
                  <Field label={t('cover.image')}>
                    <Select
                      value={cp.content.assetId ?? ''}
                      onChange={(v) => update((d) => void (d.customPages[i]!.content.assetId = v || null))}
                      options={[{ value: '', label: '—' }, ...design.assets.map((a) => ({ value: a.id, label: a.name }))]}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t('cp.fit')}>
                      <Select
                        value={cp.content.fit}
                        onChange={(v) => update((d) => void (d.customPages[i]!.content.fit = v))}
                        options={[
                          { value: 'contain', label: t('cp.fitContain') },
                          { value: 'cover', label: t('cp.fitCover') },
                          { value: 'fill', label: t('cp.fitFill') },
                        ]}
                      />
                    </Field>
                    <Field label={t('cp.area')}>
                      <Select
                        value={cp.content.area}
                        onChange={(v) => update((d) => void (d.customPages[i]!.content.area = v))}
                        options={[
                          { value: 'content', label: t('cp.areaContent') },
                          { value: 'page', label: t('cp.areaPage') },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label={t('insp.rotation')}>
                    <Select
                      value={String(cp.content.rotation) as '0'}
                      onChange={(v) => update((d) => void (d.customPages[i]!.content.rotation = Number(v) as 0))}
                      options={['0', '90', '180', '270'].map((v) => ({ value: v as '0', label: `${v}°` }))}
                    />
                  </Field>
                </>
              )}
              {cp.content.kind === 'text' && (
                <Field label={t('insp.text')}>
                  <textarea className="w-full rounded-md border border-line bg-white p-1.5 text-[12px]" rows={4} value={cp.content.text} onChange={(e) => update((d) => void (d.customPages[i]!.content.text = e.target.value), `cp:${cp.id}:text`)} />
                </Field>
              )}
              <Field label={t('cp.side')}>
                <Select
                  value={cp.startOn}
                  onChange={(v) => update((d) => void (d.customPages[i]!.startOn = v))}
                  options={[
                    { value: 'any', label: t('val.auto') },
                    { value: 'recto', label: t('insp.recto') },
                    { value: 'verso', label: t('insp.verso') },
                  ]}
                />
              </Field>
            </li>
          ))}
        </ul>
      </Group>
    </div>
  );
}
