/** El aviso de la ventana puede traer un botón (p. ej. «Buscar la carpeta de las imágenes…»); al cerrarlo o cambiarlo, el botón se va. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/app/state/store';

beforeEach(() => useStore.getState().setNotice(null));

describe('aviso con acción', () => {
  it('guarda el botón con el aviso y lo quita al cerrarlo', () => {
    const run = vi.fn();
    useStore.getState().setNotice('Faltan imágenes', { label: 'Buscar', run });
    expect(useStore.getState().notice).toBe('Faltan imágenes');
    useStore.getState().noticeAction?.run();
    expect(run).toHaveBeenCalledTimes(1);
    useStore.getState().setNotice(null);
    expect(useStore.getState().noticeAction).toBeNull();
  });

  it('un aviso nuevo sin botón no hereda el anterior', () => {
    useStore.getState().setNotice('Uno', { label: 'Buscar', run: () => undefined });
    useStore.getState().setNotice('Otro');
    expect(useStore.getState().notice).toBe('Otro');
    expect(useStore.getState().noticeAction).toBeNull();
  });

  it('un botón sin aviso no se guarda', () => {
    useStore.getState().setNotice(null, { label: 'Buscar', run: () => undefined });
    expect(useStore.getState().noticeAction).toBeNull();
  });
});
