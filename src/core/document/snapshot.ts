/**
 * Un elemento del programa como elemento propio: lo que se pega al copiar un nombre de mes, un marco o
 * un filete. Un bloque que es solo texto pasa a un texto editable (con su letra, cuerpo y color); el
 * resto, a un dibujo con las primitivas tal como están (el texto, como contornos), que se mueve y
 * cambia de tamaño. El original no cambia.
 */
import { enumProp, TEXT_ALIGNS, TEXT_ROLES } from '../design/customBlocks';
import type { CustomBlock, Design } from '../design/schema';
import { readTextSource } from '../design/textSource';
import type { AgendaStrings } from '../i18n';
import { stretchPrims } from '../layout/stretch';
import type { Block, PageModel, Prim, TextPrim } from '../layout/prims';
import type { FontRegistry } from '../text/fonts';
import { outlineRun } from '../text/outline';
import { compose, translate, type Rect } from '../util/geometry';
import { blockBounds } from './layout';

export interface SnapshotContext {
  fonts: FontRegistry;
  design: Design;
  /** Las cadenas del idioma de la agenda sin los rótulos propios (para leer un texto fijo del programa). */
  strings: AgendaStrings;
}

/** Margen (mm) que se le da al ancho de un texto copiado: al volver a partirlo en renglones no se corta por redondeos. */
const TEXT_SLACK = 1;

/** Las primitivas hoja (sin grupos), con la matriz de cada grupo que las envuelve. */
function leaves(prims: readonly Prim[]): { leaves: Prim[]; transformed: boolean } {
  const out: Prim[] = [];
  let transformed = false;
  const walk = (ps: readonly Prim[]): void => {
    for (const p of ps) {
      if (p.t !== 'group') out.push(p);
      else {
        if (p.m) transformed = true;
        walk(p.children);
      }
    }
  };
  walk(prims);
  return { leaves: out, transformed };
}

/** La matriz solo traslada (sin escala ni giro). */
const isTranslation = (m: readonly number[] | undefined): boolean => !m || (Math.abs(m[0]! - 1) < 1e-9 && Math.abs(m[3]! - 1) < 1e-9 && Math.abs(m[1]!) < 1e-9 && Math.abs(m[2]!) < 1e-9);

/** El texto como contornos y fuera lo que no puede ir en un dibujo (páginas de PDF). */
function toDrawable(fonts: FontRegistry, prims: readonly Prim[]): Prim[] {
  return prims.flatMap((p): Prim[] => {
    if (p.t === 'group') return [{ ...p, children: toDrawable(fonts, p.children) }];
    if (p.t === 'pdf') return [];
    if (p.t === 'text') {
      const path = outlineRun(fonts, p.run, p.x, p.y, p.color, p.opacity);
      return path ? [path] : [];
    }
    return [p];
  });
}

function textProps(ctx: SnapshotContext, block: Block, texts: readonly TextPrim[]): Record<string, unknown> {
  const first = texts[0]!;
  const locale = ctx.design.locale;
  const raw = block.text ? readTextSource(ctx.design, block.text, ctx.strings) : texts.map((t) => t.run.text).join('\n');
  const head = raw.split('\n')[0] ?? '';
  // Un texto en mayúsculas que sale de uno en minúsculas: el elemento lo escribe como estaba y lo pone en mayúsculas.
  const upper = !/[{}]/.test(raw) && first.run.text !== head && first.run.text === head.toLocaleUpperCase(locale);
  const face = ctx.fonts.get(first.run.face);
  return {
    text: raw,
    role: enumProp(first.role, TEXT_ROLES, 'body'),
    size: Math.min(120, Math.max(4, Math.round(first.run.sizePt * 100) / 100)),
    color: first.color,
    align: enumProp(first.anchor === 'middle' ? 'center' : first.anchor === 'end' ? 'right' : 'left', TEXT_ALIGNS, 'left'),
    ...(upper ? { upper: true } : {}),
    ...(first.run.tracking !== 0 ? { tracking: Math.min(0.5, Math.max(-0.1, Math.round((first.run.tracking / first.run.size) * 1000) / 1000)) } : {}),
    ...(face ? { font: { family: face.family, weight: face.weight, style: face.style } } : {}),
    wrap: true,
    fit: false,
    autoHeight: true,
    label: block.label,
  };
}

/**
 * El elemento propio equivalente a `block` (en la página `page`), con el id dado, o `null` si no tiene
 * tamaño ni nada que copiar. Su lugar es el que tiene en esta página; en una izquierda se guarda como
 * en una derecha (el elemento se espeja), igual que al crearlo en el editor.
 */
export function customBlockFromBlock(ctx: SnapshotContext, page: PageModel, block: Block, id: string): CustomBlock | null {
  const visual = blockBounds(block);
  if (visual.w <= 0 && visual.h <= 0) return null;
  const w = Math.max(visual.w, 0.5);
  const h = Math.max(visual.h, 0.5);
  const x = page.side === 'verso' ? page.w - visual.x - w : visual.x;
  const place = { id, pageType: page.type, pageKey: null, mirror: true, x: Math.round(x * 100) / 100, y: Math.round(visual.y * 100) / 100, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 };

  const { leaves: flat, transformed } = leaves(block.prims);
  const texts = flat.filter((p): p is TextPrim => p.t === 'text');
  if (texts.length > 0 && texts.length === flat.length && !transformed && isTranslation(block.m)) {
    return { ...place, kind: 'text', w: Math.round((w + TEXT_SLACK) * 100) / 100, props: textProps(ctx, block, texts) };
  }

  const drawable = toDrawable(ctx.fonts, block.prims);
  if (drawable.length === 0) return null;
  // El dibujo se guarda con su esquina en el origen. Si el elemento se había escalado o girado, la matriz va dentro y se escala entero.
  const origin: Rect = block.box ?? block.bbox;
  const keepsShape = isTranslation(block.m);
  const prims = keepsShape ? stretchPrims(drawable, origin, { x: 0, y: 0, w: origin.w, h: origin.h }) : [{ t: 'group' as const, m: compose(translate(-visual.x, -visual.y), block.m!), children: drawable }];
  const resizes = flat.some((p) => p.t === 'line' || p.t === 'rect' || p.t === 'dots');
  return {
    ...place,
    kind: 'drawing',
    props: {
      w0: Math.max(0.1, keepsShape ? origin.w : visual.w),
      h0: Math.max(0.1, keepsShape ? origin.h : visual.h),
      mode: keepsShape && resizes ? 'stretch' : 'scale',
      prims,
      ...(block.opacity !== undefined && block.opacity < 1 ? { opacity: block.opacity } : {}),
      source: { block: block.id, label: block.label.slice(0, 200) },
      label: block.label.slice(0, 120),
    },
  };
}
