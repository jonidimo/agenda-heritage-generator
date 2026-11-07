/**
 * Revisión de un archivo de agenda escrito a mano o por un modelo de lenguaje. Al abrirlo, el
 * programa es tolerante (ignora claves desconocidas, corrige valores fuera de rango, descarta
 * colores inválidos); esta revisión dice qué se ignoró o corrigió y dónde, para poder arreglarlo.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { designJsonSchema } from '../core/design/jsonSchema';
import { migrateDesignInput } from '../core/design/migrations';
import { DesignZ, droppedUserFonts, USER_FONTS_MAX, type Design } from '../core/design/schema';
import { pageFormat } from '../core/document/context';
import { escapePointerKey } from '../core/util/jsonPatch';

export interface CheckIssue {
  /** Puntero JSON al valor (`/sections/3/options/variant`; `/` es la raíz). */
  path: string;
  message: string;
  /** `error`: el archivo no se puede abrir. `adjusted`: abre, pero ese valor se ignora o se corrige. */
  severity: 'error' | 'adjusted';
}

export interface CheckResult {
  /** El diseño tal como lo abre el programa (null si no abre). */
  design: Design | null;
  issues: CheckIssue[];
}

const MAX_ISSUES = 60;
let validator: ValidateFunction | null = null;

function schemaValidator(): ValidateFunction {
  validator ??= new Ajv2020({ allErrors: true, strict: false, verbose: true }).compile(designJsonSchema());
  return validator;
}

const list = (v: unknown): string => (Array.isArray(v) ? v.map((x) => JSON.stringify(x)).join(', ') : String(v));

/** El mensaje de un error del esquema; `adjusted`: el archivo abre y el valor se ignora o se corrige. */
function describe(e: ErrorObject, adjusted: boolean): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return `clave desconocida «${String(p.additionalProperty ?? p.unevaluatedProperty)}»${adjusted ? ' (se ignora)' : ''}`;
    case 'enum':
      return `valor no válido; opciones: ${list(p.allowedValues)}`;
    case 'const':
      return `debe ser ${JSON.stringify(p.allowedValue)}`;
    case 'type':
      return `debe ser de tipo ${[p.type].flat().join(' o ')}`;
    case 'pattern': {
      const about = (e.parentSchema as { description?: string } | undefined)?.description;
      return `formato no válido (${about ?? `debe cumplir ${String(p.pattern)}`})`;
    }
    case 'minimum':
    case 'maximum':
      return `fuera de rango (${e.keyword === 'minimum' ? 'mínimo' : 'máximo'} ${String(p.limit)})${adjusted ? ': se ajusta' : ''}`;
    case 'multipleOf':
      return `debe ser un número entero${adjusted ? ': se redondea' : ''}`;
    case 'required':
      return 'falta este valor';
    case 'maxLength':
      return `demasiado largo (máximo ${String(p.limit)} caracteres)`;
    default:
      return e.message ?? e.keyword;
  }
}

/**
 * Errores del esquema sin repeticiones: de las alternativas de un valor («texto o null») queda el
 * error más concreto (un formato, una lista de opciones); si todas fallan por el tipo, uno solo.
 */
function schemaErrors(errors: readonly ErrorObject[]): ErrorObject[] {
  const out: ErrorObject[] = [];
  const alternatives = new Map<string, ErrorObject[]>();
  for (const e of errors) {
    // «if/then» y «anyOf» repiten lo que ya dicen los errores de adentro.
    if (e.keyword === 'if' || e.keyword === 'anyOf') continue;
    if (!e.schemaPath.includes('/anyOf/')) {
      out.push(e);
      continue;
    }
    const group = alternatives.get(e.instancePath) ?? [];
    if (group.length === 0) alternatives.set(e.instancePath, group);
    group.push(e);
  }
  for (const group of alternatives.values()) {
    const specific = group.filter((e) => e.keyword !== 'type');
    if (specific.length > 0) out.push(...specific);
    else out.push({ ...group[0]!, params: { type: [...new Set(group.flatMap((e) => (e.params as { type: string | string[] }).type))] } });
  }
  return out;
}

