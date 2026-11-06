/** Imagen propia en la portada del mes: la del mes manda sobre la de todos, y quitar la imagen la saca. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { monthCoverImageRecipe } from '../../src/app/state/sections';
import { assetUses, removeAssetFrom } from '../../src/core/design/assetUse';
import { createDesign } from '../../src/core/design/defaults';
import { parseDesign, type Design } from '../../src/core/design/schema';
import { coverImageFor } from '../../src/core/sections/month';
import { openDocument } from '../helpers/node-env';

const svg = (color: string) => btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${color}"/></svg>`);
const withImages = (): Design => {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  d.assets.push({ id: 'a', name: 'A', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null, data: svg('#112233') });
  d.assets.push({ id: 'b', name: 'B', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null, data: svg('#445566') });
  return parseDesign(d);
};
const coverId = (d: Design) => d.sections.find((s) => s.type === 'months')!.items!.find((i) => i.type === 'monthCover')!.id;
const apply = (d: Design, r: (x: Design) => void) => produce(d, (x) => void r(x as Design));

describe('imagen en la portada del mes', () => {
  it('la del mes manda sobre la de todos; un valor raro se ignora', () => {
    expect(coverImageFor({ default: 'a', '2027-03': 'b' }, '2027-03')).toBe('b');
    expect(coverImageFor({ default: 'a', '2027-03': 'b' }, '2027-04')).toBe('a');
    expect(coverImageFor({ '2027-03': 7 }, '2027-03')).toBeUndefined();
    expect(coverImageFor(['a'], '2027-03')).toBeUndefined();
  });

  it('la imagen reemplaza al recuadro del sticker, y sin imagen vuelve el recuadro', async () => {
    let d = withImages();
    const id = coverId(d);
    d = apply(d, monthCoverImageRecipe(id, 'default', 'a'));
    d = apply(d, monthCoverImageRecipe(id, '2027-03', 'b'));
    const { doc } = await openDocument(d);
    const colorsOn = (month: string) => {
      const p = doc.plan.pages.find((x) => x.type === 'monthCover' && x.group === `month:${month}`)!;
      return JSON.stringify(doc.page(p.index).blocks.find((b) => b.id === 'cover.sticker')!.prims);
    };
    expect(colorsOn('2027-03')).toContain('#445566');
    expect(colorsOn('2027-04')).toContain('#112233');
    // «Todos los meses» deja de lado lo de cada mes.
    const all = apply(d, monthCoverImageRecipe(id, 'default', 'b'));
    expect(all.sections.find((s) => s.type === 'months')!.items!.find((i) => i.id === id)!.options.images).toEqual({ default: 'b' });
    const none = apply(apply(d, monthCoverImageRecipe(id, 'default', null)), monthCoverImageRecipe(id, '2027-03', null));
    expect(none.sections.find((s) => s.type === 'months')!.items!.find((i) => i.id === id)!.options).not.toHaveProperty('images');
  });

  it('dónde se usa una imagen incluye las portadas, y quitarla las deja con el sticker', () => {
    let d = withImages();
    const id = coverId(d);
    d = apply(d, monthCoverImageRecipe(id, '2027-03', 'b'));
    expect(assetUses(d, 'b')).toEqual([{ kind: 'monthCover', sectionId: id, months: ['2027-03'] }]);
    const gone = apply(d, (x) => removeAssetFrom(x, 'b'));
    expect(gone.sections.find((s) => s.type === 'months')!.items!.find((i) => i.id === id)!.options).not.toHaveProperty('images');
  });
});
