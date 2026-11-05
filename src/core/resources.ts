/**
 * Carga de recursos independiente del entorno: la interfaz la usa con `fetch`
 * y la CLI con el disco. Rutas relativas a la carpeta pública
 * (fonts/…, holidays/…, watermarks/…).
 */
import { rasterInfo } from './assets/image';
import { importSvg } from './assets/svg';
import type { AssetRef, Design } from './design/schema';
import { themeFaces, resolveThemeFor } from './design/themes';
import type { HolidayCountryData, HolidayIndex } from './holidays';
import type { AssetInfo } from './layout/context';
import { faceKey, FontRegistry, parseFontSpec, type FontSpec } from './text/fonts';

export interface ResourceIO {
  read(path: string): Promise<Uint8Array>;
}

export interface FontManifest {
  families: Array<{
    family: string;
    category: string;
    designer: string;
    license: string;
    note: string;
    faces: Array<{ weight: number; style: 'normal' | 'italic'; file: string; bytes: number }>;
  }>;
}

/** Decodificación UTF-8 sin depender de TextDecoder (el núcleo no asume DOM ni Node). */
export function utf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  const chunk: number[] = [];
  const flush = (): void => {
    out += String.fromCharCode(...chunk);
    chunk.length = 0;
  };
  while (i < bytes.length) {
    const b = bytes[i++]!;
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++]! & 0x3f);
    else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++]! & 0x3f) << 6) | (bytes[i++]! & 0x3f);
    else cp = ((b & 0x07) << 18) | ((bytes[i++]! & 0x3f) << 12) | ((bytes[i++]! & 0x3f) << 6) | (bytes[i++]! & 0x3f);
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else chunk.push(cp);
    if (chunk.length > 8000) flush();
  }
  flush();
  return out;
}

export async function loadFontManifest(io: ResourceIO): Promise<FontManifest> {
  return JSON.parse(utf8(await io.read('fonts/fonts.json'))) as FontManifest;
}

/** Caras necesarias para un diseño: las del tema + Manrope (marcas y hojas auxiliares). */
export function facesForDesign(design: Design): FontSpec[] {
  const theme = resolveThemeFor(design.theme);
  const list = [
    ...themeFaces(theme),
    // Textos propios con su propia fuente.
    ...design.customBlocks.flatMap((cb) => parseFontSpec(cb.props.font) ?? []),
    { family: 'Manrope', weight: 400, style: 'normal' as const },
    { family: 'Manrope', weight: 700, style: 'normal' as const },
    { family: 'Manrope', weight: 800, style: 'normal' as const },
  ];
  const seen = new Set<string>();
  return list.filter((f) => (seen.has(faceKey(f)) ? false : (seen.add(faceKey(f)), true)));
}

/**
 * Carga en el registro las caras integradas pedidas (o todas). Para cada cara
 * pedida se carga la más cercana disponible de la familia.
 */
/** Carga caras integradas. Devuelve los errores (una cara que falla no impide cargar las demás). */
export async function loadBuiltinFonts(io: ResourceIO, registry: FontRegistry, manifest: FontManifest, wanted?: FontSpec[]): Promise<string[]> {
  const files: Array<{ family: string; weight: number; style: 'normal' | 'italic'; file: string }> = [];
  for (const fam of manifest.families) {
    for (const f of fam.faces) {
      if (!wanted) {
        files.push({ family: fam.family, weight: f.weight, style: f.style, file: f.file });
        continue;
      }
      const want = wanted.filter((w) => w.family === fam.family);
      if (want.length === 0) continue;
      // Para cada peso pedido elegimos la cara disponible más cercana del mismo estilo.
      for (const w of want) {
        const sameStyle = fam.faces.filter((x) => x.style === w.style);
        const pool = sameStyle.length > 0 ? sameStyle : fam.faces;
        const best = [...pool].sort((a, b) => Math.abs(a.weight - w.weight) - Math.abs(b.weight - w.weight))[0];
        if (best && best.file === f.file && !files.some((x) => x.file === f.file)) files.push({ family: fam.family, weight: f.weight, style: f.style, file: f.file });
      }
    }
  }
  const results = await Promise.allSettled(
    files.map(async (f) => {
      if (registry.has(f)) return;
      const bytes = await io.read(`fonts/${f.file}`);
      registry.register(bytes, { family: f.family, weight: f.weight, style: f.style, source: 'builtin', file: f.file });
    }),
  );
  return results.flatMap((r, i) => (r.status === 'rejected' ? [`${files[i]!.family} ${files[i]!.weight}: ${(r.reason as Error)?.message ?? r.reason}`] : []));
}

