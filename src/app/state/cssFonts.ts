/**
 * Fuentes del registro disponibles para CSS, para que el editor de texto en su lugar use las mismas
 * letras que el dibujo de la página. Se registran una sola vez desde sus bytes (`FontFace` con un
 * búfer no es una carga por URL, así que no depende de `font-src`).
 */
import type { FontFace as AgendaFace } from '@core/text/fonts';

const names = new Map<string, Promise<string>>();

/** Nombre de familia CSS de la cara (cuando la promesa se cumple, el navegador ya puede usarla). */
export function ensureCssFace(face: Pick<AgendaFace, 'key' | 'bytes'>): Promise<string> {
  let name = names.get(face.key);
  if (!name) {
    const family = `hs-${names.size}`;
    // Copia del búfer: `FontFace` se queda con lo que recibe y los bytes del registro no se tocan.
    const css = new FontFace(family, face.bytes.slice().buffer);
    name = css.load().then(() => {
      document.fonts.add(css);
      return family;
    });
    // Si la fuente no se puede cargar, se vuelve a intentar la próxima vez.
    name.catch(() => names.delete(face.key));
    names.set(face.key, name);
  }
  return name;
}
