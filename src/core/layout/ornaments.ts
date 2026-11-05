/**
 * Ornamentos integrados (firuletes, guardas y esquinas), dibujados con curvas en una caja
 * normalizada: son vectores (nítidos a cualquier tamaño, livianos en el PDF) y no dependen de
 * archivos. Tres clases:
 *  - `tile`: un módulo que se repite a lo largo de una línea (guarda);
 *  - `center`: una pieza para el centro de un separador;
 *  - `corner`: una esquina de marco, dibujada para la esquina superior izquierda (los brazos
 *    van hacia la derecha y hacia abajo; las otras esquinas se obtienen girándola).
 * Los diseños son originales de este programa.
 */

export type OrnamentKind = 'tile' | 'center' | 'corner';

/** Un trazo del ornamento: relleno o línea (en coordenadas de la página). */
export interface OrnamentStroke {
  d: string;
  mode: 'fill' | 'stroke';
}

export interface BuiltinOrnament {
  id: string;
  kind: OrnamentKind;
  /** Ancho / alto de la caja del ornamento. */
  aspect: number;
  /** Dibuja el ornamento en la caja (x, y, w, h). */
  draw(x: number, y: number, w: number, h: number): OrnamentStroke[];
}

/** Traductor de coordenadas normalizadas (0..1) a la caja, con 3 decimales (micras). */
function frame(x: number, y: number, w: number, h: number) {
  const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();
  const p = (u: number, v: number): string => `${n(x + u * w)} ${n(y + v * h)}`;
  /** Trazado a partir de una plantilla con pares «u,v» normalizados. */
  const path = (cmds: Array<[string, ...number[]]>): string =>
    cmds
      .map(([c, ...uv]) => {
        const pts: string[] = [];
        for (let i = 0; i < uv.length; i += 2) pts.push(p(uv[i]!, uv[i + 1]!));
        return `${c} ${pts.join(' ')}`.trim();
      })
      .join(' ');
  /** Círculo de radio en unidades del alto (no se deforma aunque la caja no sea cuadrada). */
  const dot = (u: number, v: number, r: number): string => {
    const cx = x + u * w;
    const cy = y + v * h;
    const rr = r * h;
    return `M ${n(cx - rr)} ${n(cy)} a ${n(rr)} ${n(rr)} 0 1 0 ${n(2 * rr)} 0 a ${n(rr)} ${n(rr)} 0 1 0 ${n(-2 * rr)} 0 Z`;
  };
  return { path, dot };
}

/** Refleja en horizontal una plantilla (para piezas simétricas). */
function mirror(cmds: Array<[string, ...number[]]>): Array<[string, ...number[]]> {
  return cmds.map(([c, ...uv]) => [c, ...uv.map((v, i) => (i % 2 === 0 ? 1 - v : v))] as [string, ...number[]]);
}

/**
 * Corazón: su curva (en un cuadrado unitario) ocupa de 0,14 a 0,86 a lo ancho y de 0,12 a 0,86 a lo
 * alto. Se reescala para que la caja del ornamento sea la del dibujo y no sobre aire.
 */
const HEART = { x: 0.1399, y: 0.1214, w: 0.7202, h: 0.7386 } as const;
const HEART_CURVE: Array<[string, ...number[]]> = [
  ['M', 0.5, 0.86],
  ['C', 0.22, 0.7, 0.04, 0.44, 0.2, 0.2],
  ['C', 0.32, 0.03, 0.5, 0.16, 0.5, 0.36],
  ['C', 0.5, 0.16, 0.68, 0.03, 0.8, 0.2],
  ['C', 0.96, 0.44, 0.78, 0.7, 0.5, 0.86],
  ['Z'],
];

function heartCommands(): Array<[string, ...number[]]> {
  return HEART_CURVE.map(([c, ...uv]) => [c, ...uv.map((v, i) => (i % 2 === 0 ? (v - HEART.x) / HEART.w : (v - HEART.y) / HEART.h))] as [string, ...number[]]);
}

const scrollHalf: Array<[string, ...number[]]> = [
  ['M', 0.56, 0.5],
  ['C', 0.66, 0.1, 0.76, 0.1, 0.8, 0.5],
  ['C', 0.84, 0.9, 0.94, 0.9, 0.965, 0.55],
  ['C', 0.985, 0.33, 0.9, 0.28, 0.885, 0.45],
  ['C', 0.878, 0.56, 0.93, 0.58, 0.935, 0.47],
];
const scrollLeaf: Array<[string, ...number[]]> = [
  ['M', 0.56, 0.5],
  ['C', 0.6, 0.66, 0.66, 0.7, 0.71, 0.64],
];

