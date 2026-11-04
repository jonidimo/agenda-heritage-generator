import type { AgendaDocument } from '@core/document';
import type { CustomPage, SectionItem } from '@core/design/schema';
import { SECTION_REGISTRY } from '@core/sections/registry';
import clsx from 'clsx';
import type { Draft } from 'immer';
import { ArrowDown, ArrowUp, CornerDownRight, FilePlus2, LayoutTemplate, MoreHorizontal, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { sectionName, useT, type UiKey } from '../../i18n/ui';
import { customPageHere } from '../../state/customPages';
import { useDocument } from '../../state/doc';
import { useStore } from '../../state/store';
import { Button, Field, Group, NumberInput, Select, TextArea, TextInput, Toggle } from '../ui';
import { openMenuAt, type MenuItem } from '../ContextMenu';
import { canBeOnce, canRepeat, createTemplate, deleteTemplate, moveToEdge, nextPageOf, sectionPages, setEnabled, setOnce, setRepeat, type SectionPath } from '../../state/sections';
import { jumpToPage } from '../../state/navigation';

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
                <NumberInput value={Number(cur)} min={0} max={200} step={1} integer onChange={(v) => onChange(k, v)} />
              </div>
            </Field>
          );
        }
        return null;
      })}
    </div>
  );
}

type Content = CustomPage['content'];

/** Contenido de una página propia o de una plantilla (fondo, imagen o texto): el mismo formulario para las dos. */
function ContentFields({ content, set, coalesce }: { content: Content; set: (recipe: (c: Draft<Content>) => void, key?: string) => void; coalesce: string }) {
  const t = useT();
  const assets = useStore((s) => s.design?.assets ?? []);
  const ref = assets.find((x) => x.id === content.assetId);
  const pdfPages = ref?.kind === 'pdf' ? (ref.pages ?? 1) : 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('cp.content')}>
          <Select value={content.kind} onChange={(v) => set((c) => void (c.kind = v))} options={(['template', 'artwork', 'text'] as const).map((v) => ({ value: v, label: t(`cp.kind.${v}`) }))} />
        </Field>
        <Field label={t('cp.background')}>
          <Select value={content.background} onChange={(v) => set((c) => void (c.background = v))} options={(['blank', 'dots', 'lines', 'grid'] as const).map((v) => ({ value: v, label: t(`val.${v}`) }))} />
        </Field>
      </div>
      {content.kind === 'artwork' && (
        <>
          <Field label={t('cover.image')}>
            <Select value={content.assetId ?? ''} onChange={(v) => set((c) => void (c.assetId = v || null))} options={[{ value: '', label: '—' }, ...assets.map((a) => ({ value: a.id, label: a.name }))]} />
          </Field>
          {pdfPages > 1 && (
            <Field label={t('cp.pdfPage', { n: pdfPages })}>
              <NumberInput value={Math.min(content.pdfPage, pdfPages)} min={1} max={pdfPages} integer onChange={(v) => set((c) => void (c.pdfPage = v), `${coalesce}:pdfPage`)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('cp.fit')}>
              <Select
                value={content.fit}
                onChange={(v) => set((c) => void (c.fit = v))}
                options={[
                  { value: 'contain', label: t('cp.fitContain') },
                  { value: 'cover', label: t('cp.fitCover') },
                  { value: 'fill', label: t('cp.fitFill') },
                ]}
              />
            </Field>
            <Field label={t('cp.area')}>
              <Select
                value={content.area}
                onChange={(v) => set((c) => void (c.area = v))}
                options={[
                  { value: 'content', label: t('cp.areaContent') },
                  { value: 'page', label: t('cp.areaPage') },
                ]}
              />
            </Field>
          </div>
          <Field label={t('insp.rotation')}>
            <Select value={String(content.rotation) as '0'} onChange={(v) => set((c) => void (c.rotation = Number(v) as 0))} options={['0', '90', '180', '270'].map((v) => ({ value: v as '0', label: `${v}°` }))} />
          </Field>
        </>
      )}
      {content.kind === 'text' && (
        <Field label={t('insp.text')} hint={t('ptpl.vars')}>
          <TextArea value={content.text} rows={4} onChange={(v) => set((c) => void (c.text = v), `${coalesce}:text`)} />
        </Field>
      )}
    </>
  );
}

