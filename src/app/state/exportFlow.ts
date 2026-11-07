/** Exportar parte de la agenda a un PDF desde un menú: avisa el avance y el resultado con el aviso de la ventana. */
import { defaultImageDpi } from '@core/document';
import type { Design } from '@core/design/schema';
import { formatBytes } from '@core/util/bytes';
import type { useT } from '../i18n/ui';
import { deliverPdf, exportPdf, fileBase } from './exporter';
import { useStore } from './store';

type T = ReturnType<typeof useT>;

/** Exporta las páginas pedidas (índices desde 0) como PDF de páginas, con enlaces y marcadores a las que quedan. */
export async function exportRange(t: T, design: Design, pages: readonly number[], suffix: string): Promise<void> {
  const { setNotice } = useStore.getState();
  setNotice(t('export.working', { done: 0, total: '…' }));
  try {
    const bytes = await exportPdf(design, 'pages', (done, total) => setNotice(t('export.working', { done, total })), { pages, imageDpi: defaultImageDpi(design.binding) });
    const name = `${fileBase(design)}-${suffix}.pdf`;
    const done = await deliverPdf(bytes, name);
    useStore.getState().setLastExport(done.kind === 'saved' ? { name: done.name, path: done.path } : null);
    setNotice(done.kind === 'saved' ? t('export.savedTo', { name: done.name, path: done.path, size: formatBytes(bytes.length) }) : done.kind === 'cancelled' ? t('export.cancelled') : t('export.done', { name, size: formatBytes(bytes.length) }));
  } catch (err) {
    setNotice(t('export.error', { msg: (err as Error).message }));
  }
}
