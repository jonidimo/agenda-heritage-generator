/** Campos de un elemento «forma»: cuál, sus colores y trazo, y solo los parámetros que esa forma usa. */
import { BUBBLE_SIDES, LINE_CAPS, SHAPE_DEFAULTS, SHAPE_PARAMS, SHAPE_RANGES, SHAPES, type ShapeKind } from '@core/layout/shapes';
import { PATH_LIMITS, parsePathData } from '@core/util/pathData';
import { normalizeColor } from '@core/util/color';
import clsx from 'clsx';
import { useT, type UiKey } from '../i18n/ui';
import type { Scrubbing } from '../state/scrub';
import { ColorInput, Field, Segmented, Select, Slider, TextArea, Toggle } from './ui';

interface Props {
  p: Record<string, unknown>;
  setProp: (key: string, value: unknown) => void;
  /** Un deslizador de una propiedad: vista previa al arrastrar, una confirmación al soltar. */
  dragProp: (key: string) => Scrubbing<number>;
  /** La tinta del tema: el color del trazo sin uno propio. */
  ink: string;
}

type NumKey = keyof typeof SHAPE_RANGES & keyof typeof SHAPE_DEFAULTS;

/** Los parámetros numéricos con su paso y su unidad. */
const NUMERIC: Partial<Record<NumKey, { step: number; unit: string; integer?: boolean }>> = {
  radius: { step: 0.5, unit: 'mm' },
  angle: { step: 1, unit: '°' },
  head: { step: 1, unit: '%' },
  shaft: { step: 1, unit: '%' },
  apex: { step: 1, unit: '%' },
  sides: { step: 1, unit: '', integer: true },
  points: { step: 1, unit: '', integer: true },
  inner: { step: 1, unit: '%' },
  rotation: { step: 1, unit: '°' },
  cornerRadius: { step: 0.25, unit: 'mm' },
  thickness: { step: 1, unit: '%' },
  start: { step: 1, unit: '°' },
  sweep: { step: 1, unit: '°' },
  tailAt: { step: 1, unit: '%' },
  notch: { step: 1, unit: '%' },
  arm: { step: 1, unit: '%' },
};

const isNumKey = (k: string): k is NumKey => k in NUMERIC;

/** Un deslizador en por ciento sobre una propiedad que se guarda de 0 a 1. */
function percent(s: Scrubbing<number>): Scrubbing<number> {
  return { onPreview: (v) => s.onPreview(v / 100), onChange: (v) => s.onChange(v / 100) };
}

