/**
 * El selector de íconos se pide desde varios lugares (agregar un elemento, el campo de imagen, una marca
 * de agua, el panel de imágenes): `pickIcon()` lo abre y devuelve el ícono elegido, o `null` si se cerró.
 */
import { ICON_PREFIX, iconAsset } from '@core/assets/icons';
import type { Design } from '@core/design/schema';
import { create } from 'zustand';

interface PickerState {
  /** Quién espera la elección (con el selector abierto). */
  pending: ((id: string | null) => void) | null;
}

export const useIconPicker = create<PickerState>(() => ({ pending: null }));

export function pickIcon(): Promise<string | null> {
  return new Promise((resolve) => {
    // Si había otro pedido abierto, se cierra sin elección.
    useIconPicker.getState().pending?.(null);
    useIconPicker.setState({
      pending: (id) => {
        useIconPicker.setState({ pending: null });
        resolve(id);
      },
    });
  });
}

/** Declara el ícono entre las imágenes de la agenda (si no estaba) y devuelve su id (`icon:<id>`). */
export function declareIcon(d: Design, id: string): string {
  const ref = `${ICON_PREFIX}${id}`;
  if (!d.assets.some((a) => a.id === ref)) d.assets.push(iconAsset(id));
  return ref;
}