export const BUILTIN_ORNAMENTS: readonly BuiltinOrnament[] = [
  {
    id: 'scroll',
    kind: 'center',
    aspect: 6,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [
        { mode: 'stroke', d: [scrollHalf, mirror(scrollHalf), scrollLeaf, mirror(scrollLeaf)].map((c) => f.path(c)).join(' ') },
        { mode: 'fill', d: f.path([['M', 0.5, 0.3], ['L', 0.535, 0.5], ['L', 0.5, 0.7], ['L', 0.465, 0.5], ['Z']]) },
      ];
    },
  },
  {
    id: 'fleuron',
    kind: 'center',
    // Un corazón solo, sin tallo ni rulos: la caja es la del dibujo (ver `HEART`).
    aspect: HEART.w / HEART.h,
    draw: (x, y, w, h) => [{ mode: 'fill', d: frame(x, y, w, h).path(heartCommands()) }],
  },
  {
    id: 'diamond',
    kind: 'center',
    aspect: 3,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [{ mode: 'fill', d: [f.path([['M', 0.5, 0.12], ['L', 0.6, 0.5], ['L', 0.5, 0.88], ['L', 0.4, 0.5], ['Z']]), f.dot(0.27, 0.5, 0.09), f.dot(0.73, 0.5, 0.09)].join(' ') }];
    },
  },
  {
    id: 'wave',
    kind: 'tile',
    aspect: 2.4,
    draw: (x, y, w, h) => [{ mode: 'stroke', d: frame(x, y, w, h).path([['M', 0, 0.5], ['C', 0.25, 0.05, 0.25, 0.05, 0.5, 0.5], ['C', 0.75, 0.95, 0.75, 0.95, 1, 0.5]]) }],
  },
  {
    id: 'beads',
    kind: 'tile',
    aspect: 1.6,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [
        { mode: 'fill', d: f.dot(0.5, 0.5, 0.2) },
        { mode: 'stroke', d: f.path([['M', 0, 0.5], ['L', 0.3, 0.5], ['M', 0.7, 0.5], ['L', 1, 0.5]]) },
      ];
    },
  },
  {
    id: 'laurel',
    kind: 'tile',
    aspect: 2,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      const leaf: Array<[string, ...number[]]> = [['M', 0.18, 0.5], ['C', 0.32, 0.08, 0.58, 0.04, 0.72, 0.14], ['C', 0.56, 0.3, 0.38, 0.46, 0.18, 0.5], ['Z']];
      const down = leaf.map(([c, ...uv]) => [c, ...uv.map((v, i) => (i % 2 === 1 ? 1 - v : v))] as [string, ...number[]]);
      return [
        { mode: 'fill', d: `${f.path(leaf)} ${f.path(down)}` },
        { mode: 'stroke', d: f.path([['M', 0, 0.5], ['L', 1, 0.5]]) },
      ];
    },
  },
  {
    id: 'chain',
    kind: 'tile',
    aspect: 1.5,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [
        { mode: 'fill', d: f.path([['M', 0.5, 0.22], ['L', 0.72, 0.5], ['L', 0.5, 0.78], ['L', 0.28, 0.5], ['Z']]) },
        { mode: 'stroke', d: f.path([['M', 0, 0.5], ['L', 0.28, 0.5], ['M', 0.72, 0.5], ['L', 1, 0.5]]) },
      ];
    },
  },
  {
    id: 'curl',
    kind: 'corner',
    aspect: 1,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [
        {
          mode: 'stroke',
          d: f.path([
            ['M', 0.1, 0.62],
            ['C', 0.1, 0.24, 0.24, 0.1, 0.62, 0.1],
            ['C', 0.8, 0.1, 0.84, 0.26, 0.71, 0.31],
            ['C', 0.6, 0.35, 0.54, 0.25, 0.6, 0.19],
            ['M', 0.1, 0.62],
            ['C', 0.1, 0.8, 0.26, 0.84, 0.31, 0.71],
            ['C', 0.35, 0.6, 0.25, 0.54, 0.19, 0.6],
          ]),
        },
        { mode: 'fill', d: f.dot(0.25, 0.25, 0.055) },
      ];
    },
  },
  {
    id: 'bracket',
    kind: 'corner',
    aspect: 1,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [
        { mode: 'stroke', d: f.path([['M', 0, 0.72], ['L', 0, 0], ['L', 0.72, 0], ['M', 0.14, 0.46], ['L', 0.14, 0.14], ['L', 0.46, 0.14]]) },
        { mode: 'fill', d: f.path([['M', 0.24, 0.24], ['L', 0.32, 0.24], ['L', 0.32, 0.32], ['L', 0.24, 0.32], ['Z']]) },
      ];
    },
  },
  {
    id: 'leaf',
    kind: 'corner',
    aspect: 1,
    draw: (x, y, w, h) => {
      const f = frame(x, y, w, h);
      return [
        { mode: 'fill', d: f.path([['M', 0.08, 0.08], ['C', 0.5, 0.12, 0.64, 0.36, 0.62, 0.62], ['C', 0.36, 0.64, 0.12, 0.5, 0.08, 0.08], ['Z']]) },
        { mode: 'stroke', d: f.path([['M', 0.08, 0.08], ['L', 0.5, 0.5]]) },
      ];
    },
  },
];

const BY_ID = new Map(BUILTIN_ORNAMENTS.map((o) => [o.id, o]));

export function builtinOrnament(id: string): BuiltinOrnament | undefined {
  return BY_ID.get(id);
}

/** Separa una referencia de ornamento (`builtin:scroll`, `asset:abc`). */
export function parseOrnamentRef(ref: string): { source: 'builtin' | 'asset'; id: string } | null {
  const m = /^(builtin|asset):(.+)$/.exec(ref);
  return m ? { source: m[1] as 'builtin' | 'asset', id: m[2]! } : null;
}