export function ShapeFields({ p, setProp, dragProp, ink }: Props) {
  const t = useT();
  const shape: ShapeKind = SHAPES.find((s) => s === p.shape) ?? 'rect';
  const params = SHAPE_PARAMS[shape];
  const num = (key: NumKey) => {
    const spec = NUMERIC[key];
    if (!spec) return null;
    const r = SHAPE_RANGES[key];
    const raw = p[key];
    const value = typeof raw === 'number' ? raw : SHAPE_DEFAULTS[key];
    return (
      <Slider
        key={key}
        label={t(`shape.p.${key}` as UiKey)}
        value={value}
        min={r.min}
        max={r.max}
        step={spec.step}
        unit={spec.unit}
        {...(spec.integer ? { integer: true } : {})}
        {...dragProp(key)}
        defaultValue={SHAPE_DEFAULTS[key]}
      />
    );
  };
  const fill = normalizeColor(p.fill);
  const pathText = typeof p.d === 'string' ? p.d : '';
  const pathOk = pathText.trim() === '' || parsePathData(pathText) !== null;
  return (
    <div data-testid="shape-fields">
      <Field label={t('shape.kind')}>
        <Select value={shape} ariaLabel={t('shape.kind')} onChange={(v) => setProp('shape', v)} options={SHAPES.map((s) => ({ value: s, label: t(`shape.${s}` as UiKey) }))} />
      </Field>
      {params.map((key) => {
        if (key === 'startCap' || key === 'endCap')
          return (
            <Field key={key} label={t(`shape.p.${key}` as UiKey)} group>
              <Segmented compact value={LINE_CAPS.find((c) => c === p[key]) ?? 'none'} onChange={(v) => setProp(key, v === 'none' ? undefined : v)} options={LINE_CAPS.map((c) => ({ value: c, label: t(`shape.cap.${c}` as UiKey) }))} />
            </Field>
          );
        if (key === 'tailSide')
          return (
            <Field key={key} label={t('shape.p.tailSide')} group>
              <Segmented compact value={BUBBLE_SIDES.find((c) => c === p.tailSide) ?? 'bottom'} onChange={(v) => setProp('tailSide', v)} options={BUBBLE_SIDES.map((c) => ({ value: c, label: t(`shape.side.${c}` as UiKey) }))} />
            </Field>
          );
        if (key === 'pie') return <Toggle key={key} label={t('shape.p.pie')} checked={p.pie === true} onChange={(v) => setProp('pie', v ? true : undefined)} />;
        if (key === 'd')
          return (
            <Field key={key} label={t('shape.p.d')} hint={pathOk ? t('shape.p.dHint') : t('shape.p.dBad')}>
              <TextArea value={pathText} rows={3} placeholder="M 10 90 L 50 10 L 90 90 Z" onChange={(v) => setProp('d', v.slice(0, PATH_LIMITS.chars))} />
            </Field>
          );
        return isNumKey(key) ? num(key) : null;
      })}
      {shape !== 'line' && !(shape === 'arc' && p.pie !== true) && (
        <div className="flex items-center justify-between gap-2 py-1" data-testid="shape-fill">
          <span className="text-[12px] text-ink">{t('shape.fill')}</span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setProp('fill', undefined)}
              aria-pressed={fill === null}
              title={t('shape.noFill')}
              aria-label={t('shape.noFill')}
              className={clsx('h-6 w-8 rounded border bg-white', fill === null ? 'border-accent ring-2 ring-accent/40' : 'border-line')}
              // Tablero gris y blanco con una diagonal roja: «sin relleno».
              style={{ backgroundImage: 'linear-gradient(to top right, transparent calc(50% - 1px), #c0392b calc(50% - 1px), #c0392b calc(50% + 1px), transparent calc(50% + 1px)), repeating-conic-gradient(#ddd 0 25%, #fff 0 50%)', backgroundSize: '100% 100%, 8px 8px' }}
            />
            {fill !== null && <span className="font-mono text-[11px] text-ink-soft">{fill}</span>}
            <input type="color" aria-label={t('shape.fillColor')} className={clsx('h-6 w-8 cursor-pointer rounded border bg-white p-0', fill !== null ? 'border-accent' : 'border-line')} value={fill ?? '#e8e4dc'} onChange={(e) => setProp('fill', e.target.value)} />
          </span>
        </div>
      )}
      <ColorInput label={t('shape.strokeColor')} value={normalizeColor(p.strokeColor) ?? ink} modified={normalizeColor(p.strokeColor) !== null} onReset={() => setProp('strokeColor', undefined)} onChange={(v) => setProp('strokeColor', v)} />
      <Slider label={t('shape.strokePt')} value={typeof p.strokePt === 'number' ? p.strokePt : SHAPE_DEFAULTS.strokePt} min={SHAPE_RANGES.strokePt.min} max={SHAPE_RANGES.strokePt.max} step={0.25} unit="pt" {...dragProp('strokePt')} defaultValue={SHAPE_DEFAULTS.strokePt} />
      <Slider label={t('insp.opacity')} value={Math.round((typeof p.opacity === 'number' ? p.opacity : 1) * 100)} min={5} max={100} step={1} unit="%" {...percent(dragProp('opacity'))} defaultValue={100} />
      <Field label={t('shape.dash')} group>
        <Segmented compact value={(['solid', 'dashed', 'dotted'] as const).find((d) => d === p.dash) ?? 'solid'} onChange={(v) => setProp('dash', v === 'solid' ? undefined : v)} options={(['solid', 'dashed', 'dotted'] as const).map((d) => ({ value: d, label: t(`shape.dash.${d}`) }))} />
      </Field>
    </div>
  );
}
