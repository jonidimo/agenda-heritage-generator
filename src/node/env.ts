/**
 * Entorno Node del motor: lee fuentes, feriados e imágenes integradas de la carpeta `public/` del
 * repositorio y abre agendas. Lo comparten la línea de comandos, el servidor MCP y las pruebas,
 * así los tres cargan los recursos de la misma manera.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { designCatalogue } from '../core/design/jsonSchema';
import { parseDesign, type Design } from '../core/design/schema';
import { AgendaDocument } from '../core/document';
import type { SvgRenderOptions } from '../core/render/svg';
import { facesForDesign, loadAssets, loadBuiltinFonts, loadFontManifest, loadHolidayData, toBase64, type FontManifest, type ResourceIO } from '../core/resources';
import { FontRegistry, type FontSpec } from '../core/text/fonts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'public');

/**
 * Lectura de la carpeta pública. Además de lo que valida el esquema, una ruta que sale de la
 * carpeta se rechaza: un archivo de agenda no puede hacer leer otros archivos del disco.
 */
export const nodeIO: ResourceIO = {
  async read(path: string): Promise<Uint8Array> {
    const full = resolve(PUBLIC, path);
    if (!full.startsWith(PUBLIC + sep)) throw new Error(`Ruta fuera de la carpeta de recursos: ${path}`);
    return new Uint8Array(await readFile(full));
  },
};

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

/** Abre una agenda con sus recursos (en `fonts`, o en un registro nuevo con solo las caras que usa). */
export async function openNodeDocument(design: Design, fonts?: FontRegistry): Promise<OpenedDocument> {
  const [registry, holidays, assets] = await Promise.all([loadFonts(facesForDesign(design), fonts), loadHolidayData(nodeIO, design.holidays.country), loadAssets(nodeIO, design)]);
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
