/**
 * «Carpetas» en el panel de imágenes (escritorio): las imágenes de la carpeta de la agenda y de las carpetas que
 * se autorizaron, con vista previa, para agregarlas a Recursos con un clic (pasan por el mismo camino que una subida).
 */
import { fromBase64 } from '@core/resources';
import { FolderOpen, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n/ui';
import { toolsListFolder, toolsOpenProject, toolsReadImage, type FolderListing } from '../../state/ai/toolsConfig';
import { useAssistant } from '../../state/ai/assistant';
import { useStore } from '../../state/store';
import { addAssetFiles } from '../../state/uploads';
import { Button, Group, Select } from '../ui';

const mimeOf = (name: string): string => (/\.svg$/i.test(name) ? 'image/svg+xml' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg');

export function FolderPreview({ onMessage }: { onMessage: (m: string) => void }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const [alias, setAlias] = useState('proyecto');
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [busy, setBusy] = useState(false);
  const agenda = design ? { id: design.id, name: design.name } : null;

  const load = useCallback(async (): Promise<void> => {
    if (!agenda) return;
    setBusy(true);
    try {
      const out = await toolsListFolder(alias, agenda);
      setListing(out.error ? null : out);
    } catch {
      setListing(null);
    } finally {
      setBusy(false);
    }
    // El nombre de la agenda no cambia dónde está su carpeta: solo su id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alias, agenda?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (path: string): Promise<void> => {
    const file = await toolsReadImage(alias, path, agenda);
    if (file.error) return onMessage(file.error);
    const r = await addAssetFiles([new File([fromBase64(file.data).slice()], file.name, { type: mimeOf(file.name) })], (name) => t('assets.unsupported', { name }));
    if (r.messages.length > 0) onMessage(r.messages.join(' '));
  };

  return (
    <Group title={t('assets.folders')} defaultOpen={false}>
      <div className="space-y-2" data-testid="folder-preview">
        <p className="text-[11.5px] leading-snug text-ink-soft">{t('assets.foldersHelp')}</p>
        <div className="flex flex-wrap items-center gap-1">
          <div className="min-w-0 flex-1">
            <Select
              value={alias}
              ariaLabel={t('assets.folders')}
              onChange={setAlias}
              options={(listing?.folders ?? [{ alias: 'proyecto', label: t('assets.folderProject') }]).map((f) => ({ value: f.alias, label: f.alias === 'proyecto' ? t('assets.folderProject') : f.label }))}
            />
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={busy}>
            {t('assets.foldersRefresh')}
          </Button>
          {agenda && (
            <Button variant="outline" title={t('assets.folderOpen')} onClick={() => void toolsOpenProject(agenda)}>
              <FolderOpen size={14} />
            </Button>
          )}
          <Button variant="ghost" onClick={() => useAssistant.getState().setShowTools(true)}>
            {t('assets.foldersManage')}
          </Button>
        </div>
        {listing && listing.images.length === 0 && <p className="text-[11.5px] text-ink-soft">{t('assets.foldersEmpty')}</p>}
        <div className="grid grid-cols-3 gap-1.5">
          {listing?.images.map((img) => (
            <button key={img.path} type="button" className="group relative overflow-hidden rounded-md border border-line bg-white text-left hover:border-accent" title={`${img.path}\n${t('assets.folderAdd')}`} onClick={() => void add(img.path)}>
              {img.thumb ? <img src={`data:image/jpeg;base64,${img.thumb}`} alt={img.path} className="h-16 w-full object-cover" /> : <span className="flex h-16 items-center justify-center text-[10px] text-ink-soft">{img.path.split('/').pop()}</span>}
              <span className="absolute right-0.5 top-0.5 hidden rounded bg-accent p-0.5 text-white group-hover:block">
                <Plus size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </Group>
  );
}