/**
 * Revisa datos ya leídos de un JSON. Si el archivo no abre, son errores los valores que lo
 * impiden; el resto, lo que se ignoraría o corregiría (los mensajes del esquema, en castellano,
 * reemplazan a los del validador interno cuando hablan del mismo valor).
 */
export function checkDesignData(input: unknown): CheckResult {
  let raw: unknown;
  try {
    raw = migrateDesignInput(input);
  } catch (err) {
    return { design: null, issues: [{ path: '/schemaVersion', message: (err as Error).message, severity: 'error' }] };
  }
  const parsed = DesignZ.safeParse(raw);
  const blocking = parsed.success ? [] : parsed.error.issues.map((i) => ({ path: pointer(i.path), message: i.message }));
  const failing = new Set(blocking.map((i) => i.path));
  const validate = schemaValidator();
  const fromSchema: CheckIssue[] = validate(raw)
    ? []
    : schemaErrors(validate.errors ?? []).map((e) => {
        // Lo que falta se señala en su propio lugar (como lo hace el validador del programa).
        const path = (e.keyword === 'required' ? `${e.instancePath}/${escapePointerKey(String((e.params as { missingProperty: string }).missingProperty))}` : e.instancePath) || '/';
        const adjusted = !failing.has(path);
        return { path, message: describe(e, adjusted), severity: adjusted ? 'adjusted' : 'error' };
      });
  const explained = new Set(fromSchema.filter((i) => i.severity === 'error').map((i) => i.path));
  const placement = parsed.success ? offPageElements(parsed.data) : [];
  // Una fuente incrustada que no vale se deja afuera sola (la agenda abre igual): se dice cuál, para que no desaparezca en silencio.
  const fonts: CheckIssue[] = parsed.success
    ? droppedUserFonts(raw).map((d) => ({ path: `/userFonts/${d.index}`, message: d.reason === 'invalid' ? 'la fuente no es válida y se deja afuera: sus textos salen con la de reserva' : `hay más de ${USER_FONTS_MAX} fuentes: esta se deja afuera`, severity: 'adjusted' as const }))
    : [];
  const issues: CheckIssue[] = [...blocking.filter((i) => !explained.has(i.path)).map((i) => ({ ...i, severity: 'error' as const })), ...fonts, ...fromSchema, ...placement];
  const seen = new Set<string>();
  const unique = issues
    .filter((i) => {
      const k = `${i.path}|${i.message}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return { design: parsed.success ? parsed.data : null, issues: unique.slice(0, MAX_ISSUES) };
}

/**
 * Elementos propios cuya caja no entra en el papel. El editor no deja armarlos así, pero un archivo
 * escrito a mano o por un modelo sí puede (y el elemento queda cortado o corrido al imprimir).
 */
function offPageElements(design: Design): CheckIssue[] {
  const { w, h } = pageFormat(design);
  const out: CheckIssue[] = [];
  design.customBlocks.forEach((cb, i) => {
    const over: string[] = [];
    if (cb.x < -0.01) over.push('x es negativo');
    if (cb.y < -0.01) over.push('y es negativo');
    if (cb.x + cb.w > w + 0.01) over.push(`x + w (${Math.round((cb.x + cb.w) * 10) / 10}) pasa del ancho de la página (${Math.round(w * 10) / 10} mm)`);
    // Un texto de alto automático toma su alto de los renglones: `h` no cuenta.
    if (!(cb.kind === 'text' && cb.props.autoHeight === true) && cb.y + cb.h > h + 0.01) over.push(`y + h (${Math.round((cb.y + cb.h) * 10) / 10}) pasa del alto de la página (${Math.round(h * 10) / 10} mm)`);
    if (over.length > 0) out.push({ path: `/customBlocks/${i}`, message: `el elemento «${cb.id}» sale de la página: ${over.join('; ')}`, severity: 'adjusted' });
  });
  return out;
}


/** Puntero JSON (RFC 6901) de una ruta del validador del programa. */
const pointer = (path: readonly PropertyKey[]): string => `/${path.map((k) => escapePointerKey(String(k))).join('/')}`;

/** Revisa el texto de un archivo `.agenda.json`. */
export function checkDesignJson(text: string): CheckResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { design: null, issues: [{ path: '/', message: `JSON no válido: ${(err as Error).message}`, severity: 'error' }] };
  }
  return checkDesignData(raw);
}
