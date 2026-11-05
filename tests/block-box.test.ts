/**
 * Estirar los bloques del programa: el contenido se reacomoda dentro de la caja nueva
 * (`LayoutContext.rect`) o, si la sección no lo hace, se estira sin deformar (`stretch.ts`).
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import type { AgendaDocument } from '../src/core/document';
import { blockBounds } from '../src/core/document/layout';
import { primsBounds, type Block, type Prim } from '../src/core/layout/prims';
import { adjustBox, naturalBox, storeAdjust } from '../src/core/layout/box';
import { boxMap, stretchPrims, stretchRect } from '../src/core/layout/stretch';
import { openDocument } from './helpers/node-env';

const base = (): Design => parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));

function withOverride(d: Design, pageType: string, blockId: string, patch: Partial<Design['overrides'][number]>): Design {
  const next = structuredClone(d);
  next.overrides.push({ pageType, pageKey: null, blockId, dx: 0, dy: 0, dw: 0, dh: 0, scale: 1, rotation: 0, opacity: 1, hidden: false, ...patch });
  return parseDesign(next);
}

function find(doc: AgendaDocument, blockId: string): { index: number; type: string; block: Block } {
  for (let i = 0; i < doc.plan.pages.length; i++) {
    const block = doc.page(i).blocks.find((b) => b.id === blockId);
    if (block) return { index: i, type: doc.plan.pages[i]!.type, block };
  }
  throw new Error(`no hay bloque ${blockId}`);
}

describe('stretch: qué se estira y qué solo se mueve', () => {
  const from = { x: 10, y: 10, w: 20, h: 10 };
  const to = { x: 10, y: 10, w: 40, h: 30 };
  const stroke = { color: '#000', width: 0.3 };

  it('las líneas y los recuadros siguen la caja; el grosor del trazo no cambia', () => {
    const [ln, rc] = stretchPrims(
      [
        { t: 'line', x1: 10, y1: 20, x2: 30, y2: 20, stroke },
        { t: 'rect', x: 10, y: 10, w: 20, h: 10, stroke },
      ],
      from,
      to,
    ) as [Extract<Prim, { t: 'line' }>, Extract<Prim, { t: 'rect' }>];
    expect([ln.x1, ln.y1, ln.x2, ln.y2]).toEqual([10, 40, 50, 40]);
    expect([rc.x, rc.y, rc.w, rc.h]).toEqual([10, 10, 40, 30]);
    expect(ln.stroke.width).toBe(0.3);
    expect(rc.stroke?.width).toBe(0.3);
  });

  it('un círculo conserva su radio y acompaña su centro', () => {
    const [c] = stretchPrims([{ t: 'circle', cx: 20, cy: 15, r: 2, stroke }], from, to) as [Extract<Prim, { t: 'circle' }>];
    expect([c.cx, c.cy, c.r]).toEqual([30, 25, 2]);
  });

  it('un lado sin tamaño no se estira (línea horizontal) y la identidad no cambia nada', () => {
    const flat = { x: 0, y: 5, w: 10, h: 0 };
    const [ln] = stretchPrims([{ t: 'line', x1: 0, y1: 5, x2: 10, y2: 5, stroke }], flat, { ...flat, w: 30 }) as [Extract<Prim, { t: 'line' }>];
    expect([ln.x1, ln.y1, ln.x2, ln.y2]).toEqual([0, 5, 30, 5]);
    const same = [{ t: 'line', x1: 1, y1: 2, x2: 3, y2: 4, stroke } as const];
    expect(stretchPrims(same, from, from)).toEqual(same);
  });

  it('las zonas tocables se estiran con la misma correspondencia', () => {
    expect(stretchRect({ x: 20, y: 10, w: 10, h: 5 }, from, to)).toEqual({ x: 30, y: 10, w: 20, h: 15 });
    const m = boxMap(from, to);
    expect([m.sx, m.sy]).toEqual([2, 3]);
  });
});

describe('bloques con caja: el contenido se reacomoda', () => {
  it('el marco de la visión anual crece con su caja y lo de adentro lo sigue', async () => {
    const plain = await openDocument(base());
    const at = find(plain.doc, 'vision.frame');
    expect(at.block.box).toBeDefined();
    const wide = await openDocument(withOverride(base(), at.type, 'vision.frame', { dw: 12, dh: -8 }));
    const after = find(wide.doc, 'vision.frame');
    expect(after.block.box!.w).toBeCloseTo(at.block.box!.w + 12, 6);
    expect(after.block.box!.h).toBeCloseTo(at.block.box!.h - 8, 6);
    // El recuadro dibujado es la caja nueva.
    const drawn = primsBounds(after.block.prims)!;
    expect(drawn.w).toBeCloseTo(after.block.box!.w, 3);
    expect(drawn.h).toBeCloseTo(after.block.box!.h, 3);
  });

  it('el nombre del mes cambia de tamaño sin deformar las letras', async () => {
    const plain = await openDocument(base());
    const at = find(plain.doc, 'cover.month');
    const wide = await openDocument(withOverride(base(), at.type, 'cover.month', { dw: 20 }));
    const after = find(wide.doc, 'cover.month');
    const size = (b: Block): number => (b.prims.find((p) => p.t === 'text') as Extract<Prim, { t: 'text' }>).run.sizePt;
    expect(size(after.block)).toBeGreaterThan(0);
    expect(blockBounds(after.block).w).toBeGreaterThanOrEqual(blockBounds(at.block).w - 1e-6);
  });

  it('el desplazamiento de un bloque con caja se espeja en los versos', async () => {
    const plain = await openDocument(base());
    const recto = find(plain.doc, 'vision.frame');
    const next = withOverride(base(), recto.type, 'vision.frame', { dx: 4 });
    const moved = await openDocument(next);
    expect(blockBounds(find(moved.doc, 'vision.frame').block).x - blockBounds(recto.block).x).toBeCloseTo(recto.index % 2 === 0 ? 4 : -4, 6);
  });
});

describe('cobertura: qué bloques editables no tienen caja', () => {
  /**
   * Los que quedan sin caja se estiran con `stretch.ts` (o solo escalan, si van girados). Es una
   * lista cerrada: un bloque editable nuevo sin `ctx.rect` hace fallar esta prueba, y se decide
   * si lleva caja o entra aquí con su motivo.
   */
  const SIN_CAJA: { prefix: string; why: string }[] = [
    { prefix: 'guide.', why: 'texto corrido de la guía: el alto sale de su contenido' },
    { prefix: 'habits.', why: 'página dibujada girada: solo se mueve y se escala' },
    { prefix: 'week.title', why: 'una línea de texto: se mueve con su ancla' },
    { prefix: 'tasks.legend', why: 'iconos sueltos con su rótulo: se mueven con su ancla' },
  ];

  it('solo quedan los permitidos', async () => {
    for (const tpl of ['heritage-norma', 'clara', 'minimal'] as const) {
      const { doc } = await openDocument(parseDesign(createDesign(tpl, { year: 2027, locale: 'es-AR', country: 'AR' })));
      const missing = new Set<string>();
      doc.plan.pages.forEach((p, i) => {
        for (const b of doc.page(i).blocks) {
          if (!b.editable || b.box || b.role === 'custom' || b.role === 'watermark' || b.role === 'chrome') continue;
          if (SIN_CAJA.some((a) => b.id.startsWith(a.prefix))) continue;
          missing.add(`${p.type}:${b.id}`);
        }
      });
      expect([...missing].sort()).toEqual([]);
    }
  });
});

