/**
 * Búsqueda que perdona: sin importar mayúsculas ni tildes, con palabras a medio escribir y con
 * errores de tipeo (una letra de más, de menos, cambiada o dos letras invertidas). Funciones
 * puras: el índice se prepara una vez y cada búsqueda solo compara palabras cortas.
 */

/** Texto para comparar: sin tildes, en minúsculas, solo letras y números separados por un espacio. */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Distancia entre dos palabras (Damerau-Levenshtein en su forma «alineación óptima»): cuántas
 * letras hay que agregar, quitar, cambiar o invertir. Corta apenas supera `max`.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n]!;
}

/** Errores de tipeo aceptados según el largo de la palabra buscada. */
const tolerance = (len: number): number => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

export interface Prepared {
  folded: string;
  words: string[];
}

export function prepare(text: string): Prepared {
  const folded = foldText(text);
  return { folded, words: folded ? folded.split(' ') : [] };
}

/**
 * Qué tan bien coincide una búsqueda con un texto, de 0 (nada) a 1 (igual). Primero lo literal
 * (igual, contiene la frase), después cada palabra al principio de alguna palabra del texto y por
 * último con errores de tipeo.
 */
export function fuzzyScore(query: Prepared, text: Prepared): number {
  const q = query.folded;
  if (!q || !text.folded) return 0;
  if (text.folded === q) return 1;
  const at = text.folded.indexOf(q);
  if (at >= 0) return (at === 0 || text.folded[at - 1] === ' ' ? 0.9 : 0.8) - Math.min(0.1, at / 400);
  let typos = 0;
  for (const w of query.words) {
    let best = Infinity;
    const max = tolerance(w.length);
    for (const x of text.words) {
      if (x.startsWith(w)) {
        best = 0;
        break;
      }
      if (max === 0) continue;
      // Palabra entera o su comienzo (se está escribiendo): «caldario» ≈ «calendario».
      const d = Math.min(editDistance(w, x, max), x.length > w.length ? editDistance(w, x.slice(0, w.length), max) : max + 1);
      if (d < best) best = d;
    }
    if (best > max) return 0;
    typos += best;
  }
  return 0.7 - Math.min(0.4, typos * 0.1);
}

/** Los mejores resultados, de mayor a menor coincidencia (empates: el texto más corto primero). */
export function fuzzySearch<T>(query: string, items: ReadonlyArray<T & { prepared: Prepared }>, limit = 30): Array<T & { prepared: Prepared; score: number }> {
  const q = prepare(query);
  if (!q.folded) return [];
  const out: Array<T & { prepared: Prepared; score: number }> = [];
  for (const it of items) {
    const score = fuzzyScore(q, it.prepared);
    if (score > 0) out.push({ ...it, score });
  }
  return out.sort((a, b) => b.score - a.score || a.prepared.folded.length - b.prepared.folded.length).slice(0, limit);
}
