/** La biblioteca de íconos: cada uno existe y se importa limpio, se usa por nombre sin declararlo y se tiñe. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveAssets, iconAsset, iconIdOf, ICONS, searchIcons } from '../src/core/assets/icons';
import { importSvg } from '../src/core/assets/svg';
import { createDesign } from '../src/core/design/defaults';
import { designCatalogue } from '../src/core/design/jsonSchema';
import { parseDesign, type Design } from '../src/core/design/schema';
import type { Prim } from '../src/core/layout/prims';
import { openDocument, ROOT } from './helpers/node-env';

const DIR = join(ROOT, 'public', 'icons', 'lucide');

/** Una agenda con un elemento imagen en la portada interior. */
function withImage(props: Record<string, unknown>): Design {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  d.customBlocks.push({ id: 'ico', pageType: 'titlePage', pageKey: null, kind: 'image', x: 20, y: 20, w: 20, h: 20, mirror: true, props });
  return parseDesign(d);
}

const colorsOf = (prims: readonly Prim[]): string[] => prims.flatMap((p) => (p.t === 'group' ? colorsOf(p.children) : p.t === 'path' ? [p.fill?.color, p.stroke?.color].filter((c): c is string => Boolean(c)) : []));

describe('íconos', () => {
  it('la carpeta tiene exactamente los de la lista, y cada uno se importa sin avisos', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort();
    expect(files).toEqual(ICONS.map((i) => `${i.id}.svg`).sort());
    expect(new Set(ICONS.map((i) => i.id)).size).toBe(ICONS.length);
    for (const icon of ICONS) {
      const v = importSvg(readFileSync(join(DIR, `${icon.id}.svg`), 'utf8'));
      expect(v.warnings, icon.id).toEqual([]);
      expect(v.items.length, icon.id).toBeGreaterThan(0);
    }
    expect(readFileSync(join(DIR, 'LICENSE.txt'), 'utf8')).toMatch(/ISC/);
  });

  it('«icon:<id>» se usa sin declararlo; un nombre que no existe avisa', async () => {
    const d = withImage({ assetId: 'icon:trophy' });
    expect(effectiveAssets(d).map((a) => a.id)).toContain('icon:trophy');
    const { doc } = await openDocument(d);
    const title = doc.plan.pages.find((p) => p.type === 'titlePage')!;
    expect(doc.pageWarnings(title.index)).toEqual([]);
    const block = doc.page(title.index).blocks.find((b) => b.id === 'custom.ico')!;
    expect(colorsOf(block.prims).length).toBeGreaterThan(0);
    const bad = await openDocument(withImage({ assetId: 'icon:no-existe' }));
    expect(bad.doc.pageWarnings(title.index).map((w) => w.code)).toContain('missingAsset');
    expect(iconIdOf('icon:no-existe')).toBeNull();
  });

  it('un ícono declarado no se duplica, y uno usado como ornamento también se carga', () => {
    const d = withImage({ assetId: 'icon:heart' });
    d.assets.push(iconAsset('heart'));
    expect(effectiveAssets(d).filter((a) => a.id === 'icon:heart')).toHaveLength(1);
    const orn = withImage({});
    orn.theme.tokens = { lines: { separator: { ornament: 'asset:icon:leaf' } } };
    expect(effectiveAssets(orn).map((a) => a.id)).toContain('icon:leaf');
  });

  it('con «color», todo el dibujo toma ese color', async () => {
    const { doc } = await openDocument(withImage({ assetId: 'icon:star', color: '#c0392b' }));
    const title = doc.plan.pages.find((p) => p.type === 'titlePage')!;
    const block = doc.page(title.index).blocks.find((b) => b.id === 'custom.ico')!;
    expect(new Set(colorsOf(block.prims))).toEqual(new Set(['#c0392b']));
  });

  it('se buscan por palabras en los cuatro idiomas, sin importar tildes', () => {
    expect(searchIcons('corazon').map((i) => i.id)).toContain('heart');
    expect(searchIcons('trophy').map((i) => i.id)).toEqual(['trophy']);
    expect(searchIcons('cuore').map((i) => i.id)).toContain('heart');
    expect(searchIcons('')).toHaveLength(ICONS.length);
  });

  it('el catálogo los lista, con las formas', () => {
    const cat = designCatalogue() as { icons: string[]; shapes: Array<{ shape: string }> };
    expect(cat.icons).toContain('icon:trophy');
    expect(cat.shapes.map((s) => s.shape)).toContain('star');
  });
});
