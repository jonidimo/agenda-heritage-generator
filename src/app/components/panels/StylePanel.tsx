import { deepMerge, THEMES, type ThemeTokens, type WritingStyle } from '@core/design/themes';
import type { FontStyle } from '@core/text/fonts';
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { uiText, useT, type UiKey } from '../../i18n/ui';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { Button, ColorInput, Field, Group, Segmented, Select, Slider, Toggle } from '../ui';

type Path = Array<string>;

function useFamilies(): Array<{ family: string; faces: Array<{ weight: number; style: FontStyle }> }> {
  const v = useStore((s) => s.resVersion);
  return useMemo(() => {
    const out = new Map<string, Array<{ weight: number; style: FontStyle }>>();
    for (const f of resources.manifest?.families ?? []) out.set(f.family, f.faces.map((x) => ({ weight: x.weight, style: x.style })));
    for (const face of resources.fonts.list()) {
      const list = out.get(face.family) ?? [];
      if (!list.some((x) => x.weight === face.weight && x.style === face.style)) list.push({ weight: face.weight, style: face.style });
      out.set(face.family, list);
    }
    return [...out.entries()].map(([family, faces]) => ({ family, faces: faces.sort((a, b) => a.weight - b.weight) })).sort((a, b) => a.family.localeCompare(b.family));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
}

export function StylePanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const families = useFamilies();
  const base: ThemeTokens = useMemo(() => deepMerge(THEMES[design.theme.id] ?? THEMES.heritage!, design.theme.tokens), [design.theme.id, design.theme.tokens]);

  const setToken = (path: Path, value: unknown): void =>
    update((d) => {
      const root = d.theme.tokens as Record<string, unknown>;
      let node = root;
      for (let i = 0; i < path.length - 1; i++) {
        const k = path[i]!;
        if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
        node = node[k] as Record<string, unknown>;
      }
      node[path[path.length - 1]!] = value;
    }, `tok:${path.join('.')}`);

  const roles = Object.keys(base.fonts) as Array<keyof ThemeTokens['fonts']>;
  const sizeKeys = Object.keys(base.sizes) as Array<keyof ThemeTokens['sizes']>;
  const strokeKeys = Object.keys(base.strokes) as Array<keyof ThemeTokens['strokes']>;
  const colorKeys = Object.keys(base.colors) as Array<keyof ThemeTokens['colors']>;

  return (
    <div>
      <p className="py-2 text-[12px] leading-snug text-ink-soft">{t('style.intro')}</p>
      <Field label={t('style.theme')}>
        <Select
          value={design.theme.id}
          onChange={(v) =>
            update((d) => {
              d.theme.id = v;
              d.theme.tokens = {};
            })
          }
          options={Object.entries(THEMES).map(([id, th]) => ({ value: id, label: uiText(t, `theme.${id}`, th.name) }))}
        />
      </Field>
      <p className="pb-2 text-[11.5px] text-ink-soft">{uiText(t, `theme.${design.theme.id}.desc`, THEMES[design.theme.id]?.description ?? '')}</p>
      <Field label={t('style.comfort')} group>
        <Segmented
          value={design.theme.comfort}
          onChange={(v) => update((d) => void (d.theme.comfort = v))}
          options={[
            { value: 'compact', label: t('style.compact') },
            { value: 'normal', label: t('style.normal') },
            { value: 'wide', label: t('style.wide') },
          ]}
        />
      </Field>
      <div className="py-2">
        <Button variant="ghost" onClick={() => update((d) => void (d.theme.tokens = {}))}>
          <RotateCcw size={14} /> {t('style.reset')}
        </Button>
      </div>

      <Group title={t('style.fonts')}>
        {roles.map((role) => (
          <FontRow
            key={role}
            label={t(`role.${role}` as UiKey)}
            spec={base.fonts[role]}
            families={families}
            onChange={(spec) => {
              void resources.ensureFamily(spec.family);
              setToken(['fonts', role], spec);
            }}
          />
        ))}
      </Group>

      <Group title={t('style.writing')}>
        <Field label={t('opt.style')} group>
          <Segmented
            value={base.writing.style}
            onChange={(v) => setToken(['writing', 'style'], v as WritingStyle)}
            options={(['lines', 'dots', 'grid', 'blank'] as const).map((v) => ({ value: v, label: t(`val.${v}`) }))}
          />
        </Field>
        <Slider label={t('style.pitch')} value={base.writing.pitch} min={4} max={12} step={0.1} onChange={(v) => setToken(['writing', 'pitch'], v)} />
        <Toggle label={t('style.weekendShading')} checked={base.weekendShading} onChange={(v) => setToken(['weekendShading'], v)} />
      </Group>

      <Group title={t('style.sizes')} defaultOpen={false}>
        {sizeKeys.map((k) => (
          <Slider key={k} label={t(`size.${k}` as UiKey)} value={base.sizes[k]} min={4} max={k === 'hero' || k === 'monthHero' ? 120 : 40} step={0.5} onChange={(v) => setToken(['sizes', k], v)} />
        ))}
        <Slider label={t('style.minText')} value={base.minTextPt} min={4} max={14} step={0.5} onChange={(v) => setToken(['minTextPt'], v)} />
        <Slider label={t('style.tracking')} value={base.tracking.label} min={0} max={0.3} step={0.01} onChange={(v) => setToken(['tracking', 'label'], v)} />
      </Group>

      <Group title={t('style.strokes')} defaultOpen={false}>
        {strokeKeys.map((k) => (
          <Slider key={k} label={t(`stroke.${k}` as UiKey)} value={base.strokes[k]} min={0.05} max={3} step={0.05} onChange={(v) => setToken(['strokes', k], v)} />
        ))}
      </Group>

      <Group title={t('style.dots')} defaultOpen={false}>
        <Slider label={t('style.dotPitch')} value={base.dots.pitch} min={3} max={10} step={0.1} onChange={(v) => setToken(['dots', 'pitch'], v)} />
        <Slider label={t('style.dotRadius')} value={base.dots.radius} min={0.2} max={1.5} step={0.05} onChange={(v) => setToken(['dots', 'radius'], v)} />
        <ColorInput label={t('color.ink')} value={base.dots.color} onChange={(v) => setToken(['dots', 'color'], v)} />
      </Group>

      <Group title={t('style.colors')} defaultOpen={false}>
        {colorKeys.map((k) => (
          <ColorInput key={k} label={t(`color.${k}` as UiKey)} value={base.colors[k]} onChange={(v) => setToken(['colors', k], v)} />
        ))}
      </Group>

      <Group title={t('style.margins')} defaultOpen={false}>
        {(['top', 'bottom', 'inner', 'outer'] as const).map((k) => (
          <Slider key={k} label={t(`margin.${k}`)} value={base.margins[k]} min={5} max={35} step={0.5} onChange={(v) => setToken(['margins', k], v)} />
        ))}
        <Slider label={t('style.gutter')} value={design.binding.gutter} min={0} max={15} step={0.5} onChange={(v) => update((d) => void (d.binding.gutter = v), 'gutter')} />
      </Group>
    </div>
  );
}

function FontRow(props: { label: string; spec: { family: string; weight: number; style: FontStyle }; families: Array<{ family: string; faces: Array<{ weight: number; style: FontStyle }> }>; onChange: (s: { family: string; weight: number; style: FontStyle }) => void }) {
  const t = useT();
  const fam = props.families.find((f) => f.family === props.spec.family);
  const weights = [...new Set((fam?.faces ?? []).filter((f) => f.style === props.spec.style || !(fam?.faces ?? []).some((x) => x.style === props.spec.style)).map((f) => f.weight))];
  const hasItalic = (fam?.faces ?? []).some((f) => f.style === 'italic');
  const [preview, setPreview] = useState(props.spec.family);
  useEffect(() => setPreview(props.spec.family), [props.spec.family]);
  return (
    <div className="border-b border-line/50 py-1.5 last:border-0">
      <div className="mb-1 text-[11.5px] font-semibold text-ink-soft">{props.label}</div>
      <div className="grid grid-cols-[1fr_92px] gap-1.5">
        <Select
          ariaLabel={props.label}
          value={preview}
          onChange={(family) => {
            setPreview(family);
            const f = props.families.find((x) => x.family === family);
            const avail = f?.faces ?? [];
            const sameStyle = avail.filter((x) => x.style === props.spec.style);
            const pool = sameStyle.length ? sameStyle : avail;
            const best = [...pool].sort((a, b) => Math.abs(a.weight - props.spec.weight) - Math.abs(b.weight - props.spec.weight))[0];
            props.onChange({ family, weight: best?.weight ?? 400, style: best?.style ?? 'normal' });
          }}
          options={props.families.map((f) => ({ value: f.family, label: f.family }))}
        />
        <Select ariaLabel={t('style.weight')} value={String(props.spec.weight)} onChange={(w) => props.onChange({ ...props.spec, weight: Number(w) })} options={(weights.length ? weights : [props.spec.weight]).map((w) => ({ value: String(w), label: String(w) }))} />
      </div>
      {hasItalic && <Toggle label={t('style.italic')} checked={props.spec.style === 'italic'} onChange={(v) => props.onChange({ ...props.spec, style: v ? 'italic' : 'normal' })} />}
    </div>
  );
}
