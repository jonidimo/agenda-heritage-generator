/** Capas: orden de apilado, nombre propio y modo de fusión de un elemento (en pantalla, en SVG y en el PDF). */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { pageInnerSvg } from '../src/core/render/svg';
import { pagePrims } from '../src/core/document/layout';
import { ov } from './helpers/overrides';
import { openDocument } from './helpers/node-env';

const base = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

async function monthPage(d: Design) {
  const { doc } = await openDocument(d);
  const plan = doc.plan.pages.find((p) => p.type === 'monthLog')!;
  return { doc, plan, page: doc.page(plan.index) };
}

describe('capas', () => {
  it('sin ajustes de capa, nada cambia: ni orden, ni nombre, ni fusión', async () => {
    const { page } = await monthPage(base());
    expect(page.blocks.every((b) => b.blend === undefined)).toBe(true);
    expect([...page.blocks].map((b) => b.layer)).toEqual([...page.blocks].map((b) => b.layer).sort((a, b) => a - b));
  });

  it('una capa propia mueve el elemento en el apilado', async () => {
    const { plan, page } = await monthPage(base());
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const top = Math.max(...page.blocks.map((b) => b.layer));
    const { page: after } = await monthPage(base((d) => void d.overrides.push(ov({ pageType: plan.type, blockId: target.id, layer: top + 5 }))));
    expect(after.blocks.at(-1)!.id).toBe(target.id);
    const { page: below } = await monthPage(base((d) => void d.overrides.push(ov({ pageType: plan.type, blockId: target.id, layer: -5 }))));
    expect(below.blocks[0]!.id).toBe(target.id);
    // Los demás conservan su orden relativo.
    expect(after.blocks.slice(0, -1).map((b) => b.id)).toEqual(page.blocks.filter((b) => b.id !== target.id).map((b) => b.id));
  });

  it('un nombre propio reemplaza al de la sección (en el bloque y en sus avisos)', async () => {
    const { plan, page } = await monthPage(base());
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const { page: after } = await monthPage(base((d) => void d.overrides.push(ov({ pageType: plan.type, blockId: target.id, label: 'Mi bloque' }))));
    expect(after.blocks.find((b) => b.id === target.id)!.label).toBe('Mi bloque');
    // Sin nombre (o vacío) vuelve el de la sección.
    const { page: blank } = await monthPage(base((d) => void d.overrides.push(ov({ pageType: plan.type, blockId: target.id, label: null }))));
    expect(blank.blocks.find((b) => b.id === target.id)!.label).toBe(target.label);
  });

  it('un valor de capa fuera de rango se acomoda al límite', () => {
    expect(ov({ pageType: 'x', blockId: 'y', layer: 99999 }).layer).toBe(1000);
    expect(ov({ pageType: 'x', blockId: 'y', layer: -99999 }).layer).toBe(-1000);
    expect(ov({ pageType: 'x', blockId: 'y' }).layer).toBeNull();
  });
});

describe('modo de fusión', () => {
  async function withBlend(mode: 'multiply' | 'screen') {
    const { plan, page } = await monthPage(base());
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const d = base((x) => void x.overrides.push(ov({ pageType: plan.type, blockId: target.id, blend: mode })));
    const out = await monthPage(d);
    return { ...out, target };
  }

  it('el bloque lo lleva, y la página lo dibuja en un grupo con ese modo', async () => {
    const { page, target } = await withBlend('multiply');
    expect(page.blocks.find((b) => b.id === target.id)!.blend).toBe('multiply');
    const groups = pagePrims(page).filter((p) => p.t === 'group' && p.blend === 'multiply');
    expect(groups).toHaveLength(1);
    // Con otros bloques sin fusión, nada más lleva modo.
    expect(pagePrims(page).filter((p) => p.t === 'group' && p.blend !== undefined)).toHaveLength(1);
  });

  it('el SVG de la vista previa lo dice con mix-blend-mode, y sin fusión no aparece', async () => {
    const { page, doc } = await withBlend('screen');
    const svg = pageInnerSvg(page, { fonts: doc.ctx.fonts, assetHref: () => '', blockAttrs: true }).body;
    expect(svg).toContain('style="mix-blend-mode:screen"');
    const plain = await monthPage(base());
    expect(pageInnerSvg(plain.page, { fonts: plain.doc.ctx.fonts, assetHref: () => '', blockAttrs: true }).body).not.toContain('mix-blend-mode');
  });

  it('el PDF declara el estado gráfico de fusión solo cuando hay un elemento que lo usa', async () => {
    const { doc, plan } = await withBlend('multiply');
    const bytes = await doc.exportPdf('pages', { assetBytes: () => undefined, pages: [plan.index] });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toMatch(/\/BM\s*\/Multiply/);
    const plain = await monthPage(base());
    const plainBytes = await plain.doc.exportPdf('pages', { assetBytes: () => undefined, pages: [plain.plan.index] });
    expect(new TextDecoder('latin1').decode(plainBytes)).not.toMatch(/\/BM\s*\//);
  });
});