/** Nombre de una sección en la lista (las plantillas, por su título). */
function useItemName(): (item: SectionItem) => string {
  const t = useT();
  const templates = useStore((s) => s.design?.pageTemplates ?? []);
  return (item) => (item.type === 'pageTemplate' ? templates.find((x) => x.id === item.options.template)?.title || t('sec.pageTemplate') : sectionName(t, item.type));
}

function ItemRow(props: { item: SectionItem; path: SectionPath; count: number; doc: AgendaDocument | null; onToggle: (v: boolean) => void; onMove: (d: -1 | 1) => void; onOption: (k: string, v: unknown) => void }) {
  const t = useT();
  const nameOf = useItemName();
  const pageIndex = useStore((s) => s.pageIndex);
  const [open, setOpen] = useState(false);
  const { item, path, doc } = props;
  const hasOptions = Object.keys(SECTION_REGISTRY.get(item.type)?.defaults ?? {}).length > 0;
  const name = nameOf(item);
  const pages = doc && item.enabled ? sectionPages(doc, item.id) : [];
  const target = doc && pages.length > 0 ? nextPageOf(doc, item.id, pageIndex) : undefined;
  const repeats = path.list === 'month';
  const where = pages.length === 0 ? '' : repeats ? t('sections.times', { n: pages.length }) : t('sections.where', { n: pages[0]! + 1 });

  const menu = (e: { clientX: number; clientY: number; preventDefault: () => void }): void => {
    const items: MenuItem[] = [
      { label: target !== undefined ? t(repeats ? 'sections.gotoNext' : 'sections.goto', { n: target + 1 }) : t('sections.notInAgenda'), icon: <CornerDownRight size={14} />, disabled: target === undefined, onSelect: () => target !== undefined && jumpToPage(target) },
      { label: item.enabled ? t('sections.disable') : t('sections.enable'), onSelect: () => setEnabled(path, !item.enabled) },
      { separator: true },
      { label: t('sections.toStart'), disabled: path.index === 0, onSelect: () => moveToEdge(path, 'start') },
      { label: t('sections.toEnd'), disabled: path.index === props.count - 1, onSelect: () => moveToEdge(path, 'end') },
    ];
    if (canRepeat(item.type)) {
      items.push({ separator: true }, { heading: t('sections.repeatHeading') });
      if (canBeOnce(item.type)) items.push({ label: t('sections.repeat.once'), checked: !repeats, onSelect: () => setOnce(path) });
      for (const r of ['month', 'week', 'day'] as const) items.push({ label: t(`sections.repeat.${r}`), checked: repeats && item.repeat === r, onSelect: () => setRepeat(path, r) });
    }
    if (item.type === 'pageTemplate') items.push({ separator: true }, { label: t('ptpl.delete'), danger: true, icon: <Trash2 size={14} />, onSelect: () => deleteTemplate(String(item.options.template ?? '')) });
    openMenuAt(e, items);
  };

  return (
    <li className={clsx('rounded-md px-1.5 py-1', item.enabled ? '' : 'opacity-60')} onContextMenu={menu}>
      <div className="flex items-center gap-1.5">
        <input type="checkbox" className="h-4 w-4" checked={item.enabled} onChange={(e) => props.onToggle(e.target.checked)} aria-label={name} />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left text-[12.5px] hover:underline disabled:no-underline"
          disabled={target === undefined}
          title={target !== undefined ? t(repeats ? 'sections.gotoNext' : 'sections.goto', { n: target + 1 }) : undefined}
          onClick={() => target !== undefined && jumpToPage(target)}
        >
          <span className="truncate">{name}</span>
          {repeats && item.repeat !== 'month' && <span className="shrink-0 text-[10.5px] text-accent">{t(`sections.repeat.${item.repeat}`)}</span>}
          {where && <span className="shrink-0 text-[10.5px] text-ink-soft tabular-nums">{where}</span>}
        </button>
        {hasOptions && (
          <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5" onClick={() => setOpen(!open)} aria-label={t('common.options')} title={t('common.options')}>
            <Settings2 size={14} />
          </button>
        )}
        <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5" onClick={(e) => menu(e)} aria-label={t('sections.more')} title={t('sections.more')}>
          <MoreHorizontal size={14} />
        </button>
        <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5 disabled:opacity-30" disabled={path.index === 0} onClick={() => props.onMove(-1)} aria-label={t('sections.up')} title={t('sections.up')}>
          <ArrowUp size={14} />
        </button>
        <button type="button" className="rounded p-1 text-ink-soft hover:bg-black/5 disabled:opacity-30" disabled={path.index === props.count - 1} onClick={() => props.onMove(1)} aria-label={t('sections.down')} title={t('sections.down')}>
          <ArrowDown size={14} />
        </button>
      </div>
      {open && <OptionsForm type={item.type} options={item.options} onChange={props.onOption} />}
    </li>
  );
}

