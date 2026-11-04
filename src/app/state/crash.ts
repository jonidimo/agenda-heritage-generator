/**
 * Agenda que hizo fallar el editor. Si al arrancar la última agenda abierta es esa, no se abre
 * sola: de otro modo cada recarga volvería a fallar y la aplicación quedaría inutilizable.
 */
const KEY = 'agenda-studio.crashed';

export function markCrashed(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* sin almacenamiento */
  }
}

export function crashedId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** La agenda volvió a mostrarse bien: deja de estar anotada. */
export function clearCrashed(id: string): void {
  try {
    if (localStorage.getItem(KEY) === id) localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}
