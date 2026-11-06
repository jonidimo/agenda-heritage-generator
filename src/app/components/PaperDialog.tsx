/**
 * El tamaño de la hoja, a la vista desde el principio: para qué es la agenda (imprimir o leer en
 * pantalla), qué papel o qué pantalla, cómo se encuaderna, y qué tamaño queda cada página. Se usa al
 * crear una agenda y desde «Edición → Tamaño de la hoja…»; ahí, cambiarlo con la agenda ya armada
 * puede llevar lo hecho a mano en proporción a la página nueva (un solo paso de «Deshacer»).
 */
import { PAPER_PRESETS, SCREEN_PRESETS, designDefaults, type Design, type PaperPresetId } from '@core/design/schema';
import { changePaper, pageSizeFor } from '@core/document/paper';
import { useMemo, useState } from 'react';
import { uiText, useT, type UiKey } from '../i18n/ui';
import { useStore } from '../state/store';
import { Modal } from './Dialogs';
import { Button, Field, NumberInput, Segmented, Select, Toggle } from './ui';

export interface PaperChoice {
  paper: Design['paper'];
  target: Design['binding']['target'];
  method: Design['binding']['method'];
}

export const paperChoiceOf = (d: Pick<Design, 'paper' | 'binding'>): PaperChoice => ({ paper: { ...d.paper }, target: d.binding.target, method: d.binding.method });

const METHODS = ['sewn', 'saddle', 'cut-stack', 'single'] as const;
const PRINT_PRESETS = (Object.keys(PAPER_PRESETS) as PaperPresetId[]).filter((id) => !SCREEN_PRESETS.includes(id));
const fmt = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',');

/** Los campos: destino, hoja (con su tamaño a mano si es personalizada), encuadernación y la página que resulta. */
export function PaperFields({ value, onChange }: { value: PaperChoice; onChange: (v: PaperChoice) => void }) {
  const t = useT();
  const screen = value.target === 'screen';
  const presets: readonly PaperPresetId[] = screen ? [...SCREEN_PRESETS, 'A4', 'A5', 'LETTER', 'CUSTOM'] : PRINT_PRESETS;
  const size = pageSizeFor(designDefaults(), value);
  const setPreset = (preset: PaperPresetId): void => {
    // Una pantalla es una página por hoja, para leer: el destino y la encuadernación la acompañan.
    const isScreen = SCREEN_PRESETS.includes(preset);
    onChange({ ...value, paper: { ...value.paper, preset }, ...(isScreen ? { target: 'screen', method: 'single' } : {}) });
  };
  return (
    <div data-testid="paper-fields">
      <Field label={t('print.target')} group>
        <Segmented
          value={value.target}
          onChange={(target) => {
            // Volver a imprimir con un tamaño de pantalla: A4, que es lo que hay en una impresora.
            const keep = target === 'print' && SCREEN_PRESETS.includes(value.paper.preset) ? { paper: { ...value.paper, preset: 'A4' as const } } : {};
            onChange({ ...value, target, ...(target === 'screen' ? { method: 'single' as const } : {}), ...keep });
          }}
          options={[
            { value: 'print', label: t('print.target.print') },
            { value: 'screen', label: t('print.target.screen') },
          ]}
        />
      </Field>
      <Field label={screen ? t('paper.screenSize') : t('print.paper')}>
        <Select value={value.paper.preset} ariaLabel={screen ? t('paper.screenSize') : t('print.paper')} onChange={setPreset} options={presets.map((id) => ({ value: id, label: uiText(t, `paper.${id}`, PAPER_PRESETS[id].label) }))} />
      </Field>
      {value.paper.preset === 'CUSTOM' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('print.width')}>
            <NumberInput value={value.paper.width} min={50} max={1000} onChange={(width) => onChange({ ...value, paper: { ...value.paper, width } })} />
          </Field>
          <Field label={t('print.height')}>
            <NumberInput value={value.paper.height} min={50} max={1500} onChange={(height) => onChange({ ...value, paper: { ...value.paper, height } })} />
          </Field>
        </div>
      )}
      {!screen && (
        <Field label={t('print.binding')}>
          <Select value={value.method} ariaLabel={t('print.binding')} onChange={(method) => onChange({ ...value, method })} options={METHODS.map((m) => ({ value: m, label: t(`bind.${m}` as UiKey) }))} />
        </Field>
      )}
      <p className="mt-1 rounded-md bg-accent-soft px-2 py-1.5 text-[12px] text-ink" data-testid="paper-result">
        {t(size.nUp === 2 ? 'paper.resultTwo' : 'paper.resultOne', { w: fmt(size.w), h: fmt(size.h) })}
      </p>
    </div>
  );
}

/** Edición → Tamaño de la hoja…: con la agenda abierta. */
export function PaperDialog() {
  const t = useT();
  const design = useStore((s) => s.design);
  const setShow = useStore((s) => s.setShowPaper);
  const [choice, setChoice] = useState<PaperChoice | null>(() => (design ? paperChoiceOf(design) : null));
  const [rescale, setRescale] = useState(true);
  const before = useMemo(() => (design ? pageSizeFor(design, paperChoiceOf(design)) : null), [design]);
  if (!design || !choice || !before) return null;
  const after = pageSizeFor(design, choice);
  const changed = before.w !== after.w || before.h !== after.h;
  const hasHandWork = design.customBlocks.length > 0 || design.overrides.some((o) => o.dx !== 0 || o.dy !== 0 || o.dw !== 0 || o.dh !== 0) || design.watermarks.length > 0;
  const apply = (): void => {
    const next = changePaper(design, { ...choice, rescale });
    useStore.getState().update((d) => {
      d.paper = next.paper;
      d.binding = next.binding;
      d.customBlocks = next.customBlocks;
      d.overrides = next.overrides;
      d.watermarks = next.watermarks;
    });
    setShow(false);
  };
  return (
    <Modal title={t('paper.title')} onClose={() => setShow(false)}>
      <PaperFields value={choice} onChange={setChoice} />
      {changed && (
        <p className="mt-2 text-[11.5px] text-ink-soft" data-testid="paper-change">
          {t('paper.changeFromTo', { w0: fmt(before.w), h0: fmt(before.h), w: fmt(after.w), h: fmt(after.h) })}
        </p>
      )}
      {changed && hasHandWork && <Toggle label={t('paper.rescale')} hint={t('paper.rescaleHint')} checked={rescale} onChange={setRescale} />}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setShow(false)}>
          {t('welcome.cancel')}
        </Button>
        <Button variant="primary" onClick={apply}>
          {t('paper.apply')}
        </Button>
      </div>
    </Modal>
  );
}
