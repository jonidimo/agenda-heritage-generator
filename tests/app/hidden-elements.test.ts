/** Elementos ocultos de una página: se listan con su nombre y se devuelven sin dejar ajustes vacíos. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { showHiddenRecipe } from '../../src/app/state/actions';
import { createDesign } from '../../src/core/design/defaults';
import { BlockOverrideZ, parseDesign, WatermarkZ, type BlockOverride, type Design } from '../../src/core/design/schema';
import { openDocument } from '../helpers/node-env';

const base = (): Design => parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));

/** Un ajuste con todos sus valores por defecto (así un campo nuevo del esquema no rompe esta prueba). */
const override = (patch: Partial<BlockOverride> & Pick<BlockOverride, 'pageType' | 'blockId'>): BlockOverride => BlockOverrideZ.parse(patch);

async function firstMonthPage(design: Design) {
  const { doc } = await openDocument(design);
  const plan = doc.plan.pages.find((p) => p.type === 'monthLog')!;
  return { doc, plan, page: doc.page(plan.index) };
}

describe('elementos ocultos', () => {
  it('sin nada oculto la lista está vacía y no maqueta la página', async () => {
    const { doc, plan } = await firstMonthPage(base());
    expect(doc.hidden(plan.index)).toEqual([]);
  });

  it('un elemento oculto por tipo o por página se lista con el nombre que tenía en la página', async () => {
    const { doc: shown, plan, page } = await firstMonthPage(base());
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const byType = base();
    byType.overrides.push(override({ pageType: plan.type, blockId: target.id, hidden: true }));
    const a = await openDocument(byType);
    expect(a.doc.hidden(plan.index)).toEqual([{ id: target.id, label: target.label, scope: 'type', kind: 'block' }]);
    // Y la página, ya sin él.
    expect(a.doc.page(plan.index).blocks.some((b) => b.id === target.id)).toBe(false);

    const byPage = base();
    byPage.overrides.push(override({ pageType: plan.type, pageKey: plan.key, blockId: target.id, hidden: true }));
    const b = await openDocument(byPage);
    expect(b.doc.hidden(plan.index)[0]).toMatchObject({ id: target.id, scope: 'page' });
    // Otra página del mismo tipo lo sigue mostrando.
    const other = shown.plan.pages.find((p) => p.type === plan.type && p.key !== plan.key)!;
    expect(b.doc.hidden(other.index)).toEqual([]);
  });

  it('el ajuste de la página que lo muestra manda sobre el del tipo que lo oculta', async () => {
    const { plan, page } = await firstMonthPage(base());
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const d = base();
    d.overrides.push(override({ pageType: plan.type, blockId: target.id, hidden: true }), override({ pageType: plan.type, pageKey: plan.key, blockId: target.id, hidden: false, dx: 3 }));
    const { doc } = await openDocument(d);
    expect(doc.hidden(plan.index)).toEqual([]);
  });

  it('una marca de agua que se salta la página también figura', async () => {
    const d = base();
    d.assets.push({ id: 'a1', name: 'Colibrí', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null });
    const { plan } = await firstMonthPage(d);
    d.watermarks.push(WatermarkZ.parse({ id: 'w1', assetId: 'a1', excludePages: [plan.key] }));
    const { doc } = await openDocument(d);
    expect(doc.hidden(plan.index)).toEqual([{ id: 'wm.w1', label: 'Colibrí', scope: 'page', kind: 'watermark' }]);
  });
});

describe('mostrar lo oculto', () => {
  it('quita el ajuste cuando solo servía para ocultar, y conserva los demás cambios', async () => {
    const { plan, page } = await firstMonthPage(base());
    const [a, b] = page.blocks.filter((x) => x.editable && x.role !== 'chrome');
    const d = base();
    d.overrides.push(override({ pageType: plan.type, blockId: a!.id, hidden: true }), override({ pageType: plan.type, blockId: b!.id, hidden: true, dx: 4 }));
    const { doc } = await openDocument(d);
    const items = doc.hidden(plan.index);
    expect(items.map((i) => i.id).sort()).toEqual([a!.id, b!.id].sort());
    const out = produce(d, showHiddenRecipe(plan, items));
    expect(out.overrides.find((o) => o.blockId === a!.id)).toBeUndefined();
    expect(out.overrides.find((o) => o.blockId === b!.id)).toMatchObject({ hidden: false, dx: 4 });
    const again = await openDocument(parseDesign(out));
    expect(again.doc.hidden(plan.index)).toEqual([]);
  });

  it('si el tipo también lo oculta, el ajuste de la página queda para que siga a la vista', async () => {
    const { plan, page } = await firstMonthPage(base());
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const d = base();
    d.overrides.push(override({ pageType: plan.type, blockId: target.id, hidden: true }), override({ pageType: plan.type, pageKey: plan.key, blockId: target.id, hidden: true }));
    const { doc } = await openDocument(d);
    const items = doc.hidden(plan.index);
    expect(items[0]).toMatchObject({ scope: 'page' });
    const out = produce(d, showHiddenRecipe(plan, items));
    expect(out.overrides.filter((o) => o.blockId === target.id).map((o) => [o.pageKey, o.hidden])).toEqual([
      [null, true],
      [plan.key, false],
    ]);
    const after = await openDocument(parseDesign(out));
    expect(after.doc.hidden(plan.index)).toEqual([]);
    expect(after.doc.page(plan.index).blocks.some((b) => b.id === target.id)).toBe(true);
  });

  it('devuelve la marca de agua a la página y al tipo', async () => {
    const d = base();
    d.assets.push({ id: 'a1', name: 'Colibrí', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null });
    const { plan } = await firstMonthPage(d);
    d.watermarks.push(WatermarkZ.parse({ id: 'w1', assetId: 'a1', excludePages: [plan.key], exclude: [plan.type] }));
    const { doc } = await openDocument(d);
    const out = produce(d, showHiddenRecipe(plan, doc.hidden(plan.index)));
    expect(out.watermarks[0]!.excludePages).toEqual([]);
    expect(out.watermarks[0]!.exclude).not.toContain(plan.type);
    // Las demás exclusiones (las de otros tipos de página) no se tocan.
    expect(out.watermarks[0]!.exclude).toEqual(d.watermarks[0]!.exclude.filter((t) => t !== plan.type));
  });
});
