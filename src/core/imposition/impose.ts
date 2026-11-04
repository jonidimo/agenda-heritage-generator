/**
 * Imposición: qué página va en cada mitad de cada cara de cada hoja.
 *
 * Cuadernillo de n hojas (páginas locales 1…4n), hoja i (0 = la exterior):
 *   frente = [ 4n − 2i | 2i + 1 ]      dorso = [ 2i + 2 | 4n − 2i − 1 ]
 * (izquierda | derecha, con la hoja apaisada). Con volteo por borde corto el
 * dorso sale derecho; con volteo por borde largo se gira 180°.
 */
import type { Design } from '../design/schema';
import type { PageFormat } from '../document/context';
import type { SignaturePlan } from './signatures';

export interface Slot {
  /** Índice 0-based de la página (null = vacío). */
  page: number | null;
  /** Celda en la hoja (mm, hoja tal como sale de la impresora). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Desplazamiento hacia el lomo por creep (mm, positivo = hacia el pliegue). */
  creep: number;
  /** Lado del pliegue dentro de la celda. */
  fold: 'left' | 'right' | 'none';
}

export interface SheetSide {
  sheet: number;
  side: 'front' | 'back';
  signature: number;
  sheetInSignature: number;
  sheetsInSignature: number;
  slots: Slot[];
  /** Girar 180° la cara (volteo por borde largo o manual). */
  rotate180: boolean;
  /** Corrimiento de registro (solo dorsos). */
  offset: { x: number; y: number };
}

function creepFor(i: number, n: number, creep: Design['binding']['creep']): number {
  if (creep.mode === 'off' || n <= 1) return 0;
  if (creep.mode === 'measured') return (creep.measured * i) / (n - 1);
  return creep.caliper * i;
}

export function impose(plan: SignaturePlan, fmt: PageFormat, binding: Design['binding']): SheetSide[] {
  const out: SheetSide[] = [];
  const back = (side: Omit<SheetSide, 'rotate180' | 'offset' | 'side'>): SheetSide => ({
    ...side,
    side: 'back',
    rotate180: binding.duplex === 'long-edge' || (binding.duplex === 'manual' && binding.manualRotateBacks),
    offset: { x: binding.backOffset.x, y: binding.backOffset.y },
  });
  const front = (side: Omit<SheetSide, 'rotate180' | 'offset' | 'side'>): SheetSide => ({ ...side, side: 'front', rotate180: false, offset: { x: 0, y: 0 } });
  const cw = fmt.cellW;
  const ch = fmt.cellH;
  const L = (page: number | null, creep: number): Slot => ({ page, x: 0, y: 0, w: cw, h: ch, creep, fold: 'right' });
  const R = (page: number | null, creep: number): Slot => ({ page, x: cw, y: 0, w: cw, h: ch, creep, fold: 'left' });

  if (plan.method === 'single') {
    for (let j = 0; j * 2 < plan.totalPages; j++) {
      const base = { sheet: j, signature: 0, sheetInSignature: j, sheetsInSignature: plan.totalSheets };
      out.push(front({ ...base, slots: [{ page: 2 * j, x: 0, y: 0, w: fmt.sheetW, h: fmt.sheetH, creep: 0, fold: 'none' }] }));
      out.push(back({ ...base, slots: [{ page: 2 * j + 1 < plan.totalPages ? 2 * j + 1 : null, x: 0, y: 0, w: fmt.sheetW, h: fmt.sheetH, creep: 0, fold: 'none' }] }));
    }
    return out;
  }

  if (plan.method === 'cut-stack') {
    const S = plan.totalSheets;
    for (let j = 0; j < S; j++) {
      const base = { sheet: j, signature: 0, sheetInSignature: j, sheetsInSignature: S };
      // Al cortar la pila al medio y poner la mitad izquierda sobre la derecha, el orden queda 1…4S.
      out.push(front({ ...base, slots: [{ ...L(2 * j, 0), fold: 'none' }, { ...R(2 * S + 2 * j, 0), fold: 'none' }] }));
      out.push(back({ ...base, slots: [{ ...L(2 * S + 2 * j + 1, 0), fold: 'none' }, { ...R(2 * j + 1, 0), fold: 'none' }] }));
    }
    return out;
  }

  let sheetNo = 0;
  plan.signatures.forEach((sig, si) => {
    const n = sig.sheets;
    const p = (local: number): number => sig.firstPage + local - 1;
    for (let i = 0; i < n; i++) {
      const c = creepFor(i, n, binding.creep);
      const base = { sheet: sheetNo++, signature: si, sheetInSignature: i, sheetsInSignature: n };
      out.push(front({ ...base, slots: [L(p(4 * n - 2 * i), c), R(p(2 * i + 1), c)] }));
      out.push(back({ ...base, slots: [L(p(2 * i + 2), c), R(p(4 * n - 2 * i - 1), c)] }));
    }
  });
  return out;
}

/** Comprueba que cada página aparezca exactamente una vez (para pruebas y verificación previa). */
export function impositionCoverage(sides: SheetSide[], totalPages: number): { missing: number[]; duplicated: number[] } {
  const seen = new Map<number, number>();
  for (const s of sides) for (const sl of s.slots) if (sl.page !== null) seen.set(sl.page, (seen.get(sl.page) ?? 0) + 1);
  const missing: number[] = [];
  const duplicated: number[] = [];
  for (let p = 0; p < totalPages; p++) {
    const c = seen.get(p) ?? 0;
    if (c === 0) missing.push(p);
    if (c > 1) duplicated.push(p);
  }
  return { missing, duplicated };
}
