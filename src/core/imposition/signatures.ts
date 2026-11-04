/**
 * Plan de cuadernillos (signaturas). Decide cuántas hojas lleva cada
 * cuadernillo y cuántas páginas de relleno hacen falta, según el método de
 * encuadernación elegido.
 *
 * - sewn: varios cuadernillos plegados y cosidos (lo artesanal clásico).
 * - saddle: un único cuadernillo grapado o cosido por el lomo.
 * - cut-stack: 2 páginas por cara, se corta la pila al medio y se apila
 *   (para anillado, espiral, discos o encolado).
 * - single: 1 página por cara, sobre papel del tamaño final.
 */
import type { Design } from '../design/schema';

export type BindingMethod = Design['binding']['method'];

export interface SignatureSpec {
  /** Hojas físicas (cada hoja = 4 páginas). */
  sheets: number;
  /** Índice 0-based de la primera página del cuadernillo. */
  firstPage: number;
}

export interface SignaturePlan {
  method: BindingMethod;
  signatures: SignatureSpec[];
  /** Páginas totales tras el relleno. */
  totalPages: number;
  /** Hojas de papel necesarias. */
  totalSheets: number;
  /** Páginas agregadas para completar. */
  padding: number;
}

export function planSignatures(pageCount: number, binding: Design['binding']): SignaturePlan {
  const P = Math.max(0, pageCount);
  const method = binding.method;
  if (method === 'single') {
    const total = Math.max(2, P + (P % 2));
    return { method, signatures: [], totalPages: total, totalSheets: total / 2, padding: total - P };
  }
  const S = Math.max(1, Math.ceil(P / 4));
  if (method === 'cut-stack') {
    return { method, signatures: [], totalPages: S * 4, totalSheets: S, padding: S * 4 - P };
  }
  if (method === 'saddle') {
    return { method, signatures: [{ sheets: S, firstPage: 0 }], totalPages: S * 4, totalSheets: S, padding: S * 4 - P };
  }
  const sig = binding.signature;
  const N = Math.max(1, sig.sheets);
  let sizes: number[];
  if (sig.mode === 'custom' && sig.custom.length > 0) {
    sizes = [];
    let sum = 0;
    let k = 0;
    while (sum < S) {
      const n = Math.max(1, sig.custom[Math.min(k, sig.custom.length - 1)]!);
      sizes.push(n);
      sum += n;
      k++;
    }
    if (sum > S && sig.last === 'shrink') sizes[sizes.length - 1] = sizes[sizes.length - 1]! - (sum - S);
  } else if (sig.mode === 'balanced') {
    const K = Math.ceil(S / N);
    const base = Math.floor(S / K);
    const extra = S % K;
    sizes = Array.from({ length: K }, (_, i) => base + (i < extra ? 1 : 0));
    if (sig.last === 'pad') sizes = sizes.map(() => base + (extra > 0 ? 1 : 0));
  } else {
    const full = Math.floor(S / N);
    const rest = S % N;
    sizes = Array.from({ length: full }, () => N);
    if (rest > 0) sizes.push(sig.last === 'pad' ? N : rest);
  }
  sizes = sizes.filter((n) => n > 0);
  const signatures: SignatureSpec[] = [];
  let first = 0;
  for (const n of sizes) {
    signatures.push({ sheets: n, firstPage: first });
    first += n * 4;
  }
  const totalSheets = sizes.reduce((a, b) => a + b, 0);
  return { method, signatures, totalPages: totalSheets * 4, totalSheets, padding: totalSheets * 4 - P };
}

/** Resumen legible («13 cuadernillos de 4 hojas + 1 de 2»). */
export function describeSignatures(plan: SignaturePlan): string {
  if (plan.signatures.length === 0) return `${plan.totalSheets} hojas`;
  const groups: Array<{ n: number; count: number }> = [];
  for (const s of plan.signatures) {
    const last = groups[groups.length - 1];
    if (last && last.n === s.sheets) last.count++;
    else groups.push({ n: s.sheets, count: 1 });
  }
  return groups.map((g) => `${g.count} × ${g.n} ${g.n === 1 ? 'hoja' : 'hojas'} (${g.n * 4} págs.)`).join(' + ');
}
