/**
 * Servidor MCP de Agenda Heritage Studio: le da a un modelo de lenguaje (Claude Desktop, Claude
 * Code u otro cliente MCP) las herramientas para diseñar agendas, plantillas de página y temas con
 * el mismo motor que la aplicación: crear una agenda, cambiarla con JSON Patch, revisarla, ver cómo
 * queda cada página, y exportar el PDF o el tema.
 *
 * Los archivos se leen y escriben solo dentro de la carpeta de trabajo (ver `Workspace`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { dirname, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { createDesign, TEMPLATES, type TemplateId } from '../core/design/defaults';
import { designJsonSchema, schemaPart } from '../core/design/jsonSchema';
import { PAPER_PRESETS, PaperPresetZ, SCREEN_PRESETS, USER_FONTS_MAX, type Design } from '../core/design/schema';
import { changePaper } from '../core/document/paper';
import { themeFile, themeFromDesign } from '../core/design/themeFile';
import { EXPORT_KINDS } from '../core/document';
import { documentSummary } from '../core/document/summary';
import type { LiveDesign, LiveFontAdded, LiveInfo, LiveLibraryItem, LiveOpened, LivePatchResult, LiveReveal } from '../core/live/protocol';
import { newLayoutWarnings, type LayoutFeedback } from '../core/document/feedback';
import { fixesFor } from '../core/document/fixes';
import { listPages, pageRenderInfo } from '../core/document/inspect';
import { pageToSvg } from '../core/render/svg';
import { toBase64 } from '../core/resources';
import { detectFaceMeta, type FontRegistry } from '../core/text/fonts';
import { openFont, type FKFont } from '../core/text/fontkit';
import { punctuationOf } from '../core/text/punctuation';
import { newId } from '../core/util/hash';
import { applyJsonPatch, type JsonPatchOp } from '../core/util/jsonPatch';
import { JsonPatchOpZ } from '../core/util/jsonPatchSchema';
import { isRelativeAssetPath } from '../core/util/relpath';
import { isNewerVersion } from '../core/util/version';
import { checkDesignData, checkDesignJson, type CheckResult } from '../node/check';
import { folderIO, fullCatalogue, loadFonts, openNodeDocument } from '../node/env';
import type { Rasterizer } from './resvg';
import { AppLink } from './live';
import { Workspace } from './workspace';

const DESIGN_EXT = ['.agenda.json'] as const;
/** Se leen agendas y plantillas en JSON (`.agenda.json` u otro `.json`). */
const JSON_EXT = ['.json'] as const;

/**
 * JSON.parse sin el fragmento del archivo que el motor de JavaScript incluye en el mensaje: un
 * archivo que no es JSON no se muestra (solo dónde falla).
 */
function parseJson(body: string, path: string): unknown {
  try {
    return JSON.parse(body);
  } catch (err) {
    const where = /position \d+(?: \(line \d+ column \d+\))?/.exec((err as Error).message)?.[0];
    throw new Error(`«${path}» no es JSON válido${where ? ` (${where})` : ''}.`, { cause: err });
  }
}

const INSTRUCTIONS = `Diseño de agendas imprimibles (Agenda Heritage Studio). Una agenda es un archivo JSON (.agenda.json).
Si no conocés el formato, empezá por get_guide (la guía completa, o una sección con «section»; también está en el recurso agenda://guide).
Flujo: create_design (desde una plantilla) → update_design (JSON Patch) → check_design hasta que no queden problemas → render_page para ver páginas → export_pdf / export_theme.
Referencia: list_catalogue (secciones con sus opciones, temas, ornamentos, variables de texto) y get_schema (con «part» para leer solo una parte, p. ej. "theme.tokens.lines").
Con la aplicación de escritorio abierta: app_status dice qué agenda tiene; con «app: true» check_design, render_page, update_design y las demás trabajan sobre ESA agenda (los cambios son un paso que la persona puede deshacer; si ella la tocó mientras tanto, volvé a leerla), app_reveal le muestra una página y app_library/app_open cambian de agenda.
Claves: un elemento propio (customBlocks) con pageKey null vale para todas las páginas de su pageType, con una pageKey solo para esa página; paper: true le pone fondo blanco que tapa los renglones de abajo. «/locale» traduce todo lo que la agenda genera en una operación. Las fuentes por tipo de texto van en /theme/tokens/fonts/<rol>; una fuente propia se agrega con add_font (viaja en userFonts) y lo que no tiene sale de /theme/tokens/fallbacks. Las imágenes y SVG van en assets (kind raster, vector, pdf) o como "icon:<id>". Cada aviso de check_design trae «fix»: cómo corregirlo.
Medidas en milímetros; colores #rrggbb; las rutas de archivo son relativas a la carpeta de trabajo.`;

/** Una fuente que se puede incrustar: el archivo pesa como mucho esto (en base64 entra en `userFonts`). */
const MAX_FONT_BYTES = 20 * 1024 * 1024;
const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'] as const;
const TEXT_ROLES = ['display', 'title', 'label', 'labelStrong', 'heading', 'body', 'number', 'quote'] as const;

