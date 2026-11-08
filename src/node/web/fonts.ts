/**
 * Fuentes de Google Fonts (todas libres: OFL, Apache o similar). La búsqueda usa la API de desarrolladores
 * (`GOOGLE_FONTS_API_KEY`): se baja la lista completa una vez y se guarda en la caché, así buscar de nuevo no
 * gasta llamadas. Importar una familia que se conoce por nombre también anda sin clave, con la hoja de
 * estilos de Google. Los archivos salen siempre de `fonts.gstatic.com`.
 */
import type { SourceContext } from './sources/types';
import { httpsUrl, isObject, str } from './sources/types';
import { FONT_HOSTS } from './guard';

export interface FontFamilyHit {
  family: string;
  category: string;
  /** Variantes como las nombra Google: `regular`, `italic`, `700`, `700italic`… */
  variants: string[];
  subsets: string[];
  /** Variante → dirección del archivo `.ttf` (solo en la lista de la API). */
  files: Record<string, string>;
  lastModified: string;
}

export interface FontVariant {
  weight: number;
  style: 'normal' | 'italic';
}

const LIST_URL = 'https://www.googleapis.com/webfonts/v1/webfonts';
/** La lista completa de Google Fonts pesa ~2 MB. */
const LIST_MAX_BYTES = 12 * 1024 * 1024;
export const FONT_DOWNLOAD_MAX_BYTES = 30 * 1024 * 1024;

export const FAMILY_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'&+-]{0,79}$/u;

/** «700italic» → { weight: 700, style: italic }; «regular» → 400; «italic» → 400 cursiva. */
export function parseVariant(v: string): FontVariant | null {
  if (v === 'regular') return { weight: 400, style: 'normal' };
  if (v === 'italic') return { weight: 400, style: 'italic' };
  const m = /^(\d{3,4})(italic)?$/.exec(v);
  return m ? { weight: Number(m[1]), style: m[2] ? 'italic' : 'normal' } : null;
}

export function variantName(v: FontVariant): string {
  return v.style === 'italic' ? (v.weight === 400 ? 'italic' : `${v.weight}italic`) : v.weight === 400 ? 'regular' : String(v.weight);
}

export function fontKey(ctx: SourceContext): string | null {
  return ctx.env.GOOGLE_FONTS_API_KEY?.trim() || null;
}

function familyHit(raw: unknown): FontFamilyHit | null {
  if (!isObject(raw)) return null;
  const family = str(raw.family, 80);
  if (!FAMILY_NAME.test(family)) return null;
  const list = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => str(x, 30)).slice(0, max) : []);
  const files: Record<string, string> = {};
  if (isObject(raw.files)) for (const [k, v] of Object.entries(raw.files)) if (parseVariant(k)) {
    const url = httpsUrl(v);
    if (url) files[k] = url;
  }
  return { family, category: str(raw.category, 30), variants: list(raw.variants), subsets: list(raw.subsets), files, lastModified: str(raw.lastModified, 20) };
}

/** La lista de familias, por popularidad (de la caché, o de la API). */
export async function googleFontList(ctx: SourceContext): Promise<FontFamilyHit[]> {
  const cached = await ctx.cache.get<FontFamilyHit[]>('fontlist', 'google');
  if (cached) return cached;
  const key = fontKey(ctx);
  if (!key) throw new Error('Para buscar fuentes hace falta la clave de la API de Google Fonts: ponela en la variable de entorno GOOGLE_FONTS_API_KEY (gratis, desde Google Cloud Console). Si ya sabés la familia, import_font anda sin clave.');
  const res = await ctx.http.get(`${LIST_URL}?${new URLSearchParams({ key, sort: 'popularity' })}`, { allow: ['www.googleapis.com'], headers: { accept: 'application/json' }, maxBytes: LIST_MAX_BYTES, timeoutMs: 30_000, accept: (t) => t.includes('json') });
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new Error('Google Fonts devolvió una respuesta que no es JSON.');
  }
  const items = isObject(body) && Array.isArray(body.items) ? body.items : [];
  const list = items.map(familyHit).filter((f): f is FontFamilyHit => f !== null);
  if (list.length === 0) throw new Error('Google Fonts devolvió una lista vacía.');
  await ctx.cache.set('fontlist', 'google', list);
  return list;
}

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface FontQuery {
  query: string;
  category?: string | undefined;
  /** Escritura que tiene que cubrir («latin» para castellano). */
  subset?: string | undefined;
  /** Que tenga la cursiva. */
  italic?: boolean | undefined;
  limit: number;
}

