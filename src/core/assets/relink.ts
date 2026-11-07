/**
 * Reencontrar las imágenes de una agenda que las guarda por ruta (`assets[].path`) cuando se abre donde esa
 * carpeta no se puede leer (la aplicación web): la persona elige la carpeta y cada imagen se busca entre sus
 * archivos. La elegida puede ser la de la agenda, una que la contiene o la de las imágenes sola.
 */

/** Un archivo de la carpeta elegida: su ruta desde ella (con «/») y su nombre. */
export interface RelinkFile {
  path: string;
  name: string;
}

/** Una imagen de la agenda que falta, con la ruta que dice el archivo. */
export interface RelinkAsset {
  id: string;
  path: string;
}

export interface RelinkMatch<F extends RelinkFile> {
  /** Cada imagen con el archivo que le corresponde. */
  matched: Array<{ id: string; file: F }>;
  /** Las imágenes que no se encontraron (o que podrían ser de más de un archivo: no se adivina). */
  missing: string[];
}

/** La ruta en una forma comparable: Unicode compuesto, «/» como separador, sin «./» al principio ni barras repetidas. */
export function normalizeRelinkPath(p: string): string {
  return p
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
}

const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/**
 * A cada imagen le busca su archivo, de lo más seguro a lo más flojo, y se queda con la primera forma que
 * da exactamente uno: la misma ruta; la carpeta elegida contiene a la de la agenda («misagenda/assets/a.png»);
 * la carpeta elegida es una de adentro («a.png» para «assets/a.png»); y por último el nombre solo. Primero se
 * respetan las mayúsculas y después no. Si una forma da más de uno, la imagen queda sin encontrar: elegir
 * entre dos archivos parecidos es peor que pedirlo de nuevo.
 */
export function matchRelinkFiles<F extends RelinkFile>(assets: readonly RelinkAsset[], files: readonly F[]): RelinkMatch<F> {
  const normalized = files.map((file) => ({ file, path: normalizeRelinkPath(file.path) }));
  const matched: Array<{ id: string; file: F }> = [];
  const missing: string[] = [];
  for (const asset of assets) {
    const want = normalizeRelinkPath(asset.path);
    let found: F | null = null;
    let ambiguous = false;
    for (const fold of [false, true]) {
      const norm = (s: string): string => (fold ? s.toLowerCase() : s);
      const w = norm(want);
      const strategies: Array<(p: string) => boolean> = [
        (p) => p === w,
        (p) => p.endsWith(`/${w}`),
        (p) => w.endsWith(`/${p}`),
        (p) => basename(p) === basename(w),
      ];
      for (const same of strategies) {
        const hits = normalized.filter((n) => same(norm(n.path)));
        if (hits.length === 1) {
          found = hits[0]!.file;
          break;
        }
        if (hits.length > 1) {
          ambiguous = true;
          break;
        }
      }
      if (found || ambiguous) break;
    }
    if (found) matched.push({ id: asset.id, file: found });
    else missing.push(asset.id);
  }
  return { matched, missing };
}
