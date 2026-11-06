/** La biblioteca de íconos: una grilla con búsqueda (por nombre o palabras, en los cuatro idiomas). */
import { iconPath, searchIcons } from '@core/assets/icons';
import { useState } from 'react';
import { useT } from '../i18n/ui';
import { useIconPicker } from '../state/iconPicker';
import { Modal } from './Dialogs';
import { TextInput } from './ui';

export function IconPickerHost() {
  const pending = useIconPicker((s) => s.pending);
  return pending ? <IconPicker onPick={pending} /> : null;
}

function IconPicker({ onPick }: { onPick: (id: string | null) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const found = searchIcons(query);
  return (
    <Modal title={t('icons.title')} onClose={() => onPick(null)}>
      <TextInput
        value={query}
        onChange={setQuery}
        placeholder={t('icons.search')}
        ariaLabel={t('icons.search')}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && found[0]) onPick(found[0].id);
        }}
      />
      <p className="mt-1 text-[11px] text-ink-soft" aria-live="polite">
        {t('icons.count', { n: found.length })}
      </p>
      <div className="mt-2 grid max-h-[50vh] grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 overflow-y-auto" data-testid="icon-grid">
        {found.map((icon) => (
          <button
            key={icon.id}
            type="button"
            title={icon.id}
            data-icon={icon.id}
            onClick={() => onPick(icon.id)}
            className="flex flex-col items-center gap-1 rounded-md border border-line bg-white px-1 py-2 text-[10.5px] text-ink-soft hover:border-accent hover:text-ink focus-visible:border-accent"
          >
            <img src={`${import.meta.env.BASE_URL}${iconPath(icon.id)}`} alt="" className="h-6 w-6" />
            <span className="max-w-full truncate">{icon.id}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] text-ink-soft">{t('icons.credit')}</p>
    </Modal>
  );
}
