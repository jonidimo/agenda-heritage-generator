/**
 * Texto como contornos: cada glifo de una corrida pasa a un trazado ya colocado (en mm). Sirve para
 * llevar un texto a un dibujo que no depende de que la letra esté instalada en otra agenda: se ve y se
 * imprime igual donde se pegue. Usa exactamente la transformación del dibujante SVG
 * (`matrix(u 0 0 -u x+gl.x y+gl.y)`), así el resultado coincide con lo que se ve.
 */
import type { PathPrim } from '../layout/prims';
import type { FontRegistry } from './fonts';
import { glyphPath, type ShapedRun } from './shape';

const COMMAND = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Redondeo suficiente para mm (milésimas) sin arrastrar ruido de coma flotante. */
const r = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * Lleva un trazado de unidades de diseño (Y hacia arriba) a mm de página: `x' = ox + X·u`,
 * `y' = oy − Y·u`. Los contornos de fontkit solo traen órdenes absolutas M, L, Q, C y Z; cualquier otra
 * (relativas, arcos) es un error: mejor fallar que dibujar mal.
 */
export function mapGlyphPath(d: string, u: number, ox: number, oy: number): string {
  let out = '';
  for (const [, cmd, args] of d.matchAll(COMMAND)) {
    if (cmd === 'Z' || cmd === 'z') {
      out += 'Z';
      continue;
    }
    if (!'MLQC'.includes(cmd!)) throw new Error(`Orden de trazado no admitida en un glifo: ${cmd}`);
    const nums = (args!.match(NUMBER) ?? []).map(Number);
    if (nums.length === 0 || nums.length % 2 !== 0) throw new Error('Trazado de glifo mal formado');
    out += cmd;
    for (let i = 0; i < nums.length; i += 2) out += `${i > 0 ? ' ' : ''}${r(ox + nums[i]! * u)} ${r(oy - nums[i + 1]! * u)}`;
  }
  return out;
}

/** Los contornos de toda una corrida (con su origen `x`, `y` sobre la línea de base) como un solo trazado relleno. */
export function outlineRun(fonts: FontRegistry, run: ShapedRun, x: number, y: number, color: string, opacity?: number): PathPrim | null {
  const face = fonts.get(run.face);
  if (!face) return null;
  const parts: string[] = [];
  for (const gl of run.glyphs) {
    const d = glyphPath(face, gl.id);
    if (d) parts.push(mapGlyphPath(d, run.unit, x + gl.x, y + gl.y));
  }
  if (parts.length === 0) return null;
  return { t: 'path', d: parts.join(''), fill: { color, ...(opacity !== undefined && opacity < 1 ? { opacity } : {}) }, rule: 'nonzero' };
}