describe('ajuste guardado ↔ caja que se ve', () => {
  const natural = { x: 20, y: 30, w: 80, h: 40 };
  const shown = (a: { dx: number; dy: number; dw: number; dh: number }, mirror: boolean) => adjustBox(natural, { dx: mirror ? -(a.dx + a.dw) : a.dx, dy: a.dy, dw: a.dw, dh: a.dh });

  it.each([false, true])('guardar y volver a aplicar da la caja pedida (espejo: %s)', (mirror) => {
    const target = { x: 12, y: 33, w: 95, h: 52 };
    expect(shown(storeAdjust(natural, target, mirror), mirror)).toEqual(target);
  });

  it('la caja natural se recupera de la que se ve', () => {
    const applied = { dx: 3, dy: -2, dw: 10, dh: 5 };
    expect(naturalBox(adjustBox(natural, applied), applied)).toEqual(natural);
  });
});

describe('elementos dentro de la caja de otro', () => {
  it('la fila y el encabezado de la visión anual saben de qué marco salen', async () => {
    const { doc } = await openDocument(base());
    const at = find(doc, 'vision.frame');
    const page = doc.page(at.index);
    expect(page.blocks.find((b) => b.id === 'vision.head')!.parent).toBe('vision.frame');
    expect(page.blocks.find((b) => b.id === 'vision.row.0')!.parent).toBe('vision.frame');
    expect(page.blocks.find((b) => b.id === 'vision.frame')!.parent).toBeUndefined();
  });
});
