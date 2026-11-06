/** Campos del panel de los elementos compuestos (tabla, lista, hábitos, finanzas, minicalendario…). */
import { CHECK_SHAPES, NOTE_STYLES, PROP_DEFAULTS, PROP_RANGES, QR_ECC_LEVELS, QR_MAX_CHARS, QUADRANT_STYLES, RATING_FORMS, stringList, type ElementKind } from '@core/design/customBlocks';
import { safeUrl } from '@core/document/links';
import { qrEncode } from '@core/util/qr';
import { CalendarCheck, CalendarDays, Clock, LayoutGrid, ListChecks, QrCode, StickyNote, Star, Table2, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT, type UiKey } from '../i18n/ui';
import { ColorInput, Field, NumberInput, Segmented, Select, TextArea, TextInput, Toggle } from './ui';

/** El ícono de cada tipo (botones de agregar y menús). */
export const ELEMENT_ICONS: Record<ElementKind, ReactNode> = {
  table: <Table2 size={14} />,
  checklist: <ListChecks size={14} />,
  habits: <CalendarCheck size={14} />,
  finance: <Wallet size={14} />,
  minical: <CalendarDays size={14} />,
  quadrants: <LayoutGrid size={14} />,
  notes: <StickyNote size={14} />,
  timeline: <Clock size={14} />,
  rating: <Star size={14} />,
  qr: <QrCode size={14} />,
};

export interface MonthChoice {
  value: string;
  label: string;
}

interface Props {
  kind: ElementKind;
  props: Record<string, unknown>;
  /** Cambia una propiedad; con `undefined` la quita (vuelve a su valor por defecto). */
  setProp: (key: string, value: unknown) => void;
  /** Los meses de la agenda, para elegir el del minicalendario. */
  months: readonly MonthChoice[];
  /** La tinta del tema: el color de lo que no tiene uno propio. */
  ink: string;
}

/** Un texto por renglón: lo escrito se guarda como lista, con los renglones vacíos que deje (así se ve lo que se escribe). */
function ListField({ label, value, max, onChange }: { label: string; value: unknown; max: number; onChange: (v: string[]) => void }) {
  const list = stringList(value, max);
  return (
    <Field label={label}>
      <TextArea value={list.join('\n')} rows={Math.min(8, Math.max(3, list.length + 1))} onChange={(v) => onChange(v.split('\n').slice(0, max))} />
    </Field>
  );
}

/** Un número entero dentro del rango del núcleo. */
function Count({ label, value, range, def, onChange }: { label: string; value: unknown; range: { min: number; max: number }; def: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <NumberInput value={typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : def} min={range.min} max={range.max} step={1} integer ariaLabel={label} onChange={onChange} />
    </Field>
  );
}

/** Los campos de un tipo y, al final, lo que tienen en común todos los compuestos. */
export function ElementFields(props: Props) {
  const t = useT();
  return (
    <>
      <KindFields {...props} />
      <Toggle label={t('el.paper')} hint={t('el.paperHint')} checked={props.props.paper === true} onChange={(v) => props.setProp('paper', v ? true : undefined)} />
    </>
  );
}

