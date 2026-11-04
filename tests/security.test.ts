/**
 * Seguridad: un archivo de diseño o una imagen SVG manipulados no pueden inyectar marcado en
 * la vista previa, y un tema malformado no deja la agenda sin abrir.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { importSvg } from '../src/core/assets/svg';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { pruneTokens, resolveTheme } from '../src/core/design/themes';
import { pageToSvg, primsToStandaloneSvg } from '../src/core/render/svg';
import { openDocument, sharedFonts } from './helpers/node-env';

const PAYLOAD = 'red"/><image href="x" onerror="document.title=\'PWNED\'"/><rect fill="red';

describe('colores de archivos', () => {
  it('un color con marcado en el tema no llega al diseño ni a la vista previa', async () => {
    const raw = JSON.parse(JSON.stringify(createDesign('heritage-norma', { year: 2027 })));
    raw.theme.tokens = { colors: { ink: PAYLOAD, rule: '#ABC' }, sizes: { body: 'grande' }, fonts: { body: null }, __proto__: { x: 1 } };
    const d = parseDesign(raw);
    expect(d.theme.tokens).toEqual({ colors: { rule: '#aabbcc' } });
    const { doc } = await openDocument(d);
    for (const i of [0, 3, 55, 56]) {
      const svg = pageToSvg(doc.page(i), { fonts: doc.ctx.fonts });
      expect(svg).not.toContain('onerror');
      expect(svg).not.toContain('<image');
    }
  });

  it('el dibujante escapa cualquier texto en atributos', async () => {
    const svg = primsToStandaloneSvg(10, 10, [{ t: 'rect', x: 0, y: 0, w: 5, h: 5, fill: { color: PAYLOAD } }], { fonts: await sharedFonts() });
    expect(svg).not.toContain('<image');
    expect(svg).toContain('&quot;');
  });

  it('un SVG importado con un color manipulado se normaliza', () => {
    const v = importSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#a&quot; x=&quot;"/></svg>');
    const colors = JSON.stringify(v);
    expect(colors).not.toContain('"#a');
  });

  it('elementos propios con colores inválidos usan el color del tema', async () => {
    const d = parseDesign(createDesign('heritage', { year: 2027 }));
    d.customBlocks.push({ id: 'x', pageType: 'notes', pageKey: null, kind: 'rect', x: 20, y: 20, w: 30, h: 20, mirror: true, props: { fill: PAYLOAD } });
    const { doc } = await openDocument(d);
    const i = doc.plan.pages.findIndex((p) => p.type === 'notes');
    expect(pageToSvg(doc.page(i), { fonts: doc.ctx.fonts })).not.toContain('<image');
  });
});

describe('temas malformados', () => {
  it('valores de tipo equivocado o fuera de rango se descartan o acomodan', () => {
    expect(pruneTokens({ colors: null, fonts: { body: null, title: { weight: 5000, style: 'oblique' } }, writing: { style: 'zigzag', pitch: 0 }, unknown: 1 })).toEqual({
      fonts: { title: { weight: 1000 } },
      writing: { pitch: 2 },
    });
    const t = resolveTheme('heritage', { colors: null, fonts: { body: null }, sizes: { body: 'x' } } as Record<string, unknown>, 'normal');
    expect(typeof t.colors.ink).toBe('string');
    expect(t.fonts.body.family).toBeTruthy();
    expect(typeof t.sizes.body).toBe('number');
  });

  it('una agenda con tokens rotos se abre y diagrama sin avisos', async () => {
    const raw = JSON.parse(JSON.stringify(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' })));
    raw.theme.tokens = { colors: null, fonts: { body: null }, sizes: { body: 'x', label: 'y' }, writing: { pitch: '436' } };
    const { doc } = await openDocument(parseDesign(raw));
    expect(doc.warnings().filter((w) => w.code !== 'abbreviated')).toEqual([]);
  });
});

describe('validación sin evaluar código', () => {
  it('zod no compila validadores con new Function (la política de seguridad lo prohíbe)', () => {
    // El esquema lo fija al cargarse; si no, el navegador registra una violación en cada arranque.
    expect(parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' })).calendar.year).toBe(2027);
    expect(z.config().jitless).toBe(true);
  });
});
