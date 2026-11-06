/**
 * Una copia en escala de grises de una imagen (para una marca de agua): el PDF no puede pasar a grises
 * una foto al imprimir sin decodificarla, así que se hace una vez acá, en el navegador, y se guarda como
 * una imagen nueva de la agenda.
 */
import { grayPixels } from '@core/util/color';
import { resources } from './resources';
import { useStore } from './store';
import { addAssetFiles } from './uploads';

/** Hace la copia y devuelve la id de la imagen nueva (o `null` si no hay bytes de esa imagen). */
export async function grayscaleCopy(assetId: string, name: (original: string) => string, coalesce?: string): Promise<string | null> {
  const asset = useStore.getState().design?.assets.find((a) => a.id === assetId);
  const bytes = resources.assetBytes.get(assetId);
  if (!asset || !bytes || asset.kind !== 'raster') return null;
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: asset.mime }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayPixels(img.data);
  ctx.putImageData(img, 0, 0);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) return null;
  const file = new File([png], `${name(asset.name.replace(/\.[a-z0-9]+$/i, ''))}.png`, { type: 'image/png' });
  const r = await addAssetFiles([file], (n) => n, coalesce);
  return r.ids[0] ?? null;
}
