/**
 * Un código QR dibujado: el margen claro de 4 módulos que exige el estándar y los módulos oscuros como
 * rectángulos (los de una misma fila se juntan en uno, así el PDF no lleva miles de cuadraditos).
 */
import { qrEncode, type QrEcc } from '../util/qr';
import type { Rect } from '../util/geometry';
import type { Prim } from './prims';

export const QR_QUIET_MODULES = 4;

/** El cuadrado más grande que entra en `box`, centrado. */
export function qrSquare(box: Rect): Rect {
  const side = Math.max(0, Math.min(box.w, box.h));
  return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side };
}

/** Las primitivas de un QR de `text` dentro de `box` (cuadrado, con su margen claro adentro). */
export function qrPrims(text: string, box: Rect, opts: { color?: string; background?: string | null; ecc?: QrEcc } = {}): Prim[] {
  const qr = qrEncode(text, opts.ecc ?? 'M');
  const sq = qrSquare(box);
  const unit = sq.w / (qr.size + QR_QUIET_MODULES * 2);
  const ox = sq.x + QR_QUIET_MODULES * unit;
  const oy = sq.y + QR_QUIET_MODULES * unit;
  const color = opts.color ?? '#000000';
  const out: Prim[] = [];
  if (opts.background !== null) out.push({ t: 'rect', x: sq.x, y: sq.y, w: sq.w, h: sq.h, fill: { color: opts.background ?? '#ffffff' } });
  qr.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      // Un pelo más alto y ancho que el módulo: sin rendijas blancas entre filas al dibujar con suavizado.
      out.push({ t: 'rect', x: ox + x * unit, y: oy + y * unit, w: (end - x) * unit + 0.01, h: unit + 0.01, fill: { color } });
      x = end;
    }
  });
  return out;
}
