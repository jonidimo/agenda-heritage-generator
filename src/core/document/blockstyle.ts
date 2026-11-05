/**
 * Estilo propio de un elemento del programa (`design.blockStyles`): grosor, color y dibujo de sus
 * líneas, relleno de sus recuadros y color de su texto. Se aplica a las primitivas del bloque ya
 * maquetado, antes del estilo de líneas del tema, así los guiones, las dobles y los ornamentos se
 * arman con el grosor y el color finales. La geometría no cambia nunca.
 *
 * El estilo del tipo de página y el de la página se suman campo por campo (la página gana en cada
 * campo): no hay un lugar que elegir, como en los ajustes de tamaño.
 */
import type { BlockLineKey, BlockLineStyle, BlockStyle } from '../design/schema';
import { LINE_USES, type LineStyle, type LineUse } from '../design/themes';
import type { Fill, Prim, Stroke } from '../layout/prims';
import { ptToMm } from '../util/geometry';

/** El estilo de un elemento en una página, con el del tipo y el de la página ya sumados. */
export interface ResolvedBlockStyle {
  lines: Partial<Record<BlockLineKey, BlockLineStyle>>;
  /** `null`: sin relleno. Sin la clave, el relleno que tenga. */
  fill?: { color: string | null };
  text?: { color?: string; roles: Record<string, string> };
}

/** Suma `over` sobre `base` campo por campo (los campos sin valor no pisan nada). */
function mergeLine(base: BlockLineStyle | undefined, over: BlockLineStyle): BlockLineStyle {
  const out: BlockLineStyle = { ...base };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

function merge(a: ResolvedBlockStyle, s: BlockStyle): ResolvedBlockStyle {
  const lines = { ...a.lines };
  for (const [k, v] of Object.entries(s.lines) as Array<[BlockLineKey, BlockLineStyle]>) lines[k] = mergeLine(lines[k], v);
  let text = a.text;
  if (s.text) {
    const color = s.text.color ?? a.text?.color;
    const roles: Record<string, string> = { ...a.text?.roles };
    for (const [role, c] of Object.entries(s.text.roles)) if (c) roles[role] = c;
    text = { ...(color ? { color } : {}), roles };
  }
  // Un color que no se pudo leer no cambia el relleno.
  const fill = s.fill && s.fill.color !== undefined ? { color: s.fill.color } : a.fill;
  return { lines, ...(fill ? { fill } : {}), ...(text ? { text } : {}) };
}

/**
 * Los estilos de cada elemento de una página. `styles` ya es el de esa página (los del tipo y los
 * suyos); primero entran los del tipo y encima los de la página.
 */
export function blockStyleMap(styles: readonly BlockStyle[], page: { key: string }): ReadonlyMap<string, ResolvedBlockStyle> {
  const out = new Map<string, ResolvedBlockStyle>();
  if (styles.length === 0) return out;
  const ordered = [...styles.filter((s) => s.pageKey === null), ...styles.filter((s) => s.pageKey === page.key)];
  for (const s of ordered) out.set(s.blockId, merge(out.get(s.blockId) ?? { lines: {} }, s));
  return out;
}

/** La tabla de estilos de línea del tema con lo que el elemento cambia (dibujo, ornamento, tamaño y color). */
export function mergeLineTable(theme: Record<LineUse, LineStyle>, lines: ResolvedBlockStyle['lines']): Record<LineUse, LineStyle> {
  const out = { ...theme };
  for (const use of LINE_USES) {
    const l = lines[use];
    if (!l) continue;
    out[use] = {
      ...theme[use],
      ...(l.pattern ? { pattern: l.pattern } : {}),
      ...(l.ornament !== undefined ? { ornament: l.ornament } : {}),
      ...(l.size !== undefined ? { size: l.size } : {}),
      ...(l.color ? { color: l.color } : {}),
    };
  }
  return out;
}

/** Grosor y color de un trazo según su uso (sin uso: `other`). */
function stroked(s: Stroke | undefined, st: ResolvedBlockStyle): Stroke | undefined {
  if (!s) return s;
  const l = st.lines[s.use ?? 'other'];
  if (!l || (l.color === undefined && l.widthPt === undefined)) return s;
  return { ...s, ...(l.color ? { color: l.color } : {}), ...(l.widthPt !== undefined ? { width: ptToMm(l.widthPt) } : {}) };
}

/** Relleno nuevo: se reemplaza solo el color (conserva la opacidad) o se quita. */
function filled(f: Fill | undefined, st: ResolvedBlockStyle, always: boolean): Fill | undefined {
  if (!st.fill) return f;
  if (st.fill.color === null) return undefined;
  // Los recuadros se rellenan aunque no tuvieran; las formas (círculos, íconos) solo si ya estaban rellenas.
  return f || always ? { ...f, color: st.fill.color } : f;
}

function setFill<T extends { fill?: Fill }>(p: T, fill: Fill | undefined): T {
  const { fill: _old, ...rest } = p;
  return (fill ? { ...rest, fill } : rest) as T;
}

/** Aplica el estilo a las primitivas de un elemento (entra en los grupos). No toca la geometría. */
export function applyBlockStyle(prims: readonly Prim[], st: ResolvedBlockStyle): Prim[] {
  const walk = (ps: readonly Prim[]): Prim[] =>
    ps.map((p): Prim => {
      switch (p.t) {
        case 'group':
          return { ...p, children: walk(p.children) };
        case 'line':
          return { ...p, stroke: stroked(p.stroke, st)! };
        case 'rect': {
          const stroke = stroked(p.stroke, st);
          // Un marco (contenedor de otros elementos) no se rellena si no lo estaba: taparía lo que lleva adentro.
          return setFill(stroke ? { ...p, stroke } : p, filled(p.fill, st, p.stroke?.use !== 'frame'));
        }
        case 'circle':
        case 'path': {
          const stroke = stroked(p.stroke, st);
          return setFill(stroke ? { ...p, stroke } : p, filled(p.fill, st, false));
        }
        case 'text': {
          const color = (p.role ? st.text?.roles[p.role] : undefined) ?? st.text?.color;
          return color ? { ...p, color } : p;
        }
        default:
          return p;
      }
    });
  return walk(prims);
}
