/** Cuánto mide, impresa, cada imagen: el mayor tamaño en que aparece en alguna página (o en la tapa). */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { imagePlacements } from '../src/core/document/imageUse';
import { imagesIn } from '../src/core/document/layout';
import { formatBytes } from '../src/core/util/bytes';
import { toBase64 } from '../src/core/resources';
import { makePng } from './helpers/png';
import { openDocument } from './helpers/node-env';

const PNG = toBase64(makePng(300, 300, [10, 120, 60]));
const asset = (id: string) => ({ id, name: `${id}.png`, kind: 'raster', mime: 'image/png', width: 300, height: 300, data: PNG });
const block = (id: string, pageType: string, w: number, assetId = 'foto') => ({ id, pageType, pageKey: null, kind: 'image', x: 20, y: 30, w, h: w, mirror: false, props: { assetId } });

function design(extra: Record<string, unknown> = {}): Design {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  return parseDesign({ ...d, assets: [asset('foto'), asset('otra')], watermarks: [], ...extra });
}

describe('imagePlacements', () => {
  it('toma el mayor tamaño: un elemento de 40 mm y una marca de agua de 14 mm de la misma imagen son 40', async () => {
    const d = design({
      customBlocks: [block('grande', 'titlePage', 40)],
      watermarks: [{ id: 'w', assetId: 'foto', scope: ['all'], width: 14, opacity: 1 }],
    });
    const { doc } = await openDocument(d);
    const placed = imagePlacements(doc).get('foto');
    expect(placed?.maxWmm).toBeCloseTo(40, 1);
    expect(placed?.maxHmm).toBeCloseTo(40, 1);
  });

  it('solo cuenta las páginas pedidas, y una imagen que no se usa no figura', async () => {
    const { doc } = await openDocument(design({ customBlocks: [block('solo', 'titlePage', 30)] }));
    const title = doc.plan.pages.findIndex((p) => p.type === 'titlePage');
    const other = doc.plan.pages.findIndex((p) => p.type !== 'titlePage');
    expect(imagePlacements(doc, { pages: [title] }).get('foto')?.maxWmm).toBeCloseTo(30, 1);
    expect(imagePlacements(doc, { pages: [other] }).has('foto')).toBe(false);
    expect(imagePlacements(doc).has('otra')).toBe(false);
    // Un índice que no existe se ignora.
    expect(imagePlacements(doc, { pages: [-1, 99999] }).size).toBe(0);
  });

  it('la imagen de la tapa solo cuenta si se pide', async () => {
    const { doc } = await openDocument(design({ cover: { ...design().cover, imageAssetId: 'otra' } }));
    expect(imagePlacements(doc).has('otra')).toBe(false);
    const withCover = imagePlacements(doc, { cover: true, noPages: true });
    expect(withCover.get('otra')?.maxWmm).toBeGreaterThan(20);
    expect(withCover.has('foto')).toBe(false);
  });

  it('el elemento agrandado con su escala propia cuenta con esa escala', async () => {
    const d = design({
      customBlocks: [block('escalado', 'titlePage', 20)],
      overrides: [{ pageType: 'titlePage', pageKey: null, blockId: 'custom.escalado', dx: 0, dy: 0, dw: 0, dh: 0, scale: 2, scaleY: null, deform: false, rotation: 0, opacity: 1, hidden: false, layer: null, label: null, blend: 'normal', locked: false }],
    });
    const { doc } = await openDocument(d);
    expect(imagePlacements(doc).get('foto')?.maxWmm).toBeCloseTo(40, 1);
  });
});

describe('imagesIn', () => {
  const image = (w: number, h: number) => ({ t: 'image' as const, asset: 'a', x: 0, y: 0, w, h });
  it('un dibujo estirado mide su ancho y su alto por separado (no una sola escala)', () => {
    // 2× a lo ancho y 0,5× a lo alto: la raíz del determinante daría 1 y la imagen de 100×100 parecería de 100×100.
    const stretched = [{ t: 'group' as const, m: [2, 0, 0, 0.5, 0, 0] as const, children: [image(100, 100)] }];
    expect(imagesIn(stretched)).toEqual([{ asset: 'a', w: 200, h: 50 }]);
  });

  it('compone los grupos anidados y la matriz del bloque; un giro de 90° intercambia los ejes', () => {
    const nested = [{ t: 'group' as const, m: [2, 0, 0, 1, 0, 0] as const, children: [{ t: 'group' as const, m: [1, 0, 0, 3, 0, 0] as const, children: [image(10, 10)] }] }];
    expect(imagesIn(nested)).toEqual([{ asset: 'a', w: 20, h: 30 }]);
    const [turned] = imagesIn([image(40, 10)], [0, 1, -1, 0, 0, 0]);
    expect(turned).toMatchObject({ w: 40, h: 10 });
    const [outer] = imagesIn([image(10, 10)], [3, 0, 0, 2, 5, 5]);
    expect(outer).toMatchObject({ w: 30, h: 20 });
  });
});

describe('formatBytes', () => {
  it('KB hasta el mega, y MB con un decimal', () => {
    expect(formatBytes(0)).toBe('1 KB');
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(1.234 * 1024 * 1024)).toBe('1.2 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
    expect(formatBytes(Number.NaN)).toBe('0 KB');
  });
});
