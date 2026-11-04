/** Controles base de la interfaz (accesibles, compactos y consistentes). */
import clsx from 'clsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function Button(props: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'outline' | 'danger'; disabled?: boolean; title?: string; className?: string; type?: 'button' | 'submit' }) {
  const v = props.variant ?? 'outline';
  return (
    <button
      type={props.type ?? 'button'}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        v === 'primary' && 'bg-accent text-white hover:bg-[#435c31]',
        v === 'outline' && 'border border-line bg-white/70 text-ink hover:bg-white',
        v === 'ghost' && 'text-ink-soft hover:bg-black/5 hover:text-ink',
        v === 'danger' && 'border border-[#d9b4a0] bg-white/70 text-warn hover:bg-[#fbeee6]',
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

export function IconButton(props: { label: string; children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-35',
        props.active ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-black/5 hover:text-ink',
      )}
    >
      {props.children}
    </button>
  );
}

/**
 * Campo con rótulo. Con un solo control usa `<label>` (tocar el rótulo enfoca el control);
 * con `group` (varios botones, p. ej. `Segmented`) usa un grupo rotulado: un `<label>`
 * alrededor de botones le daría al primero el texto de todo el campo como nombre.
 */
export function Field(props: { label: string; children: ReactNode; hint?: string; inline?: boolean; group?: boolean }) {
  const id = useId();
  const cls = clsx('block', props.inline ? 'flex items-center justify-between gap-3 py-1' : 'py-1.5');
  const caption = (
    <span id={`${id}-label`} className={clsx('block text-[11.5px] font-semibold text-ink-soft', !props.inline && 'mb-1')}>
      {props.label}
    </span>
  );
  const hint = props.hint && <span className="mt-1 block text-[11px] leading-snug text-ink-soft/80">{props.hint}</span>;
  if (props.group)
    return (
      <div role="group" aria-labelledby={`${id}-label`} className={cls}>
        {caption}
        {props.children}
        {hint}
      </div>
    );
  return (
    <label className={cls}>
      {caption}
      {props.children}
      {hint}
    </label>
  );
}

const inputCls = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; onBlur?: () => void; ariaLabel?: string }) {
  return (
    <input
      className={inputCls}
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onChange={(e) => props.onChange(e.target.value)}
      onBlur={props.onBlur}
    />
  );
}

export function TextArea(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea className={clsx(inputCls, 'resize-y leading-snug')} rows={props.rows ?? 3} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />;
}

/** Campo numérico. Con `integer` redondea (los campos enteros del diseño nunca reciben un 4,5). */
export function NumberInput(props: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; integer?: boolean; ariaLabel?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={clsx(inputCls, 'tabular-nums', props.className)}
      type="number"
      aria-label={props.ariaLabel}
      inputMode={props.integer ? 'numeric' : 'decimal'}
      value={draft ?? String(Number(props.value.toFixed(3)))}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onChange={(e) => {
        setDraft(e.target.value);
        const raw = Number(e.target.value.replace(',', '.'));
        const v = props.integer ? Math.round(raw) : raw;
        if (e.target.value !== '' && Number.isFinite(v)) props.onChange(Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v)));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** Deslizador con valor numérico editable al lado. */
export function Slider(props: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; integer?: boolean }) {
  const id = useId();
  return (
    <div className="py-1">
      <div className="mb-0.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[11.5px] font-semibold text-ink-soft">
          {props.label}
        </label>
        <div className="w-[74px]">
          <NumberInput value={props.value} onChange={props.onChange} min={props.min} max={props.max} step={props.step} integer={props.integer} ariaLabel={props.label} className="!py-0.5 text-right" />
        </div>
      </div>
      <input id={id} className="w-full" type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value} onChange={(e) => props.onChange(props.integer ? Math.round(Number(e.target.value)) : Number(e.target.value))} />
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>
        <span className="text-[12.5px] text-ink">{props.label}</span>
        {props.hint && <span className="block text-[11px] leading-snug text-ink-soft">{props.hint}</span>}
      </span>
    </label>
  );
}

export function Select<T extends string>(props: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; ariaLabel?: string }) {
  return (
    <select aria-label={props.ariaLabel} className={clsx(inputCls, 'pr-6')} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorInput(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[12px] text-ink">{props.label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-ink-soft">{props.value}</span>
        <input type="color" className="h-6 w-8 cursor-pointer rounded border border-line bg-white p-0" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function Group(props: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section className="border-b border-line/80 py-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 py-1 text-left text-[11px] font-extrabold tracking-[0.08em] text-ink uppercase">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {props.title}
        </button>
        {props.right}
      </div>
      {open && <div className="pt-1 pb-1">{props.children}</div>}
    </section>
  );
}

export function Badge(props: { children: ReactNode; tone?: 'strong' | 'moderate' | 'limited' | 'practice' | 'contested' | 'neutral' }) {
  const tone = props.tone ?? 'neutral';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold whitespace-nowrap',
        tone === 'strong' && 'bg-[#dfead5] text-[#2f4d1f]',
        tone === 'moderate' && 'bg-[#e9efd9] text-[#4b5b22]',
        tone === 'limited' && 'bg-[#f1ead8] text-[#6c5718]',
        tone === 'practice' && 'bg-[#ece7f3] text-[#4b3d6b]',
        tone === 'contested' && 'bg-[#f6e3db] text-[#83391b]',
        tone === 'neutral' && 'bg-black/5 text-ink-soft',
      )}
    >
      {props.children}
    </span>
  );
}

export function Segmented<T extends string>(props: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }> }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white/60 p-0.5">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={props.value === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => props.onChange(o.value)}
          className={clsx(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-colors',
            props.value === o.value ? 'bg-accent text-white' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
