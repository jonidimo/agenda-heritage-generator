/**
 * Servidor MCP de Agenda Heritage Studio: le da a un modelo de lenguaje (Claude Desktop, Claude
 * Code u otro cliente MCP) las herramientas para diseñar agendas, plantillas de página y temas con
 * el mismo motor que la aplicación: crear una agenda, cambiarla con JSON Patch, revisarla, ver cómo
 * queda cada página, y exportar el PDF o el tema.
 *
 * Los archivos se leen y escriben solo dentro de la carpeta de trabajo (ver `Workspace`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { createDesign, TEMPLATES, type TemplateId } from '../core/design/defaults';
import { designJsonSchema, schemaPart } from '../core/design/jsonSchema';
import type { Design } from '../core/design/schema';
import { themeFile, themeFromDesign } from '../core/design/themeFile';
import { EXPORT_KINDS } from '../core/document';
import { documentSummary } from '../core/document/summary';
import { pageToSvg } from '../core/render/svg';
import { toBase64 } from '../core/resources';
import type { FontRegistry } from '../core/text/fonts';
import { applyJsonPatch, type JsonPatchOp } from '../core/util/jsonPatch';
import { checkDesignData, type CheckResult } from '../node/check';
import { fullCatalogue, loadFonts, openNodeDocument, ROOT } from '../node/env';
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
const VERSION = '2.0.0';

const INSTRUCTIONS = `Diseño de agendas imprimibles (Agenda Heritage Studio). Una agenda es un archivo JSON (.agenda.json).
Flujo: create_design (desde una plantilla) → update_design (JSON Patch) → check_design hasta que no queden problemas → render_page para ver páginas → export_pdf / export_theme.
Referencia: list_catalogue (secciones con sus opciones, temas, ornamentos, variables de texto) y get_schema (con «part» para leer solo una parte, p. ej. "theme.tokens.lines").
Medidas en milímetros; colores #rrggbb; las rutas de archivo son relativas a la carpeta de trabajo. La guía completa está en el recurso agenda://guide.`;

type ToolResult = { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean };

const text = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

/** Una agenda: por archivo (`path`) o escrita en el pedido (`design`). */
const source = {
  path: z.string().optional().describe('Archivo .agenda.json, relativo a la carpeta de trabajo'),
  design: z.record(z.string(), z.unknown()).optional().describe('La agenda escrita directamente (en lugar de path)'),
};

const patchOp = z.union([
  z.object({ op: z.enum(['add', 'replace', 'test']), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: z.string() }),
  z.object({ op: z.enum(['move', 'copy']), from: z.string(), path: z.string() }),
]);

export interface ServerOptions {
  /** Carpeta de trabajo (los archivos se leen y escriben solo adentro). */
  root: string;
}

