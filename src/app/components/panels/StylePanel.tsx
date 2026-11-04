import { derivePalette, type DerivedPalette } from '@core/design/palette';
import type { UserTheme } from '@core/design/schema';
import { HARMONIES, LINE_PATTERNS, LINE_USES, mergeTokens, THEMES, type Harmony, type LineStyle, type LineUse, type ThemeTokens, type WritingStyle } from '@core/design/themes';
import type { TextRole } from '@core/layout/context';
import { Download, Palette, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { uiText, useT, type UiKey } from '../../i18n/ui';
import { deleteTheme, listThemes } from '../../state/persist';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { applyUserTheme, exportThemeFile, importThemeFile, saveCurrentAsTheme } from '../../state/themes';
import { FontRow, useFamilies } from '../FontPicker';
import { OrnamentPicker } from '../OrnamentPicker';
import { Button, ColorInput, Field, Group, IconButton, Segmented, Select, Slider, TextInput, Toggle } from '../ui';

type Path = Array<string>;

export function StylePanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const families = useFamilies();
  const base: ThemeTokens = useMemo(() => mergeTokens(THEMES[design.theme.id] ?? THEMES.heritage!, design.theme.tokens), [design.theme.id, design.theme.tokens]);

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

  const roles = Object.keys(base.fonts) as TextRole[];
  const sizeKeys = Object.keys(base.sizes) as Array<keyof ThemeTokens['sizes']>;
  const strokeKeys = Object.keys(base.strokes) as Array<keyof ThemeTokens['strokes']>;
  const colorKeys = (Object.keys(base.colors) as Array<keyof ThemeTokens['colors']>).filter((k): k is Exclude<keyof ThemeTokens['colors'], 'roles'> => k !== 'roles');

  return (
    <div>
      <p className="py-2 text-[12px] leading-snug text-ink-soft">{t('style.intro')}</p>
      <ThemeChooser />
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

      <Group title={t('style.typeRoles')} id="roles">
        <p className="pb-1 text-[11.5px] leading-snug text-ink-soft">{t('style.typeRolesHelp')}</p>
        {roles.map((role) => (
          <div key={role} data-reveal={`role.${role}`} className="rounded-md">
            <FontRow
              label={t(`role.${role}` as UiKey)}
              spec={base.fonts[role]}
              families={families}
              onChange={(spec) => {
                void resources.ensureFamily(spec.family);
                setToken(['fonts', role], spec);
              }}
            />
            <ColorInput label={t('style.color')} value={base.colors.roles[role]} onChange={(v) => setToken(['colors', 'roles', role], v)} />
          </div>
        ))}
      </Group>

      <Group title={t('style.palette')} id="palette" defaultOpen={false}>
        {/* Se reinicia al cambiar de tema o de paleta (el contenido de los grupos plegados sigue montado). */}
        <PaletteEditor key={`${design.theme.id}|${base.palette.base}|${base.palette.harmony}`} current={base.palette} onApply={(p, from) => update((d) => applyPalette(d.theme.tokens as Record<string, unknown>, p, from))} />
      </Group>

      <Group title={t('style.lines')} id="lines" defaultOpen={false}>
        <p className="pb-1 text-[11.5px] leading-snug text-ink-soft">{t('lines.help')}</p>
        {LINE_USES.map((use) => (
          <LineStyleEditor key={use} use={use} value={base.lines[use]} set={(k, v) => setToken(['lines', use, k], v)} />
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

      <Group title={t('style.colors')} defaultOpen={false}>
        {colorKeys.map((k) => (
          <ColorInput key={k} label={t(`color.${k}` as UiKey)} value={base.colors[k]} onChange={(v) => setToken(['colors', k], v)} />
        ))}
        <ColorInput label={t('style.dotColor')} value={base.dots.color} onChange={(v) => setToken(['dots', 'color'], v)} />
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

/** Escribe una paleta derivada en los ajustes del tema (colores, tipos de texto, puntos y su origen). */
function applyPalette(tokens: Record<string, unknown>, p: DerivedPalette, from: ThemeTokens['palette']): void {
  tokens.colors = { ...((tokens.colors as Record<string, unknown> | undefined) ?? {}), ...p.colors, roles: { ...p.roles } };
  tokens.dots = { ...((tokens.dots as Record<string, unknown> | undefined) ?? {}), color: p.dots };
  tokens.palette = { ...from };
}

/** Tema: los incluidos y los propios; guardar el estilo actual como tema, importar y exportar. */
function ThemeChooser() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const setNotice = useStore((s) => s.setNotice);
  const [mine, setMine] = useState<UserTheme[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const refresh = (): void => void listThemes().then(setMine);
  useEffect(refresh, []);
  return (
    <>
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
      <div className="mb-2 rounded-md border border-line bg-white/60 p-2" data-reveal="themes.mine">
        <div className="mb-1 text-[11.5px] font-semibold text-ink-soft">{t('theme.mine')}</div>
        {mine.length === 0 && <p className="text-[11.5px] text-ink-soft">{t('theme.mineEmpty')}</p>}
        <ul className="space-y-1">
          {mine.map((th) => (
            <li key={th.id} className="flex items-center gap-1.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate">{th.name}</span>
              <Button variant="ghost" onClick={() => applyUserTheme(th)}>
                {t('theme.apply')}
              </Button>
              <IconButton label={t('theme.export')} onClick={() => exportThemeFile(th)}>
                <Download size={14} />
              </IconButton>
              <IconButton label={t('theme.delete')} onClick={() => void deleteTheme(th.id).then(refresh)}>
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
        {naming === null ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button onClick={() => setNaming(design.name)}>
              <Save size={14} /> {t('theme.save')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void importThemeFile()
                  .then((th) => {
                    if (th) {
                      refresh();
                      setNotice(t('theme.imported', { name: th.name }));
                    }
                  })
                  .catch(() => setNotice(t('theme.importError')))
              }
            >
              <Upload size={14} /> {t('theme.import')}
            </Button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-end gap-1.5">
            <div className="flex-1">
              <Field label={t('theme.saveName')}>
                <TextInput value={naming} onChange={setNaming} />
              </Field>
            </div>
            <Button
              variant="primary"
              onClick={() =>
                void saveCurrentAsTheme(design, naming).then((th) => {
                  setNaming(null);
                  refresh();
                  setNotice(t('theme.saved', { name: th.name }));
                })
              }
            >
              {t('theme.saveConfirm')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** Paleta: un color base y una armonía dan todos los colores (con vista previa antes de aplicarla). */
function PaletteEditor({ current, onApply }: { current: ThemeTokens['palette']; onApply: (p: DerivedPalette, from: ThemeTokens['palette']) => void }) {
  const t = useT();
  const [baseColor, setBaseColor] = useState(current.base);
  const [harmony, setHarmony] = useState<Harmony>(current.harmony);
  const preview = useMemo(() => derivePalette(baseColor, harmony), [baseColor, harmony]);
  const swatches: Array<[string, string]> = [
    [t('role.title'), preview.roles.title],
    [t('role.heading'), preview.roles.heading],
    [t('role.quote'), preview.roles.quote],
    [t('role.body'), preview.roles.body],
    [t('role.label'), preview.roles.label],
    [t('color.rule'), preview.colors.rule],
    [t('color.weekend'), preview.colors.weekend],
    [t('color.accent'), preview.colors.accent],
  ];
  return (
    <div data-reveal="palette">
      <p className="pb-1 text-[11.5px] leading-snug text-ink-soft">{t('palette.help')}</p>
      <ColorInput label={t('palette.base')} value={baseColor} onChange={setBaseColor} />
      <Field label={t('palette.harmony')}>
        <Select value={harmony} onChange={setHarmony} options={HARMONIES.map((h) => ({ value: h, label: t(`harmony.${h}`) }))} />
      </Field>
      <div className="my-1.5 grid grid-cols-4 gap-1" aria-label={t('palette.preview')}>
        {swatches.map(([label, c]) => (
          <div key={label} className="flex flex-col items-center gap-0.5 text-[10px] text-ink-soft">
            <span className="h-6 w-full rounded border border-line" style={{ background: c }} title={c} />
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>
      <Button variant="primary" onClick={() => onApply(preview, { base: baseColor, harmony })}>
        <Palette size={14} /> {t('palette.apply')}
      </Button>
    </div>
  );
}

/** Estilo de las líneas de un uso: patrón, ornamento, esquinas (marcos), tamaño y color. */
function LineStyleEditor({ use, value, set }: { use: LineUse; value: LineStyle; set: (k: keyof LineStyle, v: unknown) => void }) {
  const t = useT();
  const withOrnament = value.pattern === 'repeat' || value.pattern === 'center';
  return (
    <div className="border-b border-line/50 py-1.5 last:border-0" data-reveal={`line.${use}`}>
      <div className="text-[12px] font-semibold">{t(`use.${use}`)}</div>
      <Field label={t('lines.pattern')}>
        <Select value={value.pattern} onChange={(v) => set('pattern', v)} options={LINE_PATTERNS.map((p) => ({ value: p, label: t(`pattern.${p}`) }))} />
      </Field>
      {withOrnament && <OrnamentPicker label={t('lines.ornament')} value={value.ornament} kinds={value.pattern === 'repeat' ? ['tile'] : ['center', 'tile']} allowNone={false} onChange={(v) => set('ornament', v)} />}
      {use === 'frame' && <OrnamentPicker label={t('lines.corner')} value={value.corner} kinds={['corner']} onChange={(v) => set('corner', v)} />}
      {(withOrnament || (use === 'frame' && value.corner)) && <Slider label={t('lines.size')} value={value.size} min={1} max={20} step={0.5} onChange={(v) => set('size', v)} />}
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <ColorInput label={t('lines.color')} value={value.color || '#000000'} onChange={(v) => set('color', v)} />
        </div>
        {value.color && (
          <button type="button" className="text-[11px] text-accent underline" onClick={() => set('color', '')}>
            {t('lines.colorAuto')}
          </button>
        )}
      </div>
    </div>
  );
}
