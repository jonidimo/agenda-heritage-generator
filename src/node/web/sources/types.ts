/**
 * Lo común a los servicios de imágenes (Openverse, Pixabay, Unsplash): qué se busca, qué se devuelve de
 * cada imagen y qué sabe hacer cada servicio.
 */
import type { Cache } from '../cache';
import type { TrustedHost } from '../guard';
import type { HttpClient } from '../http';

export type ProviderId = 'openverse' | 'pixabay' | 'unsplash';
export const PROVIDER_IDS: readonly ProviderId[] = ['openverse', 'pixabay', 'unsplash'];

/** Clase de licencia, para filtrar y para decidir qué crédito pide. */
export type LicenseKind = 'cc0' | 'pdm' | 'by' | 'by-sa' | 'by-nc' | 'cc-other' | 'unsplash' | 'pixabay' | 'unknown';

/** Licencias libres de verdad: dominio público y CC BY (CC BY-SA obliga a compartir igual lo derivado; las NC no valen para vender). */
export const FREE_LICENSES: readonly LicenseKind[] = ['cc0', 'pdm', 'by'];

export type LicenseFilter = 'any' | 'free' | 'cc0' | 'by';
export type Orientation = 'horizontal' | 'vertical' | 'square';

export interface SearchRequest {
  query: string;
  license: LicenseFilter;
  orientation?: Orientation | undefined;
  /** Ancho mínimo en píxeles. */
  minWidth?: number | undefined;
  /** Solo dibujos vectoriales (SVG), solo fotos, o cualquiera. */
  type: 'any' | 'photo' | 'vector';
  limit: number;
  page: number;
  /** Idioma de la búsqueda, donde el servicio lo admite (Pixabay). */
  lang?: string | undefined;
}

export interface ImageHit {
  /** `servicio:identificador`. */
  id: string;
  /** El servicio, `web` (un enlace directo) o `local` (un archivo de la carpeta de trabajo). */
  provider: ProviderId | 'web' | 'local';
  title: string;
  creator: string;
  creatorUrl: string | null;
  /** Nombre de la licencia («CC BY 4.0»). */
  license: string;
  licenseKind: LicenseKind;
  licenseUrl: string | null;
  /** La página de la imagen en el servicio. */
  landingUrl: string | null;
  /** Medidas en píxeles (0: no se sabe). */
  width: number;
  height: number;
  /** La miniatura (una imagen chica, para elegir). */
  thumbUrl: string | null;
  /** De dónde se baja la imagen. */
  fileUrl: string;
  /** `full`: el archivo completo; `preview`: solo la copia reducida que sirve el servicio (el original está en un dominio que no se visita). */
  fileKind: 'full' | 'preview';
  format: 'jpeg' | 'png' | 'svg' | 'other';
  /** El texto de atribución listo para imprimir. */
  attribution: string;
  /** Dirección a avisar cuando se descarga la imagen (Unsplash lo pide en sus condiciones). */
  downloadPing?: string | null;
}

export interface SourceContext {
  http: HttpClient;
  env: Readonly<Record<string, string | undefined>>;
  cache: Cache;
  /** Dominios de donde se bajan archivos de imagen (los fijos más los que agregó la persona). */
  fileHosts: readonly string[];
  /** Dominios que la persona declaró de confianza (`AGENDA_TRUSTED_HOSTS`). */
  trusted: readonly TrustedHost[];
}

export interface ImageSource {
  id: ProviderId;
  /** ¿Tiene lo que necesita para buscar (una clave de API, si la pide)? */
  ready(env: Readonly<Record<string, string | undefined>>): boolean;
  /** Qué hace falta para que esté lista (para decírselo a la persona). */
  needs: string;
  search(q: SearchRequest, ctx: SourceContext): Promise<{ hits: ImageHit[]; total: number | null }>;
  /** La ficha de una imagen por su identificador en el servicio. */
  fetchOne(rawId: string, ctx: SourceContext): Promise<ImageHit>;
  /** Aviso que algunos servicios piden cuando se descarga una imagen (Unsplash). No debe hacer fallar la importación. */
  downloaded?(hit: ImageHit, ctx: SourceContext): Promise<void>;
}

/** Texto: lo que viene de internet puede ser cualquier cosa; se recorta y se limpia de caracteres de control. */
export function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Un entero positivo razonable, o 0. */
export function int(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v) : 0;
}

/** Una dirección `https` o `null` (una `http` se sube a `https`; otra cosa no vale). */
export function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(s) || s.length > 1000) return null;
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Filtra por licencia (cuando el servicio no filtra por sí mismo). */
export function licenseAllowed(filter: LicenseFilter, kind: LicenseKind): boolean {
  switch (filter) {
    case 'any':
      return true;
    case 'free':
      return FREE_LICENSES.includes(kind);
    case 'cc0':
      return kind === 'cc0' || kind === 'pdm';
    case 'by':
      return kind === 'by';
  }
}