export function createServer(opts: ServerOptions): McpServer {
  const ws = new Workspace(opts.root);
  const server = new McpServer({ name: 'agenda-heritage-studio', version: VERSION }, { instructions: INSTRUCTIONS });

  // Un solo registro con todas las fuentes integradas para todas las agendas (se carga al primer uso).
  let fonts: Promise<FontRegistry> | null = null;
  const sharedFonts = (): Promise<FontRegistry> => {
    fonts ??= loadFonts().catch((err: unknown) => {
      fonts = null;
      throw err;
    });
    return fonts;
  };

  /** Lee y revisa la agenda pedida; si no abre, el error lista los problemas. */
  async function load(input: { path?: string | undefined; design?: Record<string, unknown> | undefined }): Promise<{ check: CheckResult; design: Design }> {
    if ((input.path === undefined) === (input.design === undefined)) throw new Error('Indicá la agenda con «path» (un archivo) o con «design» (el JSON), una de las dos.');
    let raw: unknown = input.design;
    if (input.path !== undefined) raw = parseJson((await ws.read(input.path, JSON_EXT)).text, input.path);
    // Una plantilla guardada desde la aplicación trae la agenda adentro.
    const wrapped = raw as { kind?: unknown; design?: unknown } | null;
    if (wrapped?.kind === 'heritage-template' && wrapped.design) raw = wrapped.design;
    const check = checkDesignData(raw);
    if (!check.design) throw new Error(`La agenda no se puede abrir:\n${check.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`);
    return { check, design: check.design };
  }

  const open = async (design: Design) => openNodeDocument(design, await sharedFonts());

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

  /* ---------- Agendas ---------- */

  server.registerTool(
    'create_design',
    {
      title: 'Crear agenda',
      description: 'Crea una agenda desde una plantilla. Con «out» la guarda en un archivo .agenda.json y devuelve su resumen; sin «out», devuelve el JSON.',
      inputSchema: {
        template: z.enum(TEMPLATES.map((t) => t.id) as [TemplateId, ...TemplateId[]]).describe(TEMPLATES.map((t) => `${t.id}: ${t.description}`).join(' | ')),
        year: z.number().int().min(1900).max(2200).optional(),
        locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).optional().describe('Idioma y país, p. ej. es-AR, en-US, pt-BR, it-IT'),
        country: z.string().regex(/^[A-Z]{2}$/).nullable().optional().describe('Feriados de este país (código ISO); null: sin feriados. Por defecto, el del idioma.'),
        name: z.string().max(120).optional().describe('Nombre de la persona (portada, dedicatoria)'),
        out: z.string().optional().describe('Archivo a crear (.agenda.json)'),
        overwrite: z.boolean().optional(),
      },
    },
    async ({ template, year, locale, country, name, out, overwrite }) => {
      const design = createDesign(template, { ...(year ? { year } : {}), ...(locale ? { locale } : {}), ...(country !== undefined ? { country } : {}), ...(name ? { name } : {}) });
      if (!out) return text(design);
      const full = await ws.write(out, `${JSON.stringify(design, null, 2)}\n`, { extensions: DESIGN_EXT, overwrite: overwrite === true });
      const { doc, errors } = await open(design);
      return text({ path: ws.show(full), summary: documentSummary(doc, errors) });
    },
  );

  server.registerTool(
    'update_design',
    {
      title: 'Cambiar agenda',
      description:
        'Cambia un archivo .agenda.json con operaciones JSON Patch (RFC 6902: add, remove, replace, move, copy, test; rutas como "/calendar/weekStart" o "/sections/-"). Se aplica todo o nada; si después la agenda no abre, el archivo no se toca. Devuelve los problemas que quedan.',
      inputSchema: { path: z.string().describe('Archivo .agenda.json'), patch: z.array(patchOp).min(1).max(500) },
    },
    async ({ path, patch }) => {
      const { full, text: body } = await ws.read(path, DESIGN_EXT);
      const next = applyJsonPatch(parseJson(body, path), patch as JsonPatchOp[]);
      const check = checkDesignData(next);
      if (!check.design) return { ...text({ written: false, issues: check.issues }), isError: true };
      await ws.write(full, `${JSON.stringify(next, null, 2)}\n`, { extensions: DESIGN_EXT, overwrite: true });
      return text({ written: true, path: ws.show(full), issues: check.issues });
    },
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
      const { check, design } = await load(input);
      const { doc, errors } = await open(design);
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
      const { design } = await load(input);
      const { doc } = await open(design);
      const all = doc.plan.pages.filter((p) => !type || p.type === type);
      const from = offset ?? 0;
      const pages = all.slice(from, from + (limit ?? 100)).map((p) => ({ page: p.index + 1, key: p.key, type: p.type, side: p.side, title: doc.pageLabel(p.index) }));
      return text({ total: all.length, offset: from, pages });
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
      const { design } = await load(input);
      const { doc, assetHref } = await open(design);
      if (page > doc.pageCount) throw new Error(`La agenda tiene ${doc.pageCount} páginas.`);
      const model = doc.page(page - 1);
      const svg = pageToSvg(model, { fonts: doc.ctx.fonts, assetHref }, { background: '#ffffff' });
      const box = (r: { x: number; y: number; w: number; h: number }) => [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 10) / 10);
      const info = {
        page,
        key: model.key,
        type: model.type,
        side: model.side,
        size: { w: model.w, h: model.h },
        // Cajas como [x, y, ancho, alto] en mm desde la esquina superior izquierda de esta página.
        content: box(model.content),
        blocks: model.blocks.map((b) => ({ id: b.id, label: b.label, box: box(b.bbox) })),
        warnings: model.warnings.map((w) => w.message),
      };
      const png = await rasterize(svg, width ?? 800);
      if (!png) return text({ ...info, note: 'No se pudo cargar el dibujante de PNG (@resvg/resvg-js): va el SVG.', svg });
      return { content: [{ type: 'image', data: toBase64(png), mimeType: 'image/png' }, { type: 'text', text: JSON.stringify(info, null, 2) }] };
    },
  );

  /* ---------- Exportar ---------- */

  server.registerTool(
    'export_pdf',
    {
      title: 'Exportar PDF',
      description:
        'Genera un PDF de la agenda: pages (páginas sueltas, con enlaces y marcadores, para tableta), imposed (pliegos para imprimir doble faz y doblar en cuadernillos), fronts/backs (frentes o dorsos, para dúplex manual), signature (un cuadernillo), calibration (hoja de prueba de la impresora), sewing (plantilla de perforado), cover (tapa), separate (secciones «aparte»).',
      inputSchema: {
        ...source,
        mode: z.enum(EXPORT_KINDS),
        signature: z.number().int().min(1).optional().describe('Con mode=signature: el cuadernillo, desde 1'),
        out: z.string().describe('Archivo PDF a escribir'),
      },
    },
    async ({ mode, signature, out, ...input }) => {
      if (mode === 'signature' && signature === undefined) throw new Error('Con mode=signature indicá el cuadernillo en «signature» (1, 2, 3…).');
      const { design } = await load(input);
      const { doc, bytes } = await open(design);
      const pdf = await doc.exportPdf(mode, { assetBytes: (id) => bytes.get(id), ...(signature !== undefined ? { signature: signature - 1 } : {}) });
      const full = await ws.write(out, pdf, { extensions: ['.pdf'], overwrite: true });
      return text({ path: ws.show(full), bytes: pdf.length, pages: doc.pageCount });
    },
  );

  server.registerTool(
    'export_theme',
    {
      title: 'Exportar tema',
      description: 'Guarda el estilo de la agenda (tema base, comodidad, letras, colores, líneas y ornamentos, con sus imágenes) como archivo .tema.json, para importarlo en la aplicación (panel Estilo → «Importar tema…») y usarlo en otras agendas.',
      inputSchema: { ...source, name: z.string().min(1).max(80), description: z.string().max(400).optional(), out: z.string().describe('Archivo a escribir (.tema.json)'), overwrite: z.boolean().optional() },
    },
    async ({ name, description, out, overwrite, ...input }) => {
      const { design } = await load(input);
      const { bytes } = await open(design);
      const file = themeFile(themeFromDesign(design, name, description ?? ''), (id) => {
        const b = bytes.get(id);
        return b ? toBase64(b) : null;
      });
      const full = await ws.write(out, `${JSON.stringify(file, null, 2)}\n`, { extensions: ['.tema.json'], overwrite: overwrite === true });
      return text({ path: ws.show(full), images: file.theme.assets.length });
    },
  );

  /* ---------- Recursos ---------- */

  const guide = (name: string, file: string, title: string, uri: string) =>
    server.registerResource(name, uri, { title, mimeType: 'text/markdown' }, async () => ({ contents: [{ uri, mimeType: 'text/markdown', text: await readFile(join(ROOT, 'docs', file), 'utf8') }] }));
  guide('guide', 'llm-templates.md', 'Guide: planners, page templates and themes with an LLM', 'agenda://guide');
  guide('guide-es', 'plantillas-llm.md', 'Guía: agendas, plantillas y temas con un modelo de lenguaje', 'agenda://guide/es');
  server.registerResource('schema', 'agenda://schema', { title: 'Esquema JSON de .agenda.json', mimeType: 'application/schema+json' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(designJsonSchema(), null, 2) }],
  }));
  server.registerResource('catalogue', 'agenda://catalogue', { title: 'Catálogo de secciones, temas y ornamentos', mimeType: 'application/json' }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await fullCatalogue(), null, 2) }],
  }));

  return server;
}

/** SVG → PNG con resvg (opcional: si no está instalado, devuelve null y se manda el SVG). */
async function rasterize(svg: string, width: number): Promise<Uint8Array | null> {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
  } catch {
    return null;
  }
}