export function SectionsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const pageIndex = useStore((s) => s.pageIndex);
  const setGoToKey = useStore((s) => s.setGoToKey);
  const { doc } = useDocument();
  const move = <T,>(arr: T[], i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  };

  const addCustomPage = (): void => {
    const cp = customPageHere(doc, pageIndex, { assetId: design.assets.find((a) => !a.builtin)?.id ?? null });
    update((d) => {
      d.customPages.push(cp);
    });
    setGoToKey(`custom:${cp.id}`);
  };

  return (
    <div>
      <p className="py-2 text-[12px] leading-snug text-ink-soft">{t('sections.intro')}</p>
      <ul className="space-y-0.5">
        {design.sections.map((sec, i) => (
          <div key={`${sec.id}-${i}`}>
            <ItemRow
              item={sec}
              path={{ list: 'top', index: i }}
              count={design.sections.length}
              doc={doc}
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
                      path={{ list: 'month', index: j }}
                      count={sec.items?.length ?? 0}
                      doc={doc}
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

      <Group title={t('ptpl.group')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('ptpl.help')}</p>
        <Button variant="primary" onClick={() => setGoToKey(createTemplate(t('ptpl.defaultTitle')))}>
          <LayoutTemplate size={14} /> {t('ptpl.new')}
        </Button>
        <ul className="mt-2 space-y-2">
          {design.pageTemplates.map((tp, i) => {
            const set = (recipe: (c: Draft<Content>) => void, key?: string): void => update((d) => recipe(d.pageTemplates[i]!.content), key);
            return (
              <li key={tp.id} className="rounded-md border border-line bg-white/60 p-2" data-testid="page-template">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-[12px] font-semibold text-accent underline"
                    onClick={() => {
                      const idx = doc?.plan.pages.find((p) => p.type === `tpl:${tp.id}`)?.index;
                      if (idx !== undefined) jumpToPage(idx);
                    }}
                  >
                    {tp.title || t('sec.pageTemplate')}
                  </button>
                  <button type="button" className="rounded p-1 text-warn hover:bg-black/5" onClick={() => deleteTemplate(tp.id)} aria-label={t('ptpl.delete')} title={t('ptpl.delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <Field label={t('persona.title')}>
                  <TextInput value={tp.title} onChange={(v) => update((d) => void (d.pageTemplates[i]!.title = v), `tpl:${tp.id}:title`)} />
                </Field>
                <Toggle label={t('ptpl.showTitle')} checked={tp.showTitle} onChange={(v) => update((d) => void (d.pageTemplates[i]!.showTitle = v))} />
                <ContentFields content={tp.content} set={set} coalesce={`tpl:${tp.id}`} />
              </li>
            );
          })}
        </ul>
      </Group>

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
                    if (idx >= 0) jumpToPage(idx);
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
              <ContentFields content={cp.content} set={(recipe, key) => update((d) => recipe(d.customPages[i]!.content), key)} coalesce={`cp:${cp.id}`} />
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
