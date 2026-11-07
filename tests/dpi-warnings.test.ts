/** Avisos de resolución: poca (lowDpi, problema) y de más (overDpi, informativo), con el nombre de la imagen. */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { fixFor } from '../src/core/document/fixes';
import { isProblem, type PageWarning } from '../src/core/layout/prims';
import { toBase64 } from '../src/core/resources';
import { makePng } from './helpers/png';
import { openDocument } from './helpers/node-env';

/** Una página de título con la imagen de `px` píxeles en un elemento de `mm` de ancho. */
function withImage(px: number, mm: number, extra: Record<string, unknown> = {}): Design {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  return parseDesign({
    ...d,
    assets: [{ id: 'foto', name: 'Foto del equipo.png', kind: 'raster', mime: 'image/png', width: px, height: px, data: toBase64(makePng(px, px, [20, 90, 160])) }],
    customBlocks: [{ id: 'img', pageType: 'titlePage', pageKey: null, kind: 'image', x: 20, y: 30, w: mm, h: mm, mirror: false, props: { assetId: 'foto', ...extra } }],
  });
}

async function dpiWarnings(design: Design): Promise<PageWarning[]> {
  const { doc } = await openDocument(design);
  const index = doc.plan.pages.findIndex((p) => p.type === 'titlePage');
  return doc.pageWarnings(index).filter((w) => w.code === 'lowDpi' || w.code === 'overDpi');
}

describe('resolución de las imágenes', () => {
  it('a 254 ppp no hay aviso; con menos de 250 es lowDpi (un problema) y nombra la imagen', async () => {
    expect(await dpiWarnings(withImage(1000, 100))).toEqual([]);
    const low = await dpiWarnings(withImage(1000, 110));
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ code: 'lowDpi', params: { dpi: 231, name: 'Foto del equipo.png' } });
    expect(low[0]!.message).toContain('«Foto del equipo.png»');
    expect(isProblem(low[0]!)).toBe(true);
  });

  it('a más de 600 ppp es overDpi: informativo, con su arreglo', async () => {
    const over = await dpiWarnings(withImage(2000, 60));
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ code: 'overDpi', params: { dpi: 847, name: 'Foto del equipo.png' } });
    expect(isProblem(over[0]!)).toBe(false);
    expect(fixFor('overDpi')).toEqual(expect.any(String));
  });

  it('una imagen repetida a la misma resolución avisa una sola vez, y el borde exacto de 600 no avisa', async () => {
    expect(await dpiWarnings(withImage(2362, 100))).toEqual([]); // 600 ppp justos
    expect((await dpiWarnings(withImage(2400, 100))).map((w) => w.code)).toEqual(['overDpi']);
  });
});