/** Filtra y ordena la lista: el nombre exacto primero, luego el que empieza igual, luego el que lo contiene; dentro de cada grupo, por popularidad. */
export function searchFontList(list: readonly FontFamilyHit[], q: FontQuery): FontFamilyHit[] {
  const words = fold(q.query).split(/\s+/).filter(Boolean);
  const scored: Array<{ f: FontFamilyHit; rank: number; order: number }> = [];
  list.forEach((f, order) => {
    if (q.category && f.category !== q.category) return;
    if (q.subset && !f.subsets.includes(q.subset)) return;
    if (q.italic && !f.variants.some((v) => v.endsWith('italic'))) return;
    const name = fold(f.family);
    let rank = 3;
    if (words.length > 0) {
      if (!words.every((w) => name.includes(w))) return;
      rank = name === words.join(' ') ? 0 : name.startsWith(words[0]!) ? 1 : 2;
    }
    scored.push({ f, rank, order });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, q.limit).map((s) => s.f);
}

/** Direcciones de los archivos de una familia para las variantes pedidas: de la lista (con clave) o de la hoja de estilos. */
export async function resolveFontFiles(family: string, wanted: readonly FontVariant[], ctx: SourceContext): Promise<{ family: string; category: string; variantsAvailable: string[]; subsets: string[]; files: Array<FontVariant & { url: string }> }> {
  if (!FAMILY_NAME.test(family)) throw new Error('El nombre de la familia no es válido.');
  if (fontKey(ctx) || (await ctx.cache.get('fontlist', 'google'))) {
    const hit = (await googleFontList(ctx)).find((f) => fold(f.family) === fold(family));
    if (!hit) throw new Error(`Google Fonts no tiene una familia llamada «${family}» (probá con search_fonts).`);
    const files: Array<FontVariant & { url: string }> = [];
    for (const w of wanted) {
      const url = hit.files[variantName(w)];
      if (!url) throw new Error(`«${hit.family}» no tiene la variante ${variantName(w)}. Tiene: ${hit.variants.join(', ')}.`);
      files.push({ ...w, url });
    }
    return { family: hit.family, category: hit.category, variantsAvailable: hit.variants, subsets: hit.subsets, files };
  }
  // Sin clave: la hoja de estilos de Google devuelve la dirección de cada variante (TrueType, si no se declara un navegador).
  const tuples = [...wanted].sort((a, b) => Number(a.style === 'italic') - Number(b.style === 'italic') || a.weight - b.weight).map((w) => `${w.style === 'italic' ? 1 : 0},${w.weight}`);
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${tuples.join(';')}`;
  let css: string;
  try {
    const res = await ctx.http.get(url, { allow: ['fonts.googleapis.com'], headers: { accept: 'text/css' }, maxBytes: 256 * 1024, timeoutMs: 20_000, accept: (t) => t.includes('css') });
    css = new TextDecoder().decode(res.body);
  } catch (err) {
    if (err instanceof Error && 'status' in err && (err as { status?: number }).status === 400) throw new Error(`Google Fonts no tiene «${family}» con esas variantes (peso y cursiva).`, { cause: err });
    throw err;
  }
  const files: Array<FontVariant & { url: string }> = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const style = /font-style:\s*(\w+)/.exec(block)?.[1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
    const src = httpsUrl(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/.exec(block)?.[1]);
    if (src && weight && (style === 'normal' || style === 'italic')) files.push({ weight, style, url: src });
  }
  const missing = wanted.filter((w) => !files.some((f) => f.weight === w.weight && f.style === w.style));
  if (missing.length > 0) throw new Error(`Google Fonts no devolvió: ${missing.map(variantName).join(', ')}.`);
  return { family, category: '', variantsAvailable: [], subsets: [], files: files.filter((f) => wanted.some((w) => w.weight === f.weight && w.style === f.style)) };
}

/** Baja un archivo de fuente (solo de Google). */
export async function downloadFont(url: string, ctx: SourceContext): Promise<Uint8Array> {
  const res = await ctx.http.get(url, { allow: FONT_HOSTS, maxBytes: FONT_DOWNLOAD_MAX_BYTES, timeoutMs: 60_000 });
  return res.body;
}
