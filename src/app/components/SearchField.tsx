/**
 * El buscador de la barra superior, a la vista: parece un campo para escribir, con la lupa y el atajo.
 * Al tocarlo (o al llegar con Tab y apretar Enter) abre la paleta de búsqueda, que es donde se escribe.
 */
import clsx from 'clsx';
import { Search } from 'lucide-react';

export function SearchField(props: { label: string; placeholder: string; hint: string; wide: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={props.label}
      title={props.label}
      data-testid="search-field"
      className={clsx(
        'inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-line bg-white/80 px-2.5 text-left text-[12.5px] text-ink-soft shadow-[inset_0_1px_0_rgba(0,0,0,0.03)] hover:border-accent/60 hover:text-ink focus-visible:border-accent',
        props.wide ? 'w-60' : 'w-40',
      )}
    >
      <Search size={15} className="shrink-0 text-ink" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{props.placeholder}</span>
      <kbd className="shrink-0 rounded border border-line bg-paper px-1 text-[10.5px] font-semibold">{props.hint}</kbd>
    </button>
  );
}
