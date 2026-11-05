/** Controles base de la interfaz (accesibles, compactos y consistentes). */
import clsx from 'clsx';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefCallback } from 'react';
import { useT } from '../i18n/ui';
import { frameThrottle } from '../state/frame';

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

/** Botón de «restablecer» de un valor que se apartó del que trae por defecto. */
function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  const t = useT();
  const name = `${t('common.reset')}: ${label}`;
  return (
    <button type="button" aria-label={name} title={name} onClick={onClick} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-soft hover:bg-black/5 hover:text-ink">
      <RotateCcw size={12} />
    </button>
  );
}

/** Dos números se consideran iguales si difieren menos que esto (los deslizadores usan pasos decimales). */
const SAME_VALUE = 1e-9;

/**
 * Cómo se restablece un control. Con `defaultValue`, el botón aparece mientras el valor sea otro y
 * lo vuelve a ese valor. Si el valor por defecto es «sin ajuste» (el valor lo da el tema, no hay un
 * número propio), el control indica con `modified` si tiene un ajuste y `onReset` lo quita.
 */
interface ResetProps<T> {
  defaultValue?: T;
  modified?: boolean;
  onReset?: () => void;
}

/**
 * Arrastre de un control con vista previa (deslizador, selector de color). Mientras se arrastra,
 * el control muestra su propio valor y `onPreview` recibe el valor como mucho una vez por cuadro de
 * animación (el lienzo se redibuja sin tocar el historial ni el guardado); al soltar, el evento
 * `change` nativo confirma UNA vez con `onChange`. Sin `onPreview`, cada cambio se confirma al
 * instante (el comportamiento de siempre).
 *
 * El evento `input` nativo llega decenas de veces por segundo, y `change`, solo al soltar (o en
 * cada paso del teclado): por eso la confirmación escucha `change` directamente.
 */
export function useScrub<T>(opts: { value: T; parse: (el: HTMLInputElement) => T; onPreview?: ((value: T) => void) | undefined; onChange: (value: T) => void }): {
  /** Lo que muestra el control: el valor que se está arrastrando, o el confirmado. */
  shown: T;
  /** Un valor nuevo (evento `input`). */
  input(value: T): void;
  /** Ref del `<input>`: confirma al soltar. */
  commitRef: RefCallback<HTMLInputElement>;
} {
  const [dragging, setDragging] = useState<{ value: T } | null>(null);
  /** El arrastre en curso, también para quien limpia al desmontarse. */
  const open = useRef<{ value: T } | null>(null);
  const live = useRef(opts);
  useLayoutEffect(() => {
    live.current = opts;
  });
  const throttle = useMemo(() => frameThrottle<T>((value) => live.current.onPreview?.(value)), []);

  const input = useCallback(
    (value: T): void => {
      if (!live.current.onPreview) {
        live.current.onChange(value);
        return;
      }
      open.current = { value };
      setDragging({ value });
      throttle.push(value);
    },
    [throttle],
  );

  const commitRef = useCallback<RefCallback<HTMLInputElement>>(
    (el) => {
      if (!el) return;
      const onNativeChange = (): void => {
        // Sin vista previa cada `input` ya confirmó.
        if (!live.current.onPreview) return;
        const last = open.current ?? { value: live.current.parse(el) };
        open.current = null;
        throttle.flush();
        setDragging(null);
        live.current.onChange(last.value);
      };
      el.addEventListener('change', onNativeChange);
      return () => el.removeEventListener('change', onNativeChange);
    },
    [throttle],
  );

  // Si el control desaparece a mitad de un arrastre (otra selección, otra página), lo arrastrado se confirma.
  useEffect(
    () => () => {
      throttle.cancel();
      const last = open.current;
      open.current = null;
      if (last && live.current.onPreview) live.current.onChange(last.value);
    },
    [throttle],
  );

  return { shown: dragging ? dragging.value : opts.value, input, commitRef };
}

const parseRange = (el: HTMLInputElement): number => Number(el.value);
const parseColor = (el: HTMLInputElement): string => el.value;

