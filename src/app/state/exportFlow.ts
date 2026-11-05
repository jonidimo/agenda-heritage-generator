/** Exportar parte de la agenda a un PDF desde un menú: avisa el avance y el resultado con el aviso de la ventana. */
import type { Design } from '@core/design/schema';
import type { useT } from '../i18n/ui';
import { download, exportPdf, fileBase } from './exporter';
import { useStore } from './store';

type T = ReturnType<typeof useT>;

/** Exporta las páginas pedidas (índices desde 0) como PDF de páginas, con enlaces y marcadores a las que quedan. */
export async function exportRange(t: T, design: Design, pages: readonly number[], suffix: string): Promise<void> {
  const { setNotice } = useStore.getState();
  setNotice(t('export.working', { done: 0, total: '…' }));
  try {
    const bytes = await exportPdf(design, 'pages', (done, total) => setNotice(t('export.working', { done, total })), { pages });
    const name = `${fileBase(design)}-${suffix}.pdf`;
    download(bytes, name);
    setNotice(t('export.done', { name }));
  } catch (err) {
    setNotice(t('export.error', { msg: (err as Error).message }));
  }
}