export async function loadHolidayIndex(io: ResourceIO): Promise<HolidayIndex | null> {
  try {
    return JSON.parse(utf8(await io.read('holidays/index.json'))) as HolidayIndex;
  } catch {
    return null;
  }
}

export async function loadHolidayData(io: ResourceIO, country: string | null): Promise<HolidayCountryData | null> {
  if (!country) return null;
  try {
    return JSON.parse(utf8(await io.read(`holidays/${country}.json`))) as HolidayCountryData;
  } catch {
    return null;
  }
}

/** Información de un recurso a partir de sus bytes (tipo, proporción, vector importado, páginas). */
export async function assetInfoFromBytes(ref: AssetRef, bytes: Uint8Array): Promise<AssetInfo> {
  if (ref.kind === 'vector' || ref.mime === 'image/svg+xml') {
    const vector = importSvg(utf8(bytes));
    return { id: ref.id, kind: 'vector', aspect: vector.viewBox[2] / vector.viewBox[3], width: vector.widthMm, height: vector.heightMm, vector };
  }
  if (ref.kind === 'pdf' || ref.mime === 'application/pdf') {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const first = pdf.getPage(0);
    const { width, height } = first.getSize();
    return { id: ref.id, kind: 'pdf', aspect: width / height, width: (width * 25.4) / 72, height: (height * 25.4) / 72, pages: pdf.getPageCount() };
  }
  const info = rasterInfo(bytes);
  if (!info) throw new Error(`Formato de imagen no soportado en «${ref.name}» (usá PNG, JPG, SVG o PDF).`);
  return { id: ref.id, kind: 'raster', aspect: info.width / info.height, width: info.width, height: info.height, pxWidth: info.width, pxHeight: info.height };
}

/** Decodifica base64 (para recursos incrustados en un .agenda.json). */
export function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < table.length; i++) lookup[table.charCodeAt(i)] = i;
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((len * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)]!;
    const b = lookup[clean.charCodeAt(i + 1)]!;
    const c = lookup[clean.charCodeAt(i + 2)]!;
    const d = lookup[clean.charCodeAt(i + 3)]!;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += table[(n >> 18) & 63]! + table[(n >> 12) & 63]! + table[(n >> 6) & 63]! + table[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += `${table[(n >> 18) & 63]}${table[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += `${table[(n >> 18) & 63]}${table[(n >> 12) & 63]}${table[(n >> 6) & 63]}=`;
  }
  return out;
}

export interface LoadedAssets {
  infos: Map<string, AssetInfo>;
  bytes: Map<string, Uint8Array>;
  errors: string[];
}

/**
 * Carga los recursos del diseño: integrados (desde la carpeta pública),
 * incrustados en base64 o provistos por el llamador (p. ej. IndexedDB).
 */
export async function loadAssets(io: ResourceIO, design: Design, provided: ReadonlyMap<string, Uint8Array> = new Map()): Promise<LoadedAssets> {
  const infos = new Map<string, AssetInfo>();
  const bytes = new Map<string, Uint8Array>();
  const errors: string[] = [];
  await Promise.all(
    design.assets.map(async (ref) => {
      try {
        let b = provided.get(ref.id);
        if (!b && ref.data) b = fromBase64(ref.data);
        if (!b && ref.builtin) b = await io.read(ref.builtin);
        if (!b) {
          errors.push(`Falta el recurso «${ref.name}».`);
          return;
        }
        bytes.set(ref.id, b);
        infos.set(ref.id, await assetInfoFromBytes(ref, b));
      } catch (err) {
        errors.push(`No se pudo leer «${ref.name}»: ${(err as Error).message}`);
      }
    }),
  );
  return { infos, bytes, errors };
}
