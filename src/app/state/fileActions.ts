/** Acciones de archivo con sus avisos (las usan el menú Archivo, los atajos y la biblioteca). */
import { translate, type UiKey } from '../i18n/ui';
import { exportBackup, openFile, saveDesignToFile } from './files';
import { useStore } from './store';

/** Texto en el idioma actual de la interfaz (estas acciones también se llaman desde atajos de teclado). */
const t = (key: UiKey, vars?: Record<string, string | number>): string => translate(useStore.getState().uiLang, key, vars);

const fail = (e: unknown): void => useStore.getState().setNotice(`${t('file.error')} ${(e as Error).message}`);

export async function saveCurrent(saveAs: boolean): Promise<void> {
  const d = useStore.getState().design;
  if (!d) return;
  try {
    const r = await saveDesignToFile(d, saveAs);
    if (r.status === 'saved') useStore.getState().setNotice(t('file.saved', { name: r.name }));
    else if (r.status === 'downloaded') useStore.getState().setNotice(t('file.downloaded', { name: r.name }));
  } catch (e) {
    fail(e);
  }
}

export async function openAnyFile(): Promise<void> {
  try {
    const r = await openFile();
    if (!r) return;
    const st = useStore.getState();
    if (r.kind === 'design') {
      st.setDesign(r.design);
      st.setShowWelcome(false);
      st.setShowLibrary(false);
      st.setNotice(null);
    } else if (r.kind === 'template') st.setNotice(t('file.templateAdded', { name: r.template.name }));
    else st.setNotice(t('file.restored', { designs: r.designs, templates: r.templates }));
  } catch (e) {
    fail(e);
  }
}

export async function backupAll(): Promise<void> {
  try {
    const r = await exportBackup();
    if (r.status !== 'cancelled') useStore.getState().setNotice(t('file.backupDone', { name: r.name, designs: r.designs, templates: r.templates }));
  } catch (e) {
    fail(e);
  }
}
