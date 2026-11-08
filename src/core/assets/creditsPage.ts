/**
 * La página de créditos de las imágenes: el autor, la licencia y la dirección de cada imagen que trae un
 * `credit`, como páginas propias de texto al final de la agenda. Lo comparten el servidor MCP y el asistente.
 */
import type { Design } from '../design/schema';

export const CREDIT_PAGE_PREFIX = 'credits-img';

/** Las páginas que arma esto (y solo ellas se reemplazan o se quitan). */
export const isCreditPage = (id: unknown): boolean => typeof id === 'string' && /^credits-img(?:-\d+)?$/.test(id);

export interface CreditPageOptions {
  title?: string | undefined;
  intro?: string | undefined;
  perPage?: number | undefined;
  /** Clave de la página después de la cual van (la última que no sea de relleno). */
  after: string | null;
}

/** Los créditos en texto: título, autor, licencia (con su enlace), dónde está, y si se la modificó. */
export function creditLines(assets: readonly Design['assets'][number][]): string[] {
  // La misma foto importada dos veces (con otro recorte) se acredita una sola vez.
  const seen = new Set<string>();
  return assets
    .filter((x) => {
      if (!x.credit) return false;
      const key = `${x.credit.source}:${x.credit.id}`;
      if (x.credit.verified && seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((x) => {
      const c = x.credit!;
      const what = c.title || x.name;
      return `${what}${c.author ? ` — ${c.author}` : ''} · ${c.license}${c.modified ? ' (adaptada: recortada y achicada)' : ''}${c.url ? `\n${c.url}` : ''}${c.licenseUrl ? `\n${c.licenseUrl}` : ''}`;
    });
}

/** Las páginas propias de créditos, repartidas de a `perPage`. */
export function creditPages(assets: readonly Design['assets'][number][], opts: CreditPageOptions) {
  const heading = opts.title ?? 'Créditos de las imágenes';
  const lines = creditLines(assets);
  const size = opts.perPage ?? 8;
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size));
  return chunks.map((chunk, i) => ({
    id: i === 0 ? CREDIT_PAGE_PREFIX : `${CREDIT_PAGE_PREFIX}-${i + 1}`,
    after: opts.after,
    fallback: null,
    startOn: 'any',
    title: chunks.length > 1 ? `${heading} (${i + 1}/${chunks.length})` : heading,
    content: { kind: 'text', text: `${i === 0 && opts.intro ? `${opts.intro}\n\n` : ''}${chunk.join('\n\n')}`, area: 'content', background: 'blank' },
  }));
}
