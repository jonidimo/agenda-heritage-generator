/**
 * Las herramientas del asistente de la aplicación: qué puede mirar de la agenda abierta y cómo propone un
 * cambio. Cada entrada se valida antes de usarse (lo que pide un modelo no es de confianza), y todo lo que
 * cambia la agenda pasa por `propose_change`, que **no aplica nada**: deja una propuesta para que la
 * persona la apruebe o la descarte.
 *
 * Las respuestas son las mismas que da el servidor MCP para lo mismo (lista de páginas, información de una
 * página, esquema, catálogo, revisión), así un modelo que aprendió una aprendió la otra.
 */
import { z } from 'zod';
import { designCatalogue, designJsonSchema, schemaPart } from '../design/jsonSchema';
import { applyDesignPatch } from '../design/patch';
import type { Design } from '../design/schema';
import type { AgendaDocument } from '../document';
import { newLayoutWarnings, type LayoutNote } from '../document/feedback';
import { listPages, PAGE_LIST_MAX, pageRenderInfo, type Box } from '../document/inspect';
import { documentSummary } from '../document/summary';
import { getAtPointer, type JsonPatchOp } from '../util/jsonPatch';
import { JsonPatchOpZ } from '../util/jsonPatchSchema';
import type { AiImagePart, AiPart, AiToolSpec } from './messages';

/** Lo que la aplicación le cuenta al asistente sobre lo que la persona tiene delante. */
export interface AiContext {
  uiLanguage: string;
  mode: 'design' | 'print';
  view: string;
  agenda: { name: string; year: number; locale: string; pages: number; revision: number } | null;
  page: { number: number; key: string; type: string; side: 'recto' | 'verso'; title: string } | null;
  /** Los elementos elegidos en la página (con su caja `[x, y, ancho, alto]` en mm). */
  selection: Array<{ blockId: string; label: string; box: Box | null }>;
}

export interface RevealResult {
  ok: boolean;
  page?: number;
  key?: string;
  selected?: boolean;
  message?: string;
}

/** Lo que la aplicación pone a disposición de las herramientas. */
export interface ToolHost {
  context(): AiContext;
  design(): Design | null;
  document(): AgendaDocument | null;
  /** Una agenda armada para un diseño cualquiera (para comparar avisos antes y después de un cambio). */
  documentFor(design: Design): AgendaDocument | null;
  /** Dibujar una página como imagen (solo si se permite que el asistente mire las páginas). */
  render?: ((index: number, width: number) => Promise<AiImagePart>) | undefined;
  reveal(req: { page?: number | undefined; key?: string | undefined; blockId?: string | undefined }): RevealResult;
  setView(req: { view?: string | undefined; mode?: 'design' | 'print' | undefined; zoom?: number | 'fit' | undefined }): string;
  /** Lo que el catálogo del núcleo no sabe: las fuentes instaladas, por ejemplo. */
  catalogueExtra(): Record<string, unknown>;
}

/** Un cambio listo para que la persona lo vea y lo apruebe. */
export interface Proposal {
  design: Design;
  patch: JsonPatchOp[];
  summary: string;
  /** Avisos de maquetación que el cambio agrega (texto que no entra, elementos fuera de la página…). */
  warnings: LayoutNote[];
  omittedWarnings: number;
  /** Claves que el esquema no conoce y se ignoraron (punteros JSON). */
  ignored: string[];
}

export type ToolOutcome = { content: AiPart[]; isError?: boolean } | { proposal: Proposal; content: AiPart[] };

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  readOnly: boolean;
  /** Solo se ofrece si se cumple (p. ej. mirar páginas, con la visión permitida). */
  available?: (host: ToolHost) => boolean;
  run(input: z.output<S>, host: ToolHost): Promise<ToolOutcome> | ToolOutcome;
}

/** Más que esto en una respuesta de herramienta no lo lee nadie bien: se pide una parte más chica. */
const TEXT_MAX = 60_000;

