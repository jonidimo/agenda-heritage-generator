/** ¿Algún píxel de un buffer RGBA es total o parcialmente transparente? (Decide si una imagen puede ir como JPEG.) */
export function hasTransparentPixels(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 255) return true;
  return false;
}
