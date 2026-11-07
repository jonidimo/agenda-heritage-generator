/** Exportar el PDF con la resolución de imágenes pedida: las que sobran se achican, las demás quedan como están. */
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { defaultImageDpi } from '../src/core/document';
import { cachedResampler, type ImageResampler } from '../src/core/assets/resample';
import { toBase64 } from '../src/core/resources';
import { nodeResampler } from '../src/node/resample';
import { openDocument, ROOT } from './helpers/node-env';

const FOTO = new Uint8Array(readFileSync(join(ROOT, 'docs/images/tapa.jpg')));

function design(mm: number, extra: Record<string, unknown> = {}): Design {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  return parseDesign({
    ...d,
    assets: [{ id: 'foto', name: 'tapa.jpg', kind: 'raster', mime: 'image/jpeg', width: 951, height: 1280, data: toBase64(FOTO) }],
    watermarks: [],
    customBlocks: [{ id: 'img', pageType: 'titlePage', pageKey: null, kind: 'image', x: 20, y: 20, w: mm, h: mm * (1280 / 951), mirror: false, props: { assetId: 'foto' } }],
    ...extra,
  });
}

/** Los anchos (px) de los objetos de imagen del PDF. */
async function embeddedWidths(pdf: Uint8Array): Promise<number[]> {
  const loaded = await PDFDocument.load(pdf);
  const widths: number[] = [];
  for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) widths.push((obj.dict.get(PDFName.of('Width')) as PDFNumber).asNumber());
  }
  return widths;
}

async function exportTitle(d: Design, imageDpi: 'original' | 300 | 150 | undefined, resample: ImageResampler | null = nodeResampler) {
  const { doc, bytes } = await openDocument(d);
  const page = doc.plan.pages.findIndex((p) => p.type === 'titlePage');
  return doc.exportPdf('pages', { assetBytes: (id) => bytes.get(id), pages: [page], ...(imageDpi !== undefined ? { imageDpi } : {}), ...(resample ? { resample } : {}) });
}

describe('resolución de las imágenes al exportar', () => {
  it('una foto en una caja chica se achica a 300 ppp: menos píxeles y un PDF mucho más liviano', async () => {
    const small = design(40); // 40 mm de ancho: a 300 ppp hacen falta 473 px de 951
    const original = await exportTitle(small, 'original');
    const at300 = await exportTitle(small, 300);
    expect(await embeddedWidths(original)).toEqual([951]);
    expect(await embeddedWidths(at300)).toEqual([473]);
    expect(at300.length).toBeLessThan(original.length * 0.6);
  });

  it('a 150 ppp se achica más que a 300', async () => {
    const small = design(40);
    const [w150] = await embeddedWidths(await exportTitle(small, 150));
    expect(w150).toBe(237);
  });

  it('sin resolución pedida, o sin quien remuestree, queda igual que el original', async () => {
    const small = design(40);
    const original = await exportTitle(small, 'original');
    expect((await exportTitle(small, undefined)).length).toBe(original.length);
    expect((await exportTitle(small, 300, null)).length).toBe(original.length);
  });

  it('una imagen que ya tiene lo justo no se toca: a 100 mm, 951 px son 241 ppp', async () => {
    const big = design(100);
    expect(await embeddedWidths(await exportTitle(big, 300))).toEqual([951]);
  });

  it('si quien remuestrea falla o devuelve algo peor, queda la imagen original', async () => {
    const small = design(40);
    const failing: ImageResampler = async () => {
      throw new Error('sin memoria');
    };
    const heavier: ImageResampler = async (bytes) => new Uint8Array(bytes.length + 10);
    expect(await embeddedWidths(await exportTitle(small, 300, failing))).toEqual([951]);
    expect(await embeddedWidths(await exportTitle(small, 300, heavier))).toEqual([951]);
  });

  it('solo cuentan las páginas que se exportan: la imagen en otra página no se achica por un tamaño que acá no se usa', async () => {
    // Una caja grande en la tapa de mes y una chica en la de título: al exportar solo el título, manda la chica.
    const d = design(40, {
      customBlocks: [
        { id: 'a', pageType: 'titlePage', pageKey: null, kind: 'image', x: 20, y: 20, w: 40, h: 54, mirror: false, props: { assetId: 'foto' } },
        { id: 'b', pageType: 'weekLeft', pageKey: null, kind: 'image', x: 5, y: 20, w: 120, h: 160, mirror: false, props: { assetId: 'foto' } },
      ],
    });
    expect(await embeddedWidths(await exportTitle(d, 300))).toEqual([473]);
  });

  it('con caché, la misma imagen en varias páginas se achica una vez', async () => {
    let calls = 0;
    const counting: ImageResampler = (...args) => {
      calls++;
      return nodeResampler(...args);
    };
    const cached = cachedResampler(counting);
    const small = design(40);
    await exportTitle(small, 300, cached);
    await exportTitle(small, 300, cached);
    expect(calls).toBe(1);
  });

  it('el defecto: 300 para imprimir, 150 para pantalla', () => {
    expect(defaultImageDpi(design(40).binding)).toBe(300);
    expect(defaultImageDpi(parseDesign({ ...design(40), binding: { ...design(40).binding, target: 'screen' } }).binding)).toBe(150);
  });
});
