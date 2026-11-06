/**
 * Cambiar el tamaño de la hoja de una agenda ya armada. Lo del programa (calendarios, tablas, renglones)
 * se vuelve a maquetar solo en el tamaño nuevo; lo que la persona puso a mano está en milímetros, así
 * que sin más quedaría en el mismo lugar (fuera de una página más chica, apretado en un rincón de una
 * más grande). Con `rescale`, eso se lleva en proporción a la página nueva: posición y tamaño de los
 * elementos propios, los corrimientos y cambios de tamaño hechos a los del programa, y las marcas de agua.
 */
import type { Design } from '../design/schema';
import { SCREEN_PRESETS } from '../design/schema';
import { pageFormat } from './context';

export interface PaperChange {
  paper: Design['paper'];
  /** Para qué es la agenda; sin valor, la de ahora. */
  target?: Design['binding']['target'];
  /** Cómo se encuaderna; sin valor, el de ahora (un tamaño de pantalla lleva siempre una página por hoja). */
  method?: Design['binding']['method'];
  /** Llevar lo hecho a mano en proporción a la página nueva. */
  rescale: boolean;
}

const round = (v: number): number => Math.round(v * 100) / 100;

/** La página (ancho y alto en mm) que da un diseño con este papel y esta encuadernación. */
export function pageSizeFor(design: Design, change: Omit<PaperChange, 'rescale'>): { w: number; h: number; nUp: 1 | 2 } {
  const f = pageFormat(withPaper(design, change));
  return { w: round(f.w), h: round(f.h), nUp: f.nUp };
}

function withPaper(design: Design, change: Omit<PaperChange, 'rescale'>): Design {
  const screenSize = SCREEN_PRESETS.includes(change.paper.preset);
  const target = change.target ?? (screenSize ? 'screen' : design.binding.target);
  // Para leer en pantalla, una página por hoja (salvo que se pida otra cosa con un papel de imprenta).
  const method = screenSize ? 'single' : (change.method ?? (target === 'screen' ? 'single' : design.binding.method));
  return { ...design, paper: { ...change.paper }, binding: { ...design.binding, target, method } };
}

/** El diseño con el papel (y la encuadernación) nuevos; con `rescale`, lo hecho a mano acompaña el cambio. */
export function changePaper(design: Design, change: PaperChange): Design {
  const next = withPaper(design, change);
  if (!change.rescale) return next;
  const from = pageFormat(design);
  const to = pageFormat(next);
  const rx = to.w / from.w;
  const ry = to.h / from.h;
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || (Math.abs(rx - 1) < 1e-6 && Math.abs(ry - 1) < 1e-6)) return next;
  const r = Math.min(rx, ry);
  return {
    ...next,
    customBlocks: design.customBlocks.map((b) => {
      // Una imagen o un dibujo que se escala entero (un trazo de sellos) no se deforma: crece parejo y
      // queda centrado donde iba.
      if (b.kind === 'image' || (b.kind === 'drawing' && b.props.mode === 'scale')) {
        const w = b.w * r;
        const h = b.h * r;
        return { ...b, x: round((b.x + b.w / 2) * rx - w / 2), y: round((b.y + b.h / 2) * ry - h / 2), w: round(w), h: round(h) };
      }
      return { ...b, x: round(b.x * rx), y: round(b.y * ry), w: round(b.w * rx), h: round(b.h * ry) };
    }),
    overrides: design.overrides.map((o) => ({ ...o, dx: round(o.dx * rx), dy: round(o.dy * ry), dw: round(o.dw * rx), dh: round(o.dh * ry) })),
    // La marca de agua no baja de su ancho mínimo (1 mm).
    watermarks: design.watermarks.map((w) => ({ ...w, dx: round(w.dx * rx), dy: round(w.dy * ry), width: Math.max(1, round(w.width * r)) })),
  };
}
