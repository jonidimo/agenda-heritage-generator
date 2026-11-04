/**
 * Esquema JSON del archivo `.agenda.json` y catálogo de lo que se puede usar en él. Todo sale del
 * código que valida y dibuja la agenda (el esquema de zod, las reglas del tema, las secciones
 * registradas y sus opciones), así nunca queda desactualizado: es la referencia para escribir
 * agendas, plantillas de página o temas a mano, con un editor o con un modelo de lenguaje.
 *
 * Es estricto a propósito: una clave que el programa no conoce se marca como error aunque al abrir
 * el archivo simplemente se ignore, para que un error de tipeo se vea en lugar de perderse.
 */
import { z } from 'zod';
import { BUILTIN_ORNAMENTS } from '../layout/ornaments';
import { PAGE_TEXT_VARIABLES } from '../sections/common';
import { choiceValue, EXTRA_OPTIONS, OPTION_COUNT, sectionOptionFields } from '../sections/options';
import { PAGE_TYPES, SECTION_MODULES } from '../sections/registry';
import { customBlockPropsSchema } from './customBlocks';
import { TEMPLATES } from './defaults';
import { BLOCK_BOUNDS, CustomBlockZ, DesignZ } from './schema';
import { HARMONIES, LINE_PATTERNS, LINE_USES, THEMES, tokenSchema } from './themes';

type Json = Record<string, unknown>;

/** Tipos internos: el relleno de paridad y las páginas propias (se agregan con `customPages`). */
const INTERNAL = new Set(['filler', 'custom']);
const listedModules = () => SECTION_MODULES.filter((m) => !INTERNAL.has(m.type));

/** Esquema de las opciones de un tipo de sección (las que no figuran, el programa las ignora). */
function optionsSchema(type: string): Json {
  const properties: Json = {};
  for (const f of sectionOptionFields(type)) {
    if (f.kind === 'choice') properties[f.key] = { enum: f.values.map(choiceValue), default: f.default };
    else if (f.kind === 'boolean') properties[f.key] = { type: 'boolean', default: f.default };
    else properties[f.key] = { type: 'integer', minimum: OPTION_COUNT.min, maximum: OPTION_COUNT.max, default: f.default };
  }
  for (const [path, schema] of Object.entries(EXTRA_OPTIONS)) {
    const [t, key] = path.split('.') as [string, string];
    if (t === type) properties[key] = schema;
  }
  return { type: 'object', properties };
}

/** Un tipo de página: los del programa o el de una plantilla de página (`tpl:<id>`). */
const pageTypeSchema = (extra: readonly string[] = []): Json => ({
  type: 'string',
  anyOf: [{ enum: [...extra, ...PAGE_TYPES] }, { pattern: '^tpl:.+$' }],
  description: 'Tipo de página (ver pageTypes en el catálogo) o «tpl:<id>» para una plantilla de página',
});

/** Los ornamentos integrados por nombre: uno mal escrito no se dibuja, así que se marca. */
function ornamentNames(tokens: Json): Json {
  const names = ['', ...BUILTIN_ORNAMENTS.map((o) => `builtin:${o.id}`)];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as Json;
    if (typeof o.description === 'string' && o.description.startsWith('Ornamento:') && typeof o.pattern === 'string') {
      delete o.pattern;
      o.anyOf = [{ enum: names }, { pattern: '^asset:[\\w.-]{1,80}$' }];
    }
    Object.values(o).forEach(walk);
  };
  walk(tokens);
  return tokens;
}

/** Marca las claves desconocidas como error en todo objeto con propiedades fijas. */
function closeObjects(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(closeObjects);
  if (!node || typeof node !== 'object') return;
  const n = node as Json;
  if (n.type === 'object' && n.properties && !('additionalProperties' in n)) n.additionalProperties = false;
  for (const v of Object.values(n)) closeObjects(v);
}

