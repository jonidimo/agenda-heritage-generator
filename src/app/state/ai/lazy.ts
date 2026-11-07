/**
 * El motor del asistente se descarga recién cuando se usa. Si no llega, casi siempre es porque el
 * programa se actualizó (o se volvió a compilar) con la ventana abierta: la página pide un archivo
 * que ya no existe, y el navegador recuerda ese fallo hasta que se recarga. Volver a pedirlo no sirve;
 * recargar la ventana sí. El error lo dice así, y la interfaz ofrece recargar.
 */
import { AiError } from '@core/ai/errors';
import { flushSave } from '../store';

export async function loadEngine(): Promise<typeof import('./engine')> {
  try {
    return await import('./engine');
  } catch (err) {
    throw new AiError('reload', err instanceof Error ? err.message : String(err));
  }
}

/** Recarga la ventana después de guardar lo que esté pendiente (lo último editado no se pierde). */
export async function reloadWindow(): Promise<void> {
  try {
    await flushSave();
  } finally {
    location.reload();
  }
}
