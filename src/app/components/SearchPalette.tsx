/**
 * Buscador (Ctrl+K, «/» o la lupa de la barra): ajustes, secciones, páginas y elementos de la
 * página, con búsqueda que perdona errores de tipeo, tildes y mayúsculas. Al elegir, lleva al
 * lugar y lo resalta.
 */
import { fuzzySearch } from '@core/util/fuzzy';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT, type UiKey } from '../i18n/ui';
import { useDocument } from '../state/doc';
import { buildSearchIndex, type SearchKind } from '../state/searchIndex';
import { useStore } from '../state/store';

const KIND_KEY: Record<SearchKind, UiKey> = {
  setting: 'search.kind.setting',
  panel: 'search.kind.panel',
  section: 'search.kind.section',
  page: 'search.kind.page',
  element: 'search.kind.element',
  asset: 'search.kind.asset',
  font: 'search.kind.font',
};

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.uiLang);
  const design = useStore((s) => s.design);
  const pageIndex = useStore((s) => s.pageIndex);
  const { doc } = useDocument();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const index = useMemo(() => buildSearchIndex(lang, t, design, doc, pageIndex), [lang, design, doc, pageIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => fuzzySearch(query, index, 40), [query, index]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);

  const choose = (i: number): void => {
    const r = results[i];
    if (!r) return;
    onClose();
    r.go();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[calc(12*var(--vh))]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('search.open')} className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-paper shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search size={16} className="text-ink-soft" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label={t('search.open')}
            className="flex-1 bg-transparent text-[14px] outline-none"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
              else if (e.key === 'Enter') choose(active);
              else if (e.key === 'Escape') onClose();
              else return;
              e.preventDefault();
            }}
          />
        </div>
        <ul id={listId} role="listbox" className="scroll-thin max-h-[calc(55*var(--vh))] overflow-y-auto py-1">
          {query && results.length === 0 && <li className="px-3 py-2 text-[12.5px] text-ink-soft">{t('search.none')}</li>}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.label}-${r.where}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              className={clsx('flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-[12.5px]', i === active ? 'bg-accent-soft' : '')}
            >
              <span className="w-16 shrink-0 text-[10.5px] font-semibold tracking-wide text-ink-soft uppercase">{t(KIND_KEY[r.kind])}</span>
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              {r.where && <span className="shrink-0 text-[11px] text-ink-soft">{r.where}</span>}
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-ink-soft">{t('search.hint')}</p>
      </div>
    </div>
  );
}