const json = (value: unknown): AiPart[] => {
  const text = JSON.stringify(value);
  return [{ type: 'text', text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}… [recortado: pedí una parte más chica]` : text }];
};
const fail = (message: string, extra: Record<string, unknown> = {}): ToolOutcome => ({ content: json({ ok: false, error: message, ...extra }), isError: true });

function needDocument(host: ToolHost): AgendaDocument {
  const doc = host.document();
  if (!doc) throw new ToolFailure('La agenda todavía no se puede armar (faltan las fuentes o no hay una abierta).');
  return doc;
}

class ToolFailure extends Error {}

const define = <S extends z.ZodType>(t: ToolDef<S>): ToolDef<S> => t;

const TOOLS = [
  define({
    name: 'get_context',
    description: 'What the person is looking at now: the open planner (name, year, language, pages, revision), the current page (number from 1, key, type, side, title), the selected elements with their boxes in mm, the mode (design or print), the view and the interface language. Call it first when a request says "this", "here" or "this page".',
    schema: z.strictObject({}),
    readOnly: true,
    run: (_input, host) => ({ content: json(host.context()) }),
  }),
  define({
    name: 'list_pages',
    description: 'Pages of the planner: number (from 1), key, type, side and title. Keys and types are what page-level settings use (overrides, pageStyles, customBlocks, customPages.after).',
    schema: z.strictObject({ type: z.string().max(80).optional(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(PAGE_LIST_MAX).optional() }),
    readOnly: true,
    run: (input, host) => ({ content: json(listPages(needDocument(host), input)) }),
  }),
  define({
    name: 'get_design_part',
    description:
      'Reads part of the planner JSON by JSON Pointer (RFC 6901), e.g. "/theme", "/sections/3/options" or "/customBlocks". "" is the whole planner (large: prefer a part). If the part is bigger than maxBytes, returns its keys with their sizes so you can read a smaller part.',
    schema: z.strictObject({ pointer: z.string().max(500), maxBytes: z.number().int().min(1000).max(TEXT_MAX).optional() }),
    readOnly: true,
    run: (input, host) => {
      const design = host.design();
      if (!design) return fail('No hay una agenda abierta.');
      let value: unknown;
      try {
        value = getAtPointer(JSON.parse(JSON.stringify(design)), input.pointer);
      } catch (err) {
        return fail((err as Error).message);
      }
      const text = JSON.stringify(value) ?? 'null';
      const limit = input.maxBytes ?? 20_000;
      if (text.length <= limit) return { content: [{ type: 'text', text }] };
      if (value && typeof value === 'object') {
        const keys = Object.entries(value as Record<string, unknown>).map(([key, v]) => ({ key, bytes: (JSON.stringify(v) ?? '').length }));
        return { content: json({ truncated: true, bytes: text.length, keys: keys.slice(0, 300) }) };
      }
      return { content: json({ truncated: true, bytes: text.length, start: text.slice(0, limit) }) };
    },
  }),
  define({
    name: 'get_schema',
    description: 'JSON Schema of the planner file. With "part" only that part, references resolved: e.g. "theme", "theme.tokens.lines", "customBlocks", "watermarks", "$defs.sectionItem". Read it before writing values you are not sure about.',
    schema: z.strictObject({ part: z.string().max(200).optional() }),
    readOnly: true,
    run: (input) => {
      const schema = designJsonSchema();
      if (!input.part) return { content: json({ parts: Object.keys(schema.properties as object), hint: 'Pedí una parte con «part»: el esquema entero es grande.' }) };
      const found = schemaPart(schema, input.part);
      return found ? { content: json(found) } : fail(`No hay «${input.part}» en el esquema.`, { parts: Object.keys(schema.properties as object) });
    },
  }),
  define({
    name: 'get_catalogue',
    description: 'What can be used in a planner: section types with their options, themes, ornaments (builtin:<id>), line uses and patterns, colour harmonies, custom element kinds, page types, text variables, installed fonts. With "part", only that key.',
    schema: z.strictObject({ part: z.string().max(80).optional() }),
    readOnly: true,
    run: (input, host) => {
      const all: Record<string, unknown> = { ...designCatalogue(), ...host.catalogueExtra() };
      if (!input.part) return { content: json(all) };
      return Object.hasOwn(all, input.part) ? { content: json(all[input.part]) } : fail(`No hay «${input.part}» en el catálogo.`, { parts: Object.keys(all) });
    },
  }),
  define({
    name: 'render_page',
    description: 'Draws a page (number from 1) as an image, with its side, size, content area, and the id, name and box [x, y, width, height] in mm of each element, plus its warnings. Use it to check how something looks.',
    schema: z.strictObject({ page: z.number().int().min(1), width: z.number().int().min(200).max(1200).optional() }),
    readOnly: true,
    available: (host) => host.render !== undefined,
    run: async (input, host) => {
      const doc = needDocument(host);
      if (input.page > doc.pageCount) return fail(`La agenda tiene ${doc.pageCount} páginas.`);
      const info = pageRenderInfo(doc, input.page - 1);
      const image = await host.render!(input.page - 1, input.width ?? 640);
      return { content: [image, ...json(info)] };
    },
  }),
  define({
    name: 'check_design',
    description: 'Lays out the whole planner and reports pages, sheets, signatures, links and warnings (text that does not fit, missing images, broken links) with their pages.',
    schema: z.strictObject({}),
    readOnly: true,
    run: (_input, host) => ({ content: json(documentSummary(needDocument(host))) }),
  }),
  define({
    name: 'propose_change',
    description:
      'Proposes a change to the open planner as JSON Patch operations (RFC 6902: add, remove, replace, move, copy, test). Nothing is applied: the person sees the change on the page and approves or discards it. All or nothing; the "id" cannot change. If the patch is invalid you get the problems to fix and try again. Returns the layout warnings the change would add and the keys the schema ignores. Only one proposal per turn.',
    schema: z.strictObject({
      patch: z.array(JsonPatchOpZ).min(1).max(200),
      summary: z.string().min(1).max(300).describe('What the change does, in one sentence in the interface language, for the person to read before approving.'),
    }),
    readOnly: false,
    run: async (input, host) => {
      const current = host.design();
      if (!current) return fail('No hay una agenda abierta.');
      const patch = input.patch as JsonPatchOp[];
      const result = applyDesignPatch(current, patch);
      if (!result.ok) return fail('El cambio no se puede aplicar.', { issues: result.issues });
      const open = async (d: Design): Promise<{ doc: AgendaDocument }> => {
        const doc = host.documentFor(d);
        if (!doc) throw new Error('la agenda no se puede armar ahora');
        return { doc };
      };
      const layout = await newLayoutWarnings(open, current, result.design);
      const proposal: Proposal = { design: result.design, patch, summary: input.summary, warnings: layout.notes, omittedWarnings: layout.omitted, ignored: result.stripped };
      return { proposal, content: json({ ok: true, pendingApproval: true, warnings: layout.notes, ignoredKeys: result.stripped }) };
    },
  }),
  define({
    name: 'reveal',
    description: 'Shows the person a page (number from 1, or key) and, with blockId, selects that element, so they see what you are talking about.',
    schema: z.strictObject({ page: z.number().int().min(1).optional(), key: z.string().max(200).optional(), blockId: z.string().max(200).optional() }),
    readOnly: false,
    run: (input, host) => {
      const r = host.reveal(input);
      return r.ok ? { content: json(r) } : fail(r.message ?? 'No se pudo mostrar.');
    },
  }),
  define({
    name: 'set_view',
    description: 'Changes how the person sees the planner: the view (e.g. "spread", "page", "grid"), the mode ("design" or "print") or the zoom (a factor, or "fit").',
    schema: z.strictObject({ view: z.string().max(40).optional(), mode: z.enum(['design', 'print']).optional(), zoom: z.union([z.number().min(0.2).max(6), z.literal('fit')]).optional() }),
    readOnly: false,
    run: (input, host) => ({ content: [{ type: 'text', text: host.setView(input) }] }),
  }),
] as const;

type AnyTool = ToolDef<z.ZodType>;
const ALL = TOOLS as readonly AnyTool[];

const schemaOf = (t: AnyTool): Record<string, unknown> => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(t.schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
};

/** Las herramientas que se ofrecen con este anfitrión (sin visión, no hay `render_page`). */
export function toolSpecs(host: ToolHost): AiToolSpec[] {
  return ALL.filter((t) => !t.available || t.available(host)).map((t) => ({ name: t.name, description: t.description, inputSchema: schemaOf(t), readOnly: t.readOnly }));
}

export const isReadOnlyTool = (name: string): boolean => ALL.find((t) => t.name === name)?.readOnly ?? false;

/** Ejecuta una llamada. No lanza: todo problema vuelve como un resultado de error que el modelo puede leer. */
export async function executeTool(name: string, input: unknown, host: ToolHost): Promise<ToolOutcome> {
  const tool = ALL.find((t) => t.name === name && (!t.available || t.available(host)));
  if (!tool) return fail(`No existe la herramienta «${name}».`);
  const parsed = tool.schema.safeParse(input ?? {});
  if (!parsed.success) return fail('Entrada no válida.', { issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: `/${i.path.map(String).join('/')}`, message: i.message })) });
  try {
    return await tool.run(parsed.data, host);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