function KindFields({ kind, props: p, setProp, months, ink }: Props) {
  const t = useT();
  const opt = <V extends string>(values: readonly V[], key: (v: V) => UiKey) => values.map((v) => ({ value: v, label: t(key(v)) }));
  switch (kind) {
    case 'table':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Count label={t('el.rows')} value={p.rows} range={PROP_RANGES.tableRows} def={PROP_DEFAULTS.tableRows} onChange={(v) => setProp('rows', v)} />
            <Count label={t('el.cols')} value={p.cols} range={PROP_RANGES.tableCols} def={PROP_DEFAULTS.tableCols} onChange={(v) => setProp('cols', v)} />
          </div>
          <Toggle label={t('el.header')} checked={p.header !== false} onChange={(v) => setProp('header', v ? undefined : false)} />
          {p.header !== false && <ListField label={t('el.headers')} value={p.headers} max={PROP_RANGES.tableCols.max} onChange={(v) => setProp('headers', v)} />}
        </>
      );
    case 'checklist':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Count label={t('el.items')} value={p.items} range={PROP_RANGES.checkItems} def={PROP_DEFAULTS.checkItems} onChange={(v) => setProp('items', v)} />
            <Count label={t('el.columns')} value={p.columns} range={PROP_RANGES.checkColumns} def={1} onChange={(v) => setProp('columns', v)} />
          </div>
          <Field label={t('el.shape')} group>
            <Segmented value={(CHECK_SHAPES.find((s) => s === p.shape) ?? 'circle') as 'circle'} onChange={(v) => setProp('shape', v)} options={opt(CHECK_SHAPES, (v) => `el.shape.${v}` as UiKey)} />
          </Field>
          <ListField label={t('el.labels')} value={p.labels} max={PROP_RANGES.checkItems.max} onChange={(v) => setProp('labels', v)} />
        </>
      );
    case 'habits':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Count label={t('el.habitRows')} value={p.rows} range={PROP_RANGES.habitRows} def={PROP_DEFAULTS.habitRows} onChange={(v) => setProp('rows', v)} />
            <Count label={t('el.days')} value={p.days} range={PROP_RANGES.habitDays} def={PROP_DEFAULTS.habitDays} onChange={(v) => setProp('days', v)} />
          </div>
          <ListField label={t('el.names')} value={p.names} max={PROP_RANGES.habitRows.max} onChange={(v) => setProp('names', v)} />
        </>
      );
    case 'finance':
      return (
        <>
          <Count label={t('el.amountLines')} value={p.lines} range={PROP_RANGES.amountLines} def={PROP_DEFAULTS.amountLines} onChange={(v) => setProp('lines', v)} />
          <Field label={t('el.title')}>
            <TextInput value={typeof p.title === 'string' ? p.title : ''} onChange={(v) => setProp('title', v === '' ? undefined : v)} />
          </Field>
          <Toggle label={t('el.total')} checked={p.total !== false} onChange={(v) => setProp('total', v ? undefined : false)} />
        </>
      );
    case 'minical': {
      const month = typeof p.month === 'string' && months.some((m) => m.value === p.month) ? p.month : 'auto';
      return (
        <>
          <Field label={t('el.month')}>
            <Select value={month} onChange={(v) => setProp('month', v === 'auto' ? undefined : v)} options={[{ value: 'auto', label: t('el.monthAuto') }, ...months.map((m) => ({ value: m.value, label: m.label }))]} />
          </Field>
          <Toggle label={t('el.monthTitle')} checked={p.title !== false} onChange={(v) => setProp('title', v ? undefined : false)} />
        </>
      );
    }
    case 'quadrants': {
      const titles = stringList(p.titles, 4);
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Field key={i} label={t('el.quadrantTitle', { n: i + 1 })}>
              <TextInput value={titles[i] ?? ''} ariaLabel={t('el.quadrantTitle', { n: i + 1 })} onChange={(v) => setProp('titles', [0, 1, 2, 3].map((k) => (k === i ? v : (titles[k] ?? ''))))} />
            </Field>
          ))}
          <Field label={t('el.quadrantStyle')} group>
            <Segmented value={(QUADRANT_STYLES.find((s) => s === p.style) ?? 'blank') as 'blank'} onChange={(v) => setProp('style', v === 'blank' ? undefined : v)} options={opt(QUADRANT_STYLES, (v) => `val.${v}` as UiKey)} />
          </Field>
        </>
      );
    }
    case 'notes': {
      const style = NOTE_STYLES.find((s) => s === p.style) ?? 'auto';
      return (
        <>
          <Field label={t('el.title')}>
            <TextInput value={typeof p.title === 'string' ? p.title : ''} onChange={(v) => setProp('title', v === '' ? undefined : v)} />
          </Field>
          <Field label={t('el.noteStyle')}>
            <Select value={style} onChange={(v) => setProp('style', v === 'auto' ? undefined : v)} options={[{ value: 'auto', label: t('el.noteAuto') }, ...opt(NOTE_STYLES, (v) => `val.${v}` as UiKey)]} />
          </Field>
          <Toggle label={t('el.frame')} checked={p.frame === true} onChange={(v) => setProp('frame', v ? true : undefined)} />
        </>
      );
    }
    case 'timeline':
      return (
        <div className="grid grid-cols-3 gap-2">
          <Count label={t('el.from')} value={p.from} range={PROP_RANGES.hourFrom} def={PROP_DEFAULTS.hourFrom} onChange={(v) => setProp('from', v)} />
          <Count label={t('el.to')} value={p.to} range={PROP_RANGES.hourTo} def={PROP_DEFAULTS.hourTo} onChange={(v) => setProp('to', v)} />
          <Count label={t('el.step')} value={p.step} range={PROP_RANGES.hourStep} def={PROP_DEFAULTS.hourStep} onChange={(v) => setProp('step', v)} />
        </div>
      );
    case 'rating':
      return (
        <>
          <Count label={t('el.count')} value={p.count} range={PROP_RANGES.ratingCount} def={PROP_DEFAULTS.ratingCount} onChange={(v) => setProp('count', v)} />
          <Field label={t('el.shape')} group>
            <Segmented value={(RATING_FORMS.find((s) => s === p.shape) ?? 'star') as 'star'} onChange={(v) => setProp('shape', v)} options={opt(RATING_FORMS, (v) => `el.rating.${v}` as UiKey)} />
          </Field>
          <Field label={t('el.ratingText')}>
            <TextInput value={typeof p.text === 'string' ? p.text : ''} onChange={(v) => setProp('text', v === '' ? undefined : v)} />
          </Field>
        </>
      );
    case 'qr':
      return <QrFields p={p} setProp={setProp} ink={ink} />;
  }
}

/** Qué guarda el código, cuánto se corrige, de qué color y si es tocable en el PDF; con el tamaño del código que sale. */
function QrFields({ p, setProp, ink }: { p: Record<string, unknown>; setProp: Props['setProp']; ink: string }) {
  const t = useT();
  const text = typeof p.text === 'string' ? p.text : '';
  const ecc = QR_ECC_LEVELS.find((e) => e === p.ecc) ?? 'M';
  let info = '';
  if (text.trim() !== '') {
    try {
      const size = qrEncode(text, ecc).size;
      info = t('el.qr.size', { n: size });
    } catch {
      info = t('el.qr.tooLong');
    }
  }
  const linkable = safeUrl(text) !== null;
  return (
    <>
      <Field label={t('el.qr.text')} hint={info || t('el.qr.textHint')}>
        <TextArea value={text} rows={3} placeholder="https://" onChange={(v) => setProp('text', v.slice(0, QR_MAX_CHARS))} />
      </Field>
      <Field label={t('el.qr.ecc')} hint={t('el.qr.eccHint')} group>
        <Segmented compact value={ecc} onChange={(v) => setProp('ecc', v)} options={QR_ECC_LEVELS.map((e) => ({ value: e, label: t(`el.qr.ecc.${e}` as UiKey) }))} />
      </Field>
      <ColorInput label={t('el.qr.color')} value={typeof p.color === 'string' ? p.color : ink} modified={typeof p.color === 'string'} onReset={() => setProp('color', undefined)} onChange={(v) => setProp('color', v)} />
      {linkable && <Toggle label={t('el.qr.link')} checked={p.link !== false} onChange={(v) => setProp('link', v ? undefined : false)} />}
    </>
  );
}