/** Deslizador con valor numérico editable al lado y botón para restablecerlo. */
export function Slider(
  props: {
    label: string;
    value: number;
    /** Confirma el valor (al soltar, si hay `onPreview`; si no, en cada cambio). */
    onChange: (v: number) => void;
    /** Vista previa mientras se arrastra (ver `useScrub`). */
    onPreview?: (v: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    integer?: boolean;
  } & ResetProps<number>,
) {
  const id = useId();
  const { defaultValue } = props;
  const scrubbing = useScrub<number>({ value: props.value, parse: parseRange, onPreview: props.onPreview, onChange: props.onChange });
  const shown = scrubbing.shown;
  const reset = props.onReset ?? (defaultValue === undefined ? undefined : () => props.onChange(defaultValue));
  const modified = props.modified ?? (defaultValue !== undefined && Math.abs(shown - defaultValue) > SAME_VALUE);
  return (
    <div className="py-1">
      <div className="mb-0.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[11.5px] font-semibold text-ink-soft">
          {props.label}
        </label>
        <div className="flex items-center gap-1">
          {modified && reset && <ResetButton label={props.label} onClick={reset} />}
          <div className="w-[74px]">
            <NumberInput value={shown} onChange={props.onChange} min={props.min} max={props.max} step={props.step} integer={props.integer} ariaLabel={props.label} className="!py-0.5 text-right" />
          </div>
        </div>
      </div>
      <input
        id={id}
        ref={scrubbing.commitRef}
        className="w-full"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={shown}
        onChange={(e) => scrubbing.input(props.integer ? Math.round(Number(e.target.value)) : Number(e.target.value))}
      />
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

export function ColorInput(props: { label: string; value: string; onChange: (v: string) => void; onPreview?: (v: string) => void } & ResetProps<string>) {
  const { defaultValue } = props;
  const scrubbing = useScrub<string>({ value: props.value, parse: parseColor, onPreview: props.onPreview, onChange: props.onChange });
  const shown = scrubbing.shown;
  const reset = props.onReset ?? (defaultValue === undefined ? undefined : () => props.onChange(defaultValue));
  const modified = props.modified ?? (defaultValue !== undefined && shown.toLowerCase() !== defaultValue.toLowerCase());
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[12px] text-ink">{props.label}</span>
      <span className="flex items-center gap-1.5">
        {modified && reset && <ResetButton label={props.label} onClick={reset} />}
        <span className="font-mono text-[11px] text-ink-soft">{shown}</span>
        <input type="color" ref={scrubbing.commitRef} className="h-6 w-8 cursor-pointer rounded border border-line bg-white p-0" value={shown} onChange={(e) => scrubbing.input(e.target.value)} />
      </span>
    </label>
  );
}

/**
 * Grupo plegable. El contenido plegado sigue en la página (oculto): así el buscador encuentra sus
 * controles, y el evento `reveal` (ver `state/reveal`) lo abre para mostrarlos.
 */
export function Group(props: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode; id?: string }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onReveal = (): void => setOpen(true);
    el.addEventListener('reveal', onReveal);
    return () => el.removeEventListener('reveal', onReveal);
  }, []);
  return (
    <section ref={ref} className="border-b border-line/80 py-2" data-group={props.id ?? props.title}>
      <div className="flex items-center justify-between">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-1 py-1 text-left text-[11px] font-extrabold tracking-[0.08em] text-ink uppercase">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {props.title}
        </button>
        {props.right}
      </div>
      <div className="pt-1 pb-1" hidden={!open}>
        {props.children}
      </div>
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

/**
 * Opciones en fila. Si no entran en el ancho disponible (un panel angosto, un idioma de textos
 * largos) pasan a la fila siguiente en lugar de salirse del panel. Con ícono, en pantallas muy
 * chicas se ve solo el ícono; sin ícono el texto se ve siempre.
 */
export function Segmented<T extends string>(props: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }> }) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-lg border border-line bg-white/60 p-0.5">
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
          <span className={o.icon ? 'hidden sm:inline' : undefined}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Cuánto se mueve un divisor con las flechas del teclado (con Mayús, el triple). */
const SPLITTER_KEY_STEP_PX = 16;

/**
 * Divisor para cambiar el tamaño de un panel arrastrándolo (o con las flechas del teclado, o con
 * doble clic para volver al tamaño original). No ocupa lugar: se superpone al borde del panel.
 * `value` y sus límites están en las unidades del panel (normalmente píxeles de maquetación).
 */
export function Splitter(props: {
  /** `vertical`: una barra vertical que cambia anchos; `horizontal`: una barra horizontal que cambia alturas. */
  orientation: 'vertical' | 'horizontal';
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  /** El valor crece al arrastrar hacia atrás (izquierda o arriba): paneles de la derecha y de abajo. */
  invert?: boolean;
  /** Cuánto cambia el valor por cada píxel arrastrado (1 si el valor está en píxeles). */
  ratio?: number;
  onChange: (value: number) => void;
  /** Se soltó el divisor (o se usó el teclado): es el momento de guardar el tamaño. */
  onCommit: () => void;
}) {
  const t = useT();
  const vertical = props.orientation === 'vertical';
  const ratio = props.ratio ?? 1;
  const sign = props.invert ? -1 : 1;
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ start: number; value: number; pxPerCssPx: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (v: number): number => Math.min(props.max, Math.max(props.min, v));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    // El puntero llega en píxeles de pantalla y el valor está en los de la maquetación: con zoom
    // de interfaz no son iguales. La razón sale del propio divisor (a lo largo de su eje).
    const layout = vertical ? el.offsetHeight : el.offsetWidth;
    const screen = vertical ? el.getBoundingClientRect().height : el.getBoundingClientRect().width;
    drag.current = { start: vertical ? e.clientX : e.clientY, value: props.value, pxPerCssPx: layout > 0 && screen > 0 ? screen / layout : 1 };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    const moved = ((vertical ? e.clientX : e.clientY) - d.start) / d.pxPerCssPx;
    props.onChange(clamp(d.value + sign * moved * ratio));
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    props.onCommit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = SPLITTER_KEY_STEP_PX * (e.shiftKey ? 3 : 1) * ratio;
    const forward = vertical ? 'ArrowRight' : 'ArrowDown';
    const back = vertical ? 'ArrowLeft' : 'ArrowUp';
    const next = e.key === forward ? props.value + sign * step : e.key === back ? props.value - sign * step : e.key === 'Home' ? props.min : e.key === 'End' ? props.max : e.key === 'Enter' ? props.defaultValue : null;
    if (next === null) return;
    e.preventDefault();
    props.onChange(clamp(next));
    props.onCommit();
  };

  return (
    <div className={clsx('relative z-20 shrink-0', vertical ? 'h-full w-0' : 'h-0 w-full')}>
      <div
        ref={ref}
        role="separator"
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        aria-label={props.label}
        aria-valuenow={Math.round(props.value)}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        tabIndex={0}
        title={t('panel.resizeHint')}
        className={clsx(
          'absolute touch-none transition-colors outline-none hover:bg-accent/30 focus-visible:bg-accent/40',
          dragging && 'bg-accent/40',
          vertical ? 'inset-y-0 -left-[3px] w-[7px] cursor-col-resize' : 'inset-x-0 -top-[3px] h-[7px] cursor-row-resize',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          props.onChange(clamp(props.defaultValue));
          props.onCommit();
        }}
      />
    </div>
  );
}