/** Las secciones de una guía en Markdown (cada «## »), con su título. */
export function guideSections(markdown: string): Array<{ title: string; text: string }> {
  const out: Array<{ title: string; text: string }> = [];
  for (const block of markdown.split(/^(?=## )/m)) {
    const m = /^## (.+)$/m.exec(block);
    if (m && block.startsWith('## ')) out.push({ title: m[1]!.trim(), text: block.trimEnd() });
  }
  return out;
}

/** Para buscar sin importar mayúsculas ni tildes. */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Las operaciones que ponen `spec` como fuente de esos tipos de texto en una agenda (todavía JSON):
 * crean lo que falte de /theme/tokens/fonts.
 */
function fontRoleOps(raw: unknown, roles: readonly string[], spec: { family: string; weight: number; style: 'normal' | 'italic' }): JsonPatchOp[] {
  if (roles.length === 0) return [];
  const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const theme = obj(obj(raw)?.theme);
  const tokens = obj(theme?.tokens);
  const fonts = obj(tokens?.fonts);
  const values = Object.fromEntries(roles.map((r) => [r, spec]));
  if (!theme) return [{ op: 'add', path: '/theme', value: { tokens: { fonts: values } } }];
  if (!tokens) return [{ op: 'add', path: '/theme/tokens', value: { fonts: values } }];
  if (!fonts) return [{ op: 'add', path: '/theme/tokens/fonts', value: values }];
  return roles.map((r) => ({ op: 'add', path: `/theme/tokens/fonts/${r}`, value: spec }));
}

/** Los tamaños de hoja que se pueden pedir, con su medida (para el modelo). */
const PAPER_HELP = Object.entries(PAPER_PRESETS)
  .map(([id, p]) => (id === 'CUSTOM' ? 'CUSTOM: width y height a elección' : `${id}: ${p.w} × ${p.h} mm`))
  .join('; ');

/** Los avisos que un cambio produjo, con cómo se corrige cada código (una vez por código). */
function layoutResult(layout: LayoutFeedback): { warnings: LayoutFeedback['notes']; fixes?: Record<string, string>; omittedWarnings?: number } {
  const fixes = fixesFor(layout.notes.map((n) => n.code));
  return { warnings: layout.notes, ...(Object.keys(fixes).length > 0 ? { fixes } : {}), ...(layout.omitted > 0 ? { omittedWarnings: layout.omitted } : {}) };
}

type ToolResult = { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean };

const text = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

/** Una agenda: por archivo (`path`) o escrita en el pedido (`design`). */
const source = {
  path: z.string().optional().describe('Archivo que se lee (.agenda.json), relativo a la carpeta de trabajo'),
  design: z.record(z.string(), z.unknown()).optional().describe('La agenda escrita directamente (en lugar de path)'),
  app: z.boolean().optional().describe('La agenda que está abierta ahora en la aplicación de escritorio (en lugar de path o design). Ver app_status'),
};

const patchOp = JsonPatchOpZ;

/** Lo que cambia según desde dónde corre el servidor (el código fuente o el paquete de la aplicación de escritorio). */
export interface ServerResources {
  version: string;
  /** Las guías para modelos de lenguaje (recursos `agenda://guide`), en inglés y en castellano. */
  guides: { en: () => Promise<string>; es: () => Promise<string> };
  /** SVG → PNG para `render_page`. */
  rasterize: Rasterizer;
}

export interface ServerOptions extends ServerResources {
  /** Carpeta de trabajo (los archivos se leen y escriben solo adentro). */
  root: string;
  /** El enlace con la aplicación de escritorio abierta (en las pruebas, uno falso). */
  appLink?: AppLink;
}

/** Lo que acepta la aplicación en un cambio (ver el protocolo del enlace en vivo). */
const MAX_APP_PATCH_OPS = 500;
/** Bytes de imágenes que se mandan como mucho en un cambio a la aplicación (cabe holgado en un mensaje del enlace). */
const APP_PATCH_IMAGE_BYTES = 32 * 1024 * 1024;

/**
 * La agenda (todavía JSON sin revisar) con sus imágenes por ruta reescritas de la carpeta `from` a `to`,
 * o los problemas si alguna quedaría fuera de la carpeta nueva.
 */
function relocatePaths(raw: unknown, from: string, to: string): { ok: true; design: unknown } | { ok: false; issues: Array<{ path: string; message: string }> } {
  const assets = (raw as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets) || from === to) return { ok: true, design: raw };
  const issues: Array<{ path: string; message: string }> = [];
  const moved = assets.map((a: unknown, i) => {
    if (!a || typeof a !== 'object' || typeof (a as { path?: unknown }).path !== 'string') return a;
    const rel = relative(to, resolve(from, (a as { path: string }).path)).split(sep).join('/');
    if (!isRelativeAssetPath(rel)) {
      issues.push({ path: `/assets/${i}/path`, message: 'La imagen quedaría fuera de la carpeta del archivo nuevo: escribilo en la misma carpeta o en una que la contenga.' });
      return a;
    }
    return { ...a, path: rel };
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, design: { ...(raw as object), assets: moved } };
}

export function createServer(opts: ServerOptions): McpServer {
  const ws = new Workspace(opts.root);
  const server = new McpServer({ name: 'agenda-heritage-studio', version: opts.version }, { instructions: INSTRUCTIONS });
  // El enlace con la aplicación abierta se conecta al primer uso; al cerrarse el servidor se suelta.
  const appLink = opts.appLink ?? new AppLink();
  const closed = server.server.onclose;
  server.server.onclose = () => {
    closed?.();
    appLink.close();
  };

  // Un solo registro con todas las fuentes integradas para todas las agendas (se carga al primer uso).
  let fonts: Promise<FontRegistry> | null = null;
  const sharedFonts = (): Promise<FontRegistry> => {
    fonts ??= loadFonts().catch((err: unknown) => {
      fonts = null;
      throw err;
    });
    return fonts;
  };

  /**
   * Lee y revisa la agenda pedida; si no abre, el error lista los problemas. `baseDir` es la carpeta de
   * donde salen sus imágenes por ruta: la del archivo, o la de trabajo para una agenda escrita en el
   * pedido (la de la aplicación ya trae sus imágenes adentro).
   */
  async function load(input: { path?: string | undefined; design?: Record<string, unknown> | undefined; app?: boolean | undefined }): Promise<{ check: CheckResult; design: Design; revision?: number; baseDir?: string }> {
    const given = [input.path !== undefined, input.design !== undefined, input.app === true].filter(Boolean).length;
    if (given !== 1) throw new Error('Indicá la agenda con «path» (un archivo), con «design» (el JSON) o con «app: true» (la abierta en la aplicación): una sola.');
    let raw: unknown = input.design;
    let revision: number | undefined;
    if (input.app === true) {
      // Con las imágenes propias adentro, para que las páginas se vean como en la aplicación.
      const got = await appLink.request<LiveDesign>('design.get', { assets: true, fonts: true });
      raw = got.design;
      revision = got.revision;
    }
    let baseDir: string | undefined = input.design !== undefined ? ws.root : undefined;
    if (input.path !== undefined) {
      const file = await ws.read(input.path, JSON_EXT);
      raw = parseJson(file.text, input.path);
      baseDir = dirname(file.full);
    }
    // Una plantilla guardada desde la aplicación trae la agenda adentro.
    const wrapped = raw as { kind?: unknown; design?: unknown } | null;
    if (wrapped?.kind === 'heritage-template' && wrapped.design) raw = wrapped.design;
    const check = checkDesignData(raw);
    if (!check.design) throw new Error(`La agenda no se puede abrir:\n${check.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`);
    return { check, design: check.design, ...(revision !== undefined ? { revision } : {}), ...(baseDir !== undefined ? { baseDir } : {}) };
  }

  const open = async (design: Design, baseDir?: string) => openNodeDocument(design, await sharedFonts(), { baseDir });

  /** Un archivo escrito por este servidor dice qué versión lo escribió; si ya lo había escrito una más nueva, queda esa (sus claves siguen ahí). */
  const stamp = <T,>(design: T): T => {
    if (typeof design !== 'object' || design === null || Array.isArray(design)) return design;
    const before = (design as { writtenBy?: unknown }).writtenBy;
    const keep = typeof before === 'string' && isNewerVersion(before, opts.version);
    return { ...design, writtenBy: keep ? before : opts.version };
  };

  /* ---------- Referencia ---------- */

  server.registerTool(
    'list_catalogue',
    {
      title: 'Catálogo',
      description: 'Lo que se puede usar en una agenda: tipos de sección con sus opciones y valores posibles, temas, plantillas, fuentes integradas (familias, pesos y estilos), ornamentos (builtin:<id>), usos y dibujos de línea, armonías de color, tipos de elemento propio, tipos de página y variables de texto.',
      annotations: { readOnlyHint: true },
    },
    async () => text(await fullCatalogue()),
  );

  server.registerTool(
    'get_schema',
    {
      title: 'Esquema JSON',
      description:
        'Esquema JSON (draft 2020-12) del archivo .agenda.json. Con «part» devuelve solo esa parte, con las referencias resueltas: p. ej. "calendar", "theme", "theme.tokens.lines", "sections", "customBlocks", "pageTemplates", "$defs.sectionItem". Sin «part», el esquema entero (unos 40 KB).',
      inputSchema: { part: z.string().optional().describe('Parte del esquema, con puntos') },
      annotations: { readOnlyHint: true },
    },
    async ({ part }) => {
      const schema = designJsonSchema();
      if (!part) return text(JSON.stringify(schema));
      const found = schemaPart(schema, part);
      if (!found) throw new Error(`No hay «${part}» en el esquema. Partes de primer nivel: ${Object.keys(schema.properties as object).join(', ')}.`);
      return text(found);
    },
  );

  server.registerTool(
    'get_guide',
    {
      title: 'Guía',
      description:
        'La guía para trabajar con agendas: el formato, cómo se ubican los elementos (pageType y pageKey), fuentes propias, recursos, traducción y feriados, y cómo se corrige cada aviso. Sin «section», la guía entera; con «section», solo esa parte (busca en los títulos). Es la misma que el recurso agenda://guide, para los clientes que no leen recursos.',
      inputSchema: {
        lang: z.enum(['es', 'en']).optional().describe('es (castellano, por defecto) o en'),
        section: z.string().max(80).optional().describe('Parte de un título de sección, p. ej. "fuentes", "avisos", "alcance"'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ lang, section }) => {
      const markdown = await (lang === 'en' ? opts.guides.en() : opts.guides.es());
      if (!section) return text(markdown);
      const sections = guideSections(markdown);
      const found = sections.filter((x) => fold(x.title).includes(fold(section)));
      if (found.length === 0) throw new Error(`No hay una sección con «${section}». Secciones: ${sections.map((x) => x.title).join(' · ')}`);
      return text(found.map((x) => x.text).join('\n\n'));
    },
  );

  /* ---------- Agendas ---------- */

  server.registerTool(
    'create_design',
    {
      title: 'Crear agenda',
      description: 'Crea una agenda desde una plantilla. Con «out» la guarda en un archivo .agenda.json y devuelve su resumen; con «app: true» la abre en la aplicación de escritorio (como una agenda nueva de su biblioteca: la que estaba abierta queda guardada); sin ninguna, devuelve el JSON.',
      inputSchema: {
        template: z.enum(TEMPLATES.map((t) => t.id) as [TemplateId, ...TemplateId[]]).describe(TEMPLATES.map((t) => `${t.id}: ${t.description}`).join(' | ')),
        year: z.number().int().min(1900).max(2200).optional(),
        locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).optional().describe('Idioma y país, p. ej. es-AR, en-US, pt-BR, it-IT'),
        country: z.string().regex(/^[A-Z]{2}$/).nullable().optional().describe('Feriados de este país (código ISO); null: sin feriados. Por defecto, el del idioma.'),
        name: z.string().max(120).optional().describe('Nombre de la persona (portada, dedicatoria)'),
        paper: PaperPresetZ.optional().describe(`Tamaño de la hoja desde el principio (cambiarlo después mueve lo hecho a mano). ${PAPER_HELP}`),
        width: z.number().min(50).max(1000).optional().describe('Con paper "CUSTOM": ancho de la hoja en mm'),
        height: z.number().min(50).max(1500).optional().describe('Con paper "CUSTOM": alto de la hoja en mm'),
        purpose: z.enum(['print', 'screen']).optional().describe('print: se imprime y encuaderna; screen: para leer en una tableta (una página por hoja, sin costura ni recortes). Un tamaño de pantalla (TABLET_*, IPAD_*) ya implica screen.'),
        binding: z.enum(['sewn', 'saddle', 'cut-stack', 'single']).optional().describe('Para imprimir: sewn/saddle/cut-stack ponen dos páginas por cara (la página es media hoja); single, una página por hoja'),
        out: z.string().optional().describe('Archivo que se escribe (.agenda.json), relativo a la carpeta de trabajo'),
        overwrite: z.boolean().optional(),
        app: z.boolean().optional().describe('Abrirla en la aplicación de escritorio en lugar de guardarla en un archivo'),
      },
    },
    async ({ template, year, locale, country, name, paper, width, height, purpose, binding, out, overwrite, app }) => {
      if ((width !== undefined || height !== undefined) && paper !== 'CUSTOM') throw new Error('«width» y «height» van solo con paper "CUSTOM".');
      if (paper === 'CUSTOM' && (width === undefined || height === undefined)) throw new Error('Con paper "CUSTOM" hacen falta «width» y «height» (mm).');
      if (paper && SCREEN_PRESETS.includes(paper) && (purpose === 'print' || (binding && binding !== 'single'))) throw new Error(`«${paper}» es una pantalla: va con purpose "screen" (una página por hoja), sin otra encuadernación.`);
      if (purpose === 'screen' && binding && binding !== 'single') throw new Error('Para leer en pantalla la encuadernación es "single" (una página por hoja).');
      const created = createDesign(template, { ...(year ? { year } : {}), ...(locale ? { locale } : {}), ...(country !== undefined ? { country } : {}), ...(name ? { name } : {}) });
      const design =
        paper || purpose || binding || width || height
          ? changePaper(created, {
              paper: { preset: paper ?? created.paper.preset, width: width ?? created.paper.width, height: height ?? created.paper.height },
              ...(purpose ? { target: purpose } : {}),
              ...(binding ? { method: binding } : {}),
              rescale: false,
            })
          : created;
      if (app === true) {
        if (out) throw new Error('Indicá «out» (un archivo) o «app» (abrirla en la aplicación), no las dos.');
        const opened = await appLink.request<LiveOpened>('design.load', { design });
        const { doc, errors } = await open(design);
        return text({ opened, summary: documentSummary(doc, errors) });
      }
      if (!out) return text(design);
      const full = await ws.write(out, `${JSON.stringify(stamp(design), null, 2)}\n`, { extensions: DESIGN_EXT, overwrite: overwrite === true });
      const { doc, errors } = await open(design);
      return text({ path: ws.show(full), summary: documentSummary(doc, errors) });
    },
  );

  server.registerTool(
    'update_design',
    {
      title: 'Cambiar agenda',
      description:
        'Cambia una agenda con operaciones JSON Patch (RFC 6902: add, remove, replace, move, copy, test; rutas como "/calendar/weekStart" o "/sections/-"): un archivo .agenda.json («path») o la agenda abierta en la aplicación de escritorio («app: true»; el cambio es un solo paso que la persona puede deshacer y se rechaza si ella la modificó mientras tanto: volvé a leerla). Se aplica todo o nada; si después la agenda no abre, no se toca. Devuelve los problemas que quedan y los avisos de maquetación que el cambio produjo («warnings»: texto que no entra, elementos que salen de la página o se superponen, con su página): revisalos antes de seguir. Con «out», el resultado se escribe en otro archivo y «path» queda como estaba.',
      inputSchema: {
        path: z.string().optional().describe('Archivo que se lee (.agenda.json), relativo a la carpeta de trabajo; sin «out», el cambio se guarda en él'),
        out: z.string().optional().describe('Archivo que se escribe (.agenda.json) con el resultado, en lugar de pisar «path»'),
        overwrite: z.boolean().optional().describe('Con «out»: reemplazar el archivo si ya existe'),
        app: z.boolean().optional().describe('La agenda abierta en la aplicación de escritorio'),
        patch: z.array(patchOp).min(1).max(500),
      },
    },
    async ({ path, out, overwrite, app, patch }) => {
      if ((path === undefined) === (app !== true)) throw new Error('Indicá «path» (un archivo) o «app: true» (la agenda abierta en la aplicación), una de las dos.');
      if (app === true) {
        if (out !== undefined) throw new Error('«out» va con «path»: la agenda abierta en la aplicación se cambia en la aplicación.');
        return updateInApp(patch as JsonPatchOp[]);
      }
      const { full, text: body } = await ws.read(path!, DESIGN_EXT);
      const next = applyJsonPatch(parseJson(body, path!), patch as JsonPatchOp[]);
      const check = checkDesignData(next);
      if (!check.design) return { ...text({ written: false, issues: check.issues }), isError: true };
      const target = out === undefined ? full : out;
      // En otra carpeta, las imágenes por ruta se reescriben para seguir apuntando al mismo archivo.
      const moved = out === undefined ? { ok: true as const, design: next } : relocatePaths(next, dirname(full), dirname(resolve(ws.root, out)));
      if (!moved.ok) return { ...text({ written: false, issues: moved.issues }), isError: true };
      const written = await ws.write(target, `${JSON.stringify(stamp(moved.design), null, 2)}\n`, { extensions: DESIGN_EXT, overwrite: out === undefined || overwrite === true });
      // Los avisos de maquetación que el cambio produjo (texto que no entra, fuera de la página…).
      const layout = await newLayoutWarnings((d) => open(d, dirname(written)), checkDesignJson(body).design, checkDesignData(moved.design).design ?? check.design);
      return text({ written: true, path: ws.show(written), issues: check.issues, ...layoutResult(layout) });
    },
  );

  /**
   * El cambio sobre la agenda abierta: se lee con su revisión, se aplica y se revisa acá (así el modelo ve
   * los problemas y los avisos de maquetación), y a la aplicación solo se le manda el parche con esa revisión.
   * Si la persona tocó la agenda mientras tanto, la aplicación lo rechaza en lugar de pisar su cambio.
   */
  async function updateInApp(patch: JsonPatchOp[]): Promise<ToolResult> {
    // Con las imágenes y las fuentes propias: los avisos se miden como se ve en la aplicación.
    const got = await appLink.request<LiveDesign>('design.get', { assets: true, fonts: true });
    const before = checkDesignData(got.design).design;
    const next = applyJsonPatch(got.design, patch);
    const check = checkDesignData(next);
    if (!check.design) return { ...text({ applied: false, issues: check.issues }), isError: true };
    // La aplicación no tiene carpeta: las imágenes por ruta (relativas a la de trabajo) le llegan con sus datos.
    const { ops: withData, errors: assetErrors } = await pathAssetData(check.design, MAX_APP_PATCH_OPS - patch.length);
    const sent = await appLink.request<LivePatchResult>('design.patch', { patch: [...patch, ...withData], baseRevision: got.revision });
    if (!sent.applied) return { ...text({ applied: false, issues: sent.issues }), isError: true };
    const layout = await newLayoutWarnings((d) => open(d, ws.root), before, check.design);
    return text({
      applied: true,
      revision: sent.revision,
      issues: check.issues,
      ...layoutResult(layout),
      ...(assetErrors.length > 0 ? { assetErrors } : {}),
    });
  }

  /** Operaciones que agregan los datos de las imágenes por ruta de una agenda (leídas de la carpeta de trabajo). */
  async function pathAssetData(design: Design, room: number): Promise<{ ops: JsonPatchOp[]; errors: string[] }> {
    const io = folderIO(ws.root);
    const ops: JsonPatchOp[] = [];
    const errors: string[] = [];
    let bytes = 0;
    for (const [i, a] of design.assets.entries()) {
      if (a.data || !a.path) continue;
      // El parche a la aplicación tiene topes (operaciones y tamaño): lo que no entra se informa y no se manda.
      if (ops.length >= room) {
        errors.push(`«${a.name}» (${a.path}) no entra en este cambio: mandá menos operaciones o agregá la imagen en otro cambio.`);
        continue;
      }
      try {
        const data = await io.read(a.path);
        if (bytes + data.length > APP_PATCH_IMAGE_BYTES) {
          errors.push(`«${a.name}» (${a.path}) es demasiado grande para mandarla a la aplicación en este cambio.`);
          continue;
        }
        bytes += data.length;
        ops.push({ op: 'add', path: `/assets/${i}/data`, value: toBase64(data) });
      } catch (err) {
        errors.push(`No se pudo leer «${a.name}» (${a.path}): ${(err as Error).message}`);
      }
    }
    return { ops, errors };
  }

  /* ---------- Fuentes propias ---------- */

  server.registerTool(
    'add_font',
    {
      title: 'Agregar una fuente',
      description:
        'Agrega una fuente propia (un archivo .ttf, .otf, .woff o .woff2 de la carpeta de trabajo) a una agenda: en un archivo .agenda.json («path», viaja adentro en userFonts) o en la aplicación de escritorio abierta («app: true», queda en la aplicación para todas las agendas). Familia, peso y estilo salen de la fuente salvo que los indiques. Con «roles», la pone en esos tipos de texto (/theme/tokens/fonts/<rol>). Devuelve cuántos glifos tiene y qué puntuación le falta: una fuente sin coma ni paréntesis (de números o de camiseta) va mejor en display y number; lo que no tiene sale de /theme/tokens/fallbacks.',
      inputSchema: {
        font: z.string().describe('El archivo de la fuente, relativo a la carpeta de trabajo'),
        path: z.string().optional().describe('La agenda (.agenda.json) que se lee y donde queda incrustada la fuente, relativa a la carpeta de trabajo'),
        app: z.boolean().optional().describe('La aplicación de escritorio abierta, en lugar de un archivo'),
        family: z.string().trim().min(1).max(80).optional().describe('Nombre de la familia (por defecto, el de la fuente)'),
        weight: z.number().int().min(1).max(1000).optional(),
        style: z.enum(['normal', 'italic']).optional(),
        roles: z.array(z.enum(TEXT_ROLES)).max(TEXT_ROLES.length).optional().describe(`Tipos de texto que pasan a usarla: ${TEXT_ROLES.join(', ')}`),
      },
    },
    async ({ font, path, app, family, weight, style, roles }) => {
      if ((path === undefined) === (app !== true)) throw new Error('Indicá dónde va la fuente: «path» (una agenda .agenda.json) o «app: true» (la aplicación abierta), una de las dos.');
      const { bytes } = await ws.readBytes(font, FONT_EXT, MAX_FONT_BYTES);
      let opened: FKFont;
      try {
        opened = openFont(bytes);
      } catch (err) {
        throw new Error(`«${font}» no es una fuente que se pueda leer: ${(err as Error).message}`, { cause: err });
      }
      const detected = detectFaceMeta(opened);
      const spec = { family: family ?? detected.family, weight: weight ?? detected.weight, style: style ?? detected.style };
      // Lo que le falta, medido con las integradas como reserva (las de la agenda pueden ser otras: check_design lo dice).
      const probe = (await sharedFonts()).fork();
      const face = probe.register(bytes, { ...spec, source: 'user', file: 'probe' });
      const info = { ...spec, glyphs: opened.numGlyphs, punctuation: punctuationOf(probe, face, ['Manrope']) };
      const roleList = roles ?? [];
      if (app === true) {
        const added = await appLink.request<LiveFontAdded>('fonts.add', { spec, data: toBase64(bytes) });
        if (roleList.length === 0) return text({ added: true, font: { ...info, id: added.id } });
        const got = await appLink.request<LiveDesign>('design.get', {});
        const result = await updateInApp(fontRoleOps(got.design, roleList, spec));
        return { ...result, content: [{ type: 'text', text: JSON.stringify({ font: { ...info, id: added.id }, roles: roleList }, null, 2) }, ...result.content] };
      }
      const { full, text: body } = await ws.read(path!, DESIGN_EXT);
      const raw = parseJson(body, path!);
      const list = (raw as { userFonts?: unknown } | null)?.userFonts;
      const fonts = Array.isArray(list) ? list : [];
      // La misma familia, peso y estilo se reemplaza (con su id): no quedan dos fuentes iguales.
      const same = fonts.findIndex((f: unknown) => {
        const s = (f as { spec?: { family?: unknown; weight?: unknown; style?: unknown } } | null)?.spec;
        return s?.family === spec.family && (s.weight ?? 400) === spec.weight && (s.style ?? 'normal') === spec.style;
      });
      const id = same >= 0 ? String((fonts[same] as { id?: unknown }).id ?? newId('font')) : newId('font');
      const entry = { id, spec, data: toBase64(bytes) };
      const ops: JsonPatchOp[] = [
        Array.isArray(list) ? (same >= 0 ? { op: 'replace', path: `/userFonts/${same}`, value: entry } : { op: 'add', path: '/userFonts/-', value: entry }) : { op: 'add', path: '/userFonts', value: [entry] },
        ...fontRoleOps(raw, roleList, spec),
      ];
      const next = applyJsonPatch(raw, ops);
      const check = checkDesignData(next);
      if (!check.design) return { ...text({ written: false, issues: check.issues }), isError: true };
      if ((check.design.userFonts?.length ?? 0) === 0) return { ...text({ written: false, issues: [{ path: '/userFonts', message: `Ya hay ${USER_FONTS_MAX} fuentes o alguna no es válida: no se pudo agregar.` }] }), isError: true };
      const written = await ws.write(full, `${JSON.stringify(stamp(next), null, 2)}\n`, { extensions: DESIGN_EXT, overwrite: true });
      const layout = await newLayoutWarnings((d) => open(d, dirname(written)), checkDesignJson(body).design, check.design);
      return text({ written: true, path: ws.show(written), font: { ...info, id }, roles: roleList, issues: check.issues, ...layoutResult(layout) });
    },
  );

  /* ---------- La aplicación de escritorio abierta ---------- */

  server.registerTool(
    'app_status',
    {
      title: 'Estado de la aplicación',
      description:
        'Pregunta si la aplicación de escritorio Heritage Studio está abierta y qué agenda tiene: nombre, año, páginas y revisión (cambia con cada cambio, también los de la persona). Si no está abierta, lo dice sin error. Con «app: true» en las demás herramientas se trabaja sobre esa agenda; la persona puede desactivarlo en Ajustes → «Permitir que un modelo de IA edite la agenda abierta».',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const info = await appLink.status();
      if (!info) return text({ running: false, hint: 'La aplicación de escritorio no está abierta (o no es la versión que tiene el enlace). Abrila para trabajar sobre la agenda abierta, o usá «path».' });
      return text({ running: true, ...(info satisfies LiveInfo) });
    },
  );

  server.registerTool(
    'app_reveal',
    {
      title: 'Mostrar en la aplicación',
      description: 'Lleva la aplicación a una página de la agenda abierta (por número desde 1 o por clave) y, con «blockId», deja elegido ese elemento: así la persona ve de qué se está hablando. Los ids de los elementos salen de render_page.',
      inputSchema: { page: z.number().int().min(1).optional(), key: z.string().max(200).optional(), blockId: z.string().max(200).optional().describe('Id de un elemento de esa página') },
    },
    async ({ page, key, blockId }) => {
      if (page === undefined && key === undefined) throw new Error('Indicá la página con «page» (número desde 1) o con «key».');
      return text(await appLink.request<LiveReveal>('view.reveal', { ...(page !== undefined ? { page } : {}), ...(key !== undefined ? { key } : {}), ...(blockId !== undefined ? { blockId } : {}) }));
    },
  );

  server.registerTool(
    'app_library',
    {
      title: 'Agendas de la aplicación',
      description: 'Las agendas guardadas en la biblioteca de la aplicación de escritorio (id, nombre, año, última modificación), las más recientes primero.',
      annotations: { readOnlyHint: true },
    },
    async () => text(await appLink.request<LiveLibraryItem[]>('library.list')),
  );

  server.registerTool(
    'app_open',
    {
      title: 'Abrir en la aplicación',
      description: 'Abre en la aplicación una agenda de su biblioteca (por id, ver app_library). La que estaba abierta queda guardada.',
      inputSchema: { id: z.string().min(1).max(200) },
    },
    async ({ id }) => text(await appLink.request<LiveOpened>('design.open', { id })),
  );

  server.registerTool(
    'check_design',
    {
      title: 'Revisar agenda',
      description:
        'Revisa una agenda: los valores que al abrirla se ignoran o corrigen (claves desconocidas, colores o tipos inválidos, opciones fuera de lista), y la agenda armada: páginas, hojas, cuadernillos, enlaces y avisos (textos que no entran, imágenes que faltan, enlaces rotos), con sus páginas.',
      inputSchema: source,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const { check, design, baseDir } = await load(input);
      const { doc, errors } = await open(design, baseDir);
      return text({ issues: check.issues, summary: documentSummary(doc, errors) });
    },
  );

  server.registerTool(
    'list_pages',
    {
      title: 'Páginas',
      description: 'Las páginas de la agenda armada: número (desde 1), clave, tipo y título. Las claves y los tipos son los que usan los ajustes por página (overrides, pageStyles, customBlocks).',
      inputSchema: {
        ...source,
        type: z.string().optional().describe('Solo las de este tipo de página (p. ej. weekLeft, monthLog)'),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(300).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, offset, limit, ...input }) => {
      const { design, baseDir } = await load(input);
      const { doc } = await open(design, baseDir);
      return text(listPages(doc, { type, offset, limit }));
    },
  );

  server.registerTool(
    'render_page',
    {
      title: 'Ver página',
      description: 'Dibuja una página de la agenda (como queda impresa) y la devuelve como imagen PNG, con su lado (recto: derecha, verso: izquierda), su zona de contenido y sus bloques (id, nombre y caja [x, y, ancho, alto] en mm, para alinear o ajustar elementos), y sus avisos.',
      inputSchema: { ...source, page: z.number().int().min(1).describe('Número de página, desde 1'), width: z.number().int().min(200).max(1600).optional().describe('Ancho de la imagen en píxeles (800 por defecto)') },
      annotations: { readOnlyHint: true },
    },
    async ({ page, width, ...input }) => {
      const { design, baseDir } = await load(input);
      const { doc, assetHref } = await open(design, baseDir);
      if (page > doc.pageCount) throw new Error(`La agenda tiene ${doc.pageCount} páginas.`);
      const model = doc.page(page - 1);
      const svg = pageToSvg(model, { fonts: doc.ctx.fonts, assetHref }, { background: '#ffffff' });
      const info = pageRenderInfo(doc, page - 1);
      let png: Uint8Array;
      try {
        png = await opts.rasterize(svg, width ?? 800);
      } catch (err) {
        // Sin PNG la página igual se puede ver: va el SVG, con el motivo.
        return text({ ...info, note: `No se pudo dibujar la imagen PNG (${(err as Error).message}): va el SVG.`, svg });
      }
      return { content: [{ type: 'image', data: toBase64(png), mimeType: 'image/png' }, { type: 'text', text: JSON.stringify(info, null, 2) }] };
    },
  );

  /* ---------- Exportar ---------- */

  server.registerTool(
    'export_pdf',
    {
      title: 'Exportar PDF',
      description:
        'Genera un PDF de la agenda (el tipo va en «kind»): pages (páginas sueltas, con enlaces y marcadores, para tableta), imposed (pliegos para imprimir doble faz y doblar en cuadernillos), fronts/backs (frentes o dorsos, para dúplex manual), signature (un cuadernillo), calibration (hoja de prueba de la impresora), sewing (plantilla de perforado), cover (tapa), separate (secciones «aparte»).',
      inputSchema: {
        ...source,
        kind: z.enum(EXPORT_KINDS).optional().describe('Qué PDF: pages, imposed, fronts, backs, signature, calibration, sewing, cover o separate'),
        mode: z.enum(EXPORT_KINDS).optional().describe('Nombre anterior de «kind» (se sigue aceptando)'),
        signature: z.number().int().min(1).optional().describe('Con kind=signature: el cuadernillo, desde 1'),
        out: z.string().describe('Archivo que se escribe (.pdf), relativo a la carpeta de trabajo'),
      },
    },
    async ({ kind: given, mode, signature, out, ...input }) => {
      if (given !== undefined && mode !== undefined && given !== mode) throw new Error('Indicá el tipo de PDF con «kind» (o con «mode», su nombre anterior), no con los dos distintos.');
      const kind = given ?? mode;
      if (kind === undefined) throw new Error(`Indicá qué PDF con «kind»: ${EXPORT_KINDS.join(', ')}.`);
      if (kind === 'signature' && signature === undefined) throw new Error('Con kind=signature indicá el cuadernillo en «signature» (1, 2, 3…).');
      const { design, baseDir } = await load(input);
      const { doc, bytes } = await open(design, baseDir);
      const pdf = await doc.exportPdf(kind, { assetBytes: (id) => bytes.get(id), ...(signature !== undefined ? { signature: signature - 1 } : {}) });
      const full = await ws.write(out, pdf, { extensions: ['.pdf'], overwrite: true });
      return text({ path: ws.show(full), bytes: pdf.length, pages: doc.pageCount });
    },
  );

  server.registerTool(
    'export_theme',
    {
      title: 'Exportar tema',
      description: 'Guarda el estilo de la agenda (tema base, comodidad, letras, colores, líneas y ornamentos, con sus imágenes) como archivo .tema.json, para importarlo en la aplicación (panel Estilo → «Importar tema…») y usarlo en otras agendas.',
      inputSchema: { ...source, name: z.string().min(1).max(80), description: z.string().max(400).optional(), out: z.string().describe('Archivo que se escribe (.tema.json), relativo a la carpeta de trabajo'), overwrite: z.boolean().optional() },
    },
    async ({ name, description, out, overwrite, ...input }) => {
      const { design, baseDir } = await load(input);
      const { bytes } = await open(design, baseDir);
      const file = themeFile(themeFromDesign(design, name, description ?? ''), (id) => {
        const b = bytes.get(id);
        return b ? toBase64(b) : null;
      });
      const full = await ws.write(out, `${JSON.stringify(file, null, 2)}\n`, { extensions: ['.tema.json'], overwrite: overwrite === true });
      return text({ path: ws.show(full), images: file.theme.assets.length });
    },
  );

  /* ---------- Recursos ---------- */

  const guide = (name: string, read: () => Promise<string>, title: string, uri: string) =>
    server.registerResource(name, uri, { title, mimeType: 'text/markdown' }, async () => ({ contents: [{ uri, mimeType: 'text/markdown', text: await read() }] }));
  guide('guide', opts.guides.en, 'Guide: planners, page templates and themes with an LLM', 'agenda://guide');
  guide('guide-es', opts.guides.es, 'Guía: agendas, plantillas y temas con un modelo de lenguaje', 'agenda://guide/es');
  server.registerResource('schema', 'agenda://schema', { title: 'Esquema JSON de .agenda.json', mimeType: 'application/schema+json' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(designJsonSchema(), null, 2) }],
  }));
  server.registerResource('catalogue', 'agenda://catalogue', { title: 'Catálogo de secciones, temas y ornamentos', mimeType: 'application/json' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await fullCatalogue(), null, 2) }],
  }));

  /* ---------- Recetas (prompts): cómo encarar los pedidos más comunes ---------- */

  const prompt = (body: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text: body } }] });
  const where = (file: string | undefined): string => (file ? `el archivo «${file}» (path)` : 'la agenda abierta en la aplicación (app: true; si app_status dice que no está abierta, pedí un archivo)');

  server.registerPrompt(
    'nueva-agenda',
    {
      title: 'Armar una agenda nueva',
      description: 'Los pasos para crear una agenda desde una plantilla y dejarla sin avisos.',
      argsSchema: {
        para: z.string().optional().describe('Para quién es y qué quiere (p. ej. «una docente que planifica sus clases»)'),
        anio: z.string().optional().describe('Año'),
        idioma: z.string().optional().describe('Idioma y país, p. ej. es-AR'),
        hoja: z.string().optional().describe('Tamaño de la hoja, p. ej. A4, A5, LETTER, TABLET_10_3'),
      },
    },
    ({ para, anio, idioma, hoja }) =>
      prompt(
        [
          `Armá una agenda${para ? ` para ${para}` : ''}.`,
          '1. list_catalogue para ver plantillas, secciones y temas; elegí la plantilla más cercana.',
          `2. create_design con template${anio ? `, year ${anio}` : ''}${idioma ? `, locale "${idioma}"` : ''}${hoja ? `, paper "${hoja}"` : ''} y out (un .agenda.json). El tamaño de la hoja se elige ahora: cambiarlo después mueve lo hecho a mano.`,
          '3. Ajustala con update_design (JSON Patch), de a pocos cambios. Leé get_guide (section "alcance") antes de agregar elementos propios.',
          '4. check_design hasta que no queden problemas (cada aviso trae «fix»), y render_page en las páginas que cambiaste.',
        ].join('\n'),
      ),
  );

  server.registerPrompt(
    'revisar-avisos',
    {
      title: 'Revisar y corregir los avisos',
      description: 'Revisa una agenda y corrige sus avisos uno por uno.',
      argsSchema: { archivo: z.string().optional().describe('La agenda (.agenda.json); sin él, la abierta en la aplicación') },
    },
    ({ archivo }) =>
      prompt(
        [
          `Revisá ${where(archivo)} con check_design.`,
          'Agrupá los avisos por código y corregí primero los que no son informativos («abbreviated» es solo informativo). Cada aviso trae «fix», que dice qué tocar en el JSON.',
          'Antes de mover un elemento, mirá su caja con render_page. Hacé cada corrección con update_design y volvé a revisar hasta que no queden problemas.',
        ].join('\n'),
      ),
  );

  server.registerPrompt(
    'traducir',
    {
      title: 'Traducir una agenda',
      description: 'Cambia el idioma de una agenda en una sola operación (meses, días, títulos y feriados).',
      argsSchema: {
        idioma: z.string().describe('Idioma y país de destino, p. ej. en-US, pt-BR, it-IT'),
        archivo: z.string().optional().describe('La agenda (.agenda.json); sin él, la abierta en la aplicación'),
      },
    },
    ({ idioma, archivo }) =>
      prompt(
        [
          `Traducí ${where(archivo)} a «${idioma}».`,
          `No traduzcas los textos uno por uno: una sola operación de update_design, { "op": "replace", "path": "/locale", "value": "${idioma}" }, traduce todo lo que la agenda genera (meses, días, títulos, rótulos y, con holidays.language "auto", los feriados).`,
          'Después, check_design: si un feriado se abrevia («abbreviated»), dale un nombre más corto en /holidays/renamed/AAAA-MM-DD. Los textos escritos a mano (persona, elementos propios) se traducen aparte, solo si te lo piden.',
        ].join('\n'),
      ),
  );

  return server;
}
