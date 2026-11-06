/**
 * Entorno Node del motor: lee fuentes, feriados e imágenes integradas de la carpeta de recursos
 * (`public/` del repositorio, o la que indique `AGENDA_PUBLIC_DIR`) y abre agendas. Lo comparten la
 * línea de comandos, el servidor MCP y las pruebas, así los tres cargan los recursos de la misma manera.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { designCatalogue } from '../core/design/jsonSchema';
import { parseDesign, type Design } from '../core/design/schema';
import { AgendaDocument } from '../core/document';
import type { SvgRenderOptions } from '../core/render/svg';
import { facesForDesign, loadAssets, loadBuiltinFonts, loadFontManifest, loadHolidayData, toBase64, type FontManifest, type ResourceIO } from '../core/resources';
import { FontRegistry, type FontSpec } from '../core/text/fonts';
import { isRelativeAssetPath } from '../core/util/relpath';

/** Raíz del repositorio. Solo vale al correr desde el código fuente: en el paquete del servidor MCP no existe. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Variable de entorno que fija la carpeta con las fuentes, los feriados y las imágenes integradas.
 * La aplicación de escritorio la apunta a su carpeta `dist/` (dentro de su `.asar`); sin ella se usa
 * `public/` del repositorio.
 */
export const PUBLIC_DIR_ENV = 'AGENDA_PUBLIC_DIR';

/** La carpeta de recursos integrados. */
export function publicDir(): string {
  return resolve(process.env[PUBLIC_DIR_ENV] || join(ROOT, 'public'));
}

/**
 * Lectura de la carpeta de recursos. Además de lo que valida el esquema, una ruta que sale de la
 * carpeta se rechaza: un archivo de agenda no puede hacer leer otros archivos del disco.
 */
export const nodeIO: ResourceIO = {
  async read(path: string): Promise<Uint8Array> {
    const base = publicDir();
    const full = resolve(base, path);
    if (!full.startsWith(base + sep)) throw new Error(`Ruta fuera de la carpeta de recursos: ${path}`);
    return new Uint8Array(await readFile(full));
  },
};

/** Lo más grande que se lee de una imagen junto a la agenda. */
export const ASSET_FILE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Lectura de las imágenes guardadas junto a una agenda (`assets[].path`), relativas a `baseDir` (la
 * carpeta del `.agenda.json`). Se resuelven los enlaces simbólicos antes de comparar: ni «..» ni un
 * enlace llevan fuera de la carpeta.
 */
export function folderIO(baseDir: string): ResourceIO {
  return {
    async read(path: string): Promise<Uint8Array> {
      if (!isRelativeAssetPath(path)) throw new Error('la ruta tiene que ser relativa a la carpeta de la agenda, sin «..»');
      const base = await realpath(resolve(baseDir));
      const full = await realpath(resolve(base, path)).catch(() => {
        throw new Error('no está junto a la agenda');
      });
      if (!full.startsWith(base + sep)) throw new Error('lleva fuera de la carpeta de la agenda');
      const info = await stat(full);
      if (!info.isFile()) throw new Error('no es un archivo');
      if (info.size > ASSET_FILE_MAX_BYTES) throw new Error(`pesa más de ${ASSET_FILE_MAX_BYTES / 1024 / 1024} MB`);
      return new Uint8Array(await readFile(full));
    },
  };
}

/**
 * La misma agenda con los datos de sus imágenes por ruta adentro (`data`), para mandarla a donde no hay
 * carpeta (la aplicación abierta). Las que no se pueden leer quedan como estaban y se informan.
 */
export async function inlinePathAssets(design: Design, baseDir: string): Promise<{ design: Design; errors: string[] }> {
  const io = folderIO(baseDir);
  const errors: string[] = [];
  const assets = await Promise.all(
    design.assets.map(async (a) => {
      if (a.data || !a.path) return a;
      try {
        return { ...a, data: toBase64(await io.read(a.path)) };
      } catch (err) {
        errors.push(`No se pudo leer «${a.name}» (${a.path}): ${(err as Error).message}`);
        return a;
      }
    }),
  );
  return { design: { ...design, assets }, errors };
}

let manifest: Promise<FontManifest> | null = null;

/**
 * Agrega a un registro las caras integradas pedidas (todas, sin `wanted`). Sin registro, crea uno;
 * con uno existente solo lee las que faltan (el servidor MCP reutiliza el mismo entre agendas).
 */
export async function loadFonts(wanted?: FontSpec[], registry = new FontRegistry()): Promise<FontRegistry> {
  manifest ??= loadFontManifest(nodeIO);
  const errors = await loadBuiltinFonts(nodeIO, registry, await manifest, wanted);
  if (errors.length > 0) throw new Error(`No se pudieron cargar las fuentes:\n${errors.join('\n')}`);
  return registry;
}

export interface OpenedDocument {
  doc: AgendaDocument;
  /** Bytes de las imágenes de la agenda (los pide el PDF). */
  bytes: Map<string, Uint8Array>;
  /** Imágenes que no se pudieron leer. */
  errors: string[];
  /** Las imágenes como direcciones `data:` (para el SVG de una página). */
  assetHref: NonNullable<SvgRenderOptions['assetHref']>;
}

/**
 * Abre una agenda con sus recursos (en `fonts`, o en un registro nuevo con solo las caras que usa). Con
 * `baseDir` (la carpeta de su archivo) se leen también sus imágenes por ruta.
 */
export async function openNodeDocument(design: Design, fonts?: FontRegistry, opts: { baseDir?: string | undefined } = {}): Promise<OpenedDocument> {
  const files = opts.baseDir === undefined ? null : folderIO(opts.baseDir);
  const [registry, holidays, assets] = await Promise.all([loadFonts(facesForDesign(design), fonts), loadHolidayData(nodeIO, design.holidays.country), loadAssets(nodeIO, design, new Map(), files)]);
  const doc = new AgendaDocument(design, { fonts: registry, holidays, assets: assets.infos });
  const mime = new Map(design.assets.map((a) => [a.id, a.mime]));
  const assetHref: OpenedDocument['assetHref'] = (id, kind) => {
    const b = kind === 'image' ? assets.bytes.get(id) : undefined;
    return b ? `data:${mime.get(id) ?? 'application/octet-stream'};base64,${toBase64(b)}` : undefined;
  };
  return { doc, bytes: assets.bytes, errors: assets.errors, assetHref };
}

/** El catálogo de lo que se puede usar en una agenda, con las fuentes integradas. */
export async function fullCatalogue(): Promise<Record<string, unknown>> {
  manifest ??= loadFontManifest(nodeIO);
  const fonts = (await manifest).families.map((f) => ({
    family: f.family,
    category: f.category,
    // Las caras que existen (peso y estilo juntos: no todo peso tiene itálica).
    faces: f.faces.map((x) => ({ weight: x.weight, style: x.style })).sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style)),
  }));
  return { ...designCatalogue(), fonts };
}

/** Lee y valida un archivo `.agenda.json`. */
export async function readDesignFile(path: string): Promise<Design> {
  return parseDesign(JSON.parse(await readFile(resolve(path), 'utf8')));
}
