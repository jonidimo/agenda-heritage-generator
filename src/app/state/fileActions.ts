/** Acciones de archivo con sus avisos (las usan el menú Archivo, los atajos y la biblioteca). */
import { exportBackup, importText, openFile, saveDesignToFile, type Imported } from './files';
import { useStore } from './store';
import { tNow as t } from './tNow';

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

/** Lo que se abrió: una agenda pasa a ser la agenda actual; una plantilla o una copia de seguridad se suman a la biblioteca. */
function applyImported(r: Imported): void {
  const st = useStore.getState();
  if (r.kind === 'design') {
    st.setDesign(r.design);
    st.setShowWelcome(false);
    st.setShowLibrary(false);
    st.setNotice(null);
  } else if (r.kind === 'template') st.setNotice(t('file.templateAdded', { name: r.template.name }));
  else st.setNotice(t('file.restored', { designs: r.designs, templates: r.templates }));
}

export async function openAnyFile(): Promise<void> {
  try {
    const r = await openFile();
    if (r) applyImported(r);
  } catch (e) {
    fail(e);
  }
}

/** Abre un archivo cuyo texto ya se tiene (uno soltado sobre la ventana, o el que pide el sistema al escritorio). */
export async function openFromText(text: string): Promise<void> {
  try {
    applyImported(await importText(text));
  } catch (e) {
    fail(e);
  }
}

/** ¿El archivo soltado puede ser una agenda, una plantilla o una copia de seguridad? */
export const isPlannerFile = (f: Pick<File, 'name' | 'type'>): boolean => /\.json$/i.test(f.name) || f.type === 'application/json';

/**
 * Engancha el soltar archivos sobre la ventana: un archivo de agenda se abre. Devuelve la función que lo desengancha.
 * Los `dragover` de otra cosa (texto, imágenes de la página) no se tocan.
 */
export function installFileDrop(): () => void {
  const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onOver = (e: DragEvent): void => {
    if (hasFiles(e)) e.preventDefault();
  };
  const onDrop = (e: DragEvent): void => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const file = Array.from(e.dataTransfer?.files ?? []).find(isPlannerFile);
    if (file) void file.text().then(openFromText, fail);
    else useStore.getState().setNotice(t('file.dropWhat'));
  };
  window.addEventListener('dragover', onOver);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragover', onOver);
    window.removeEventListener('drop', onDrop);
  };
}

export async function backupAll(): Promise<void> {
  try {
    const r = await exportBackup();
    if (r.status !== 'cancelled') useStore.getState().setNotice(t('file.backupDone', { name: r.name, designs: r.designs, templates: r.templates }));
  } catch (e) {
    fail(e);
  }
}