export function designJsonSchema(): Json {
  const schema = z.toJSONSchema(DesignZ, { io: 'input', unrepresentable: 'any' }) as Json;
  const props = schema.properties as Record<string, Json>;
  const ref = (name: string): Json => ({ $ref: `#/$defs/${name}` });
  // Una sección (de la lista o de adentro de «Meses»): sus campos, sin la lista de adentro.
  const sectionZ = props.sections!.items as Json;
  const { items: _inner, ...itemFields } = sectionZ.properties as Json;
  closeObjects(schema);
  const modules = listedModules();
  const sectionItem: Json = {
    type: 'object',
    required: sectionZ.required ?? ['id', 'type'],
    properties: { ...itemFields, type: { type: 'string', enum: ['months', ...modules.map((m) => m.type)], description: 'Tipo de sección (ver el catálogo)' } },
    // Las opciones de cada tipo.
    allOf: modules.map((m) => ({ if: { properties: { type: { const: m.type } }, required: ['type'] }, then: { properties: { options: optionsSchema(m.type) } } })),
  };
  closeObjects(sectionItem.allOf);
  props.sections!.items = {
    $ref: '#/$defs/sectionItem',
    properties: { items: { type: 'array', description: 'Solo en «months»: lo que se repite cada mes, en orden.', items: ref('monthItem') } },
    unevaluatedProperties: false,
  };
  // Las propiedades de cada tipo de elemento propio, y su caja.
  const blocks = props.customBlocks!.items as Json;
  const box = blocks.properties as Json;
  const mm = (r: { min: number; max: number }, description: string): Json => ({ type: 'number', minimum: r.min, maximum: r.max, description });
  box.x = mm(BLOCK_BOUNDS.pos, 'mm desde el borde izquierdo de la página (de una página derecha si «mirror»)');
  box.y = mm(BLOCK_BOUNDS.pos, 'mm desde el borde superior de la página');
  box.w = mm(BLOCK_BOUNDS.size, 'Ancho en mm');
  box.h = mm(BLOCK_BOUNDS.size, 'Alto en mm');
  blocks.allOf = CustomBlockZ.shape.kind.options.map((kind) => ({ if: { properties: { kind: { const: kind } }, required: ['kind'] }, then: { properties: { props: customBlockPropsSchema(kind) } } }));
  // Tipos de página y temas: los nombres que existen.
  for (const list of ['customBlocks', 'overrides', 'pageStyles']) ((props[list]!.items as Json).properties as Json).pageType = pageTypeSchema();
  (((props.links!.properties as Json).blocks as Json).items as { properties: Json }).properties.pageType = pageTypeSchema();
  const wm = (props.watermarks!.items as Json).properties as Json;
  (wm.scope as Json).items = pageTypeSchema(['all']);
  (wm.exclude as Json).items = pageTypeSchema();
  (props.theme!.properties as Json).id = { type: 'string', enum: Object.keys(THEMES), default: 'heritage', description: 'Tema base (ver themes en el catálogo)' };
  // Los ajustes del tema se validan aparte (pruneTokens): acá se describe su forma completa.
  (props.theme!.properties as Json).tokens = ref('themeTokens');
  ((props.pageStyles!.items as Json).properties as Json).tokens = ref('themeTokens');
  schema.$defs = { ...(schema.$defs as Json | undefined), themeTokens: ornamentNames(tokenSchema()), sectionItem, monthItem: { $ref: '#/$defs/sectionItem', unevaluatedProperties: false } };
  // La hora de creación no es un valor por defecto útil (y cambiaría el esquema en cada uso).
  for (const k of ['createdAt', 'updatedAt']) delete (props[k] as Json).default;
  // Claves que agrega el archivo autocontenido o un editor (no son parte del diseño).
  Object.assign(props, {
    $schema: { type: 'string', description: 'Ruta o dirección de este esquema (para el autocompletado del editor).' },
    userFonts: {
      type: 'array',
      description: 'Fuentes subidas que viajan con el archivo (las escribe la aplicación al guardar).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'spec', 'data'],
        properties: {
          id: { type: 'string' },
          spec: { type: 'object', properties: { family: { type: 'string' }, weight: { type: 'number' }, style: { enum: ['normal', 'italic'] } } },
          data: { type: 'string', contentEncoding: 'base64' },
        },
      },
    },
  });
  schema.title = 'Agenda Heritage Studio (.agenda.json)';
  schema.description =
    'Diseño de una agenda. Todo campo tiene valor por defecto: alcanza con escribir lo que cambia. El catálogo (`npm run agenda -- catalog`, o la herramienta list_catalogue del servidor MCP) lista las secciones, temas, ornamentos y plantillas.';
  return schema;
}

/**
 * Una parte del esquema («theme», «theme.tokens.lines», «sections», «$defs.sectionItem»…) con las
 * referencias internas resueltas, para leer solo lo que hace falta.
 */
export function schemaPart(schema: Json, path: string): Json | undefined {
  const deref = (node: unknown, depth = 0): unknown => {
    if (Array.isArray(node)) return node.map((x) => deref(x, depth));
    if (!node || typeof node !== 'object') return node;
    const n = node as Json;
    const target = typeof n.$ref === 'string' && n.$ref.startsWith('#/') && depth < 8 ? pointer(schema, n.$ref.slice(2).split('/')) : undefined;
    const { $ref: _ref, ...rest } = n;
    const base = target ? (deref(target, depth + 1) as Json) : n.$ref ? { $ref: n.$ref } : {};
    const own = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, deref(v, depth)])) as Json;
    // Las propiedades de al lado de una referencia se suman a las de la referencia.
    if (base.properties && own.properties) own.properties = { ...(base.properties as Json), ...(own.properties as Json) };
    return { ...base, ...own };
  };
  let node: unknown = schema;
  let container = false;
  for (const key of path.split('.').filter(Boolean)) {
    const n = deref(node) as Json;
    // Una propiedad (también la de los elementos de una lista), o una entrada de «$defs».
    node = container || key.startsWith('$') ? n[key] : ((n.properties as Json | undefined)?.[key] ?? ((n.items as Json | undefined)?.properties as Json | undefined)?.[key]);
    container = key === '$defs';
    if (node === undefined || node === null || typeof node !== 'object') return undefined;
  }
  return deref(node) as Json;
}

function pointer(root: Json, parts: string[]): unknown {
  let node: unknown = root;
  for (const p of parts) node = node && typeof node === 'object' ? (node as Json)[p.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
  return node;
}

/** Lo que se puede nombrar en un diseño: secciones con sus opciones, temas, ornamentos, plantillas… */
export function designCatalogue(): Json {
  return {
    sections: [
      { type: 'months', scope: 'front', options: {}, note: 'Contenedor: lo que va en «items» se repite cada mes (o cada semana o día, con «repeat»).' },
      ...listedModules().map((m) => ({ type: m.type, scope: m.scope, options: optionsSchema(m.type).properties })),
    ],
    sectionRepeat: ['month', 'week', 'day'],
    themes: Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, description: t.description })),
    lineUses: LINE_USES,
    linePatterns: LINE_PATTERNS,
    harmonies: HARMONIES,
    ornaments: BUILTIN_ORNAMENTS.map((o) => ({ ref: `builtin:${o.id}`, kind: o.kind, aspect: o.aspect })),
    templates: TEMPLATES,
    customBlockKinds: CustomBlockZ.shape.kind.options,
    pageTypes: PAGE_TYPES,
    textVariables: PAGE_TEXT_VARIABLES,
  };
}
