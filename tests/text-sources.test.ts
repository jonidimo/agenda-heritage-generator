/**
 * Texto editable en su lugar: cada bloque con texto dice de qué propiedad del diseño sale, y leer o
 * escribir ese origen cambia exactamente esa propiedad. También el alto automático de los textos propios.
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { readTextSource, writeTextSource } from '../src/core/design/textSource';
import { resolveStrings } from '../src/core/i18n';
import type { TextSource } from '../src/core/layout/prims';
import { openDocument } from './helpers/node-env';

const base = resolveStrings('es-AR');
const norma = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR', name: 'Norma' }));
  patch(d);
  return parseDesign(d);
};

async function sourcesOn(design: Design, type: string): Promise<Map<string, TextSource>> {
  const { doc } = await openDocument(design);
  const i = doc.plan.pages.findIndex((p) => p.type === type);
  expect(i, `hay una página ${type}`).toBeGreaterThanOrEqual(0);
  return new Map(doc.page(i).blocks.flatMap((b): Array<[string, TextSource]> => (b.text ? [[b.id, b.text]] : [])));
}

describe('origen del texto de cada bloque', () => {
  it('portada: nombre, título, subtítulo y rótulo inferior', async () => {
    const s = await sourcesOn(norma((d) => void (d.persona.subtitle = 'Año nuevo')), 'titlePage');
    expect(s.get('title.name')).toEqual({ kind: 'persona', field: 'name' });
    expect(s.get('title.title')).toEqual({ kind: 'persona', field: 'title' });
    expect(s.get('title.subtitle')).toEqual({ kind: 'persona', field: 'subtitle' });
    expect(s.get('title.kicker')).toEqual({ kind: 'label', path: 'titlePage.kicker' });
  });

  it('dedicatoria, frase del mes y títulos de página con su ruta de rótulo', async () => {
    const d = norma((x) => void ((x.persona.dedicationTitle = 'Para {name}'), (x.persona.dedication = 'Feliz {year}')));
    expect([...(await sourcesOn(d, 'dedication'))]).toEqual(
      expect.arrayContaining([
        ['dedication.title', { kind: 'persona', field: 'dedicationTitle' }],
        ['dedication.body', { kind: 'persona', field: 'dedication' }],
      ]),
    );
    expect((await sourcesOn(d, 'monthCover')).get('cover.phrase')).toEqual({ kind: 'phrase', index: 0 });
    expect((await sourcesOn(d, 'passwords')).get('header.title')).toEqual({ kind: 'label', path: 'passwords.title' });
    expect((await sourcesOn(d, 'contacts')).get('header.title')).toEqual({ kind: 'label', path: 'contacts.title' });
  });

  it('elementos propios de texto, páginas propias y plantillas', async () => {
    const d = norma((x) => {
      x.customBlocks.push({ id: 'abc', pageType: 'weekLeft', pageKey: null, kind: 'text', x: 20, y: 20, w: 50, h: 10, mirror: true, props: { text: 'Hola' } });
      x.customPages.push({ id: 'pp', after: null, fallback: null, startOn: 'any', title: 'Mi página', content: { kind: 'text', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'blank', text: 'Texto', rotation: 0, opacity: 1 } });
      x.pageTemplates.push({ id: 'tp', title: 'Plantilla', showTitle: true, content: { kind: 'text', assetId: null, pdfPage: 1, fit: 'contain', area: 'content', background: 'blank', text: 'Cuerpo', rotation: 0, opacity: 1 } });
      x.sections.push({ id: 'sec-tp', type: 'pageTemplate', enabled: true, repeat: 'month', options: { template: 'tp', pages: 1 } });
    });
    expect((await sourcesOn(d, 'weekLeft')).get('custom.abc')).toEqual({ kind: 'custom', id: 'abc' });
    const page = await sourcesOn(d, 'custom');
    expect(page.get('custom.title')).toEqual({ kind: 'page', id: 'pp', field: 'title' });
    expect(page.get('custom.text')).toEqual({ kind: 'page', id: 'pp', field: 'text' });
    const tpl = await sourcesOn(d, 'tpl:tp');
    expect(tpl.get('header.title')).toEqual({ kind: 'template', id: 'tp', field: 'title' });
    expect(tpl.get('custom.text')).toEqual({ kind: 'template', id: 'tp', field: 'text' });
  });

  it('los nombres de mes y los números no tienen origen', async () => {
    const s = await sourcesOn(norma(), 'monthCover');
    expect(s.has('cover.month')).toBe(false);
    expect(s.has('title.year')).toBe(false);
  });
});

describe('leer y escribir un origen', () => {
  it('persona: el título igual al del idioma se guarda vacío', () => {
    const d = norma();
    const src: TextSource = { kind: 'persona', field: 'title' };
    expect(readTextSource(d, src, base)).toBe(base.titlePage.title);
    writeTextSource(d, src, 'Mi agenda', base);
    expect(d.persona.title).toBe('Mi agenda');
    writeTextSource(d, src, base.titlePage.title, base);
    expect(d.persona.title).toBe('');
  });

  it('rótulo: igual al del idioma borra la clave, distinto la guarda', () => {
    const d = norma();
    const src: TextSource = { kind: 'label', path: 'pages.sleep.title' };
    writeTextSource(d, src, 'Descanso', base);
    expect(d.persona.labels['pages.sleep.title']).toBe('Descanso');
    expect(readTextSource(d, src, base)).toBe('Descanso');
    writeTextSource(d, src, base.pages.sleep.title, base);
    expect('pages.sleep.title' in d.persona.labels).toBe(false);
  });

  it('frase: al cambiar una se guardan las doce', () => {
    const d = norma((x) => void (x.persona.phrases = []));
    writeTextSource(d, { kind: 'phrase', index: 3 }, 'Mi frase', base);
    expect(d.persona.phrases).toHaveLength(12);
    expect(d.persona.phrases[3]).toBe('Mi frase');
    expect(d.persona.phrases[0]).toBe(base.phrases[0]);
    expect(readTextSource(d, { kind: 'phrase', index: 3 }, base)).toBe('Mi frase');
  });

  it('elemento, página propia y plantilla; un origen que ya no existe no hace nada', () => {
    const d = norma((x) => {
      x.customBlocks.push({ id: 'abc', pageType: 'weekLeft', pageKey: null, kind: 'text', x: 0, y: 0, w: 10, h: 10, mirror: true, props: { text: 'a', size: 9 } });
    });
    writeTextSource(d, { kind: 'custom', id: 'abc' }, 'b', base);
    expect(d.customBlocks[0]!.props).toEqual({ text: 'b', size: 9 });
    const before = JSON.stringify(d);
    writeTextSource(d, { kind: 'custom', id: 'nada' }, 'x', base);
    writeTextSource(d, { kind: 'page', id: 'nada', field: 'title' }, 'x', base);
    writeTextSource(d, { kind: 'template', id: 'nada', field: 'text' }, 'x', base);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('alto automático de un texto propio', () => {
  const withText = async (text: string, auto: boolean): Promise<number> => {
    const d = norma((x) => {
      x.customBlocks.push({ id: 'abc', pageType: 'weekLeft', pageKey: null, kind: 'text', x: 20, y: 20, w: 40, h: 30, mirror: false, props: { text, size: 10, ...(auto ? { autoHeight: true } : {}) } });
    });
    const { doc } = await openDocument(d);
    const i = doc.plan.pages.findIndex((p) => p.type === 'weekLeft');
    return doc.page(i).blocks.find((b) => b.id === 'custom.abc')!.bbox.h;
  };

  it('sigue a los renglones y, apagado, conserva la altura guardada', async () => {
    const short = await withText('Una línea', true);
    const long = await withText('Un texto bastante más largo que tiene que partirse en varios renglones al entrar en una caja angosta de cuarenta milímetros', true);
    expect(long).toBeGreaterThan(short * 2);
    expect(await withText('Una línea', false)).toBe(30);
    expect(await withText('Un texto bastante más largo que tiene que partirse en varios renglones al entrar en una caja angosta de cuarenta milímetros', false)).toBe(30);
  });
});

describe('correcciones de la revisión', () => {
  it('un texto de alto automático con valign centrado o abajo queda en su lugar', async () => {
    for (const valign of ['middle', 'bottom']) {
      const d = norma((x) => {
        x.customBlocks.push({ id: 'abc', pageType: 'weekLeft', pageKey: null, kind: 'text', x: 20, y: 40, w: 40, h: 30, mirror: false, props: { text: 'Hola', size: 10, autoHeight: true, valign } });
      });
      const { doc } = await openDocument(d);
      const i = doc.plan.pages.findIndex((p) => p.type === 'weekLeft');
      const b = doc.page(i).blocks.find((x) => x.id === 'custom.abc')!;
      expect(b.bbox.y).toBe(40);
      expect(doc.page(i).blocks.find((x) => x.id === 'custom.abc')!.prims.every((p) => p.t !== 'text' || p.y < 100)).toBe(true);
    }
  });

  it('el título de la portada sin escribir toma el rótulo propio si lo hay', () => {
    const d = norma((x) => void ((x.persona.title = ''), (x.persona.labels['titlePage.title'] = 'Mi título')));
    const src: TextSource = { kind: 'persona', field: 'title' };
    expect(readTextSource(d, src, base)).toBe('Mi título');
    writeTextSource(d, src, 'Mi título', base);
    expect(d.persona.title).toBe('');
  });
});

describe('tamaño real del texto propio', () => {
  const sizeOf = async (props: Record<string, unknown>): Promise<{ pt: number; overflow: boolean }> => {
    const d = norma((x) => {
      x.customBlocks.push({ id: 'abc', pageType: 'weekLeft', pageKey: null, kind: 'text', x: 20, y: 40, w: 40, h: 10, mirror: false, props: { text: 'Un texto que no entra en una caja tan chica a este tamaño', ...props } });
    });
    const { doc } = await openDocument(d);
    const i = doc.plan.pages.findIndex((p) => p.type === 'weekLeft');
    const model = doc.page(i);
    const t = model.blocks.find((b) => b.id === 'custom.abc')!.prims.find((p) => p.t === 'text');
    return { pt: t && t.t === 'text' ? t.run.sizePt : 0, overflow: model.warnings.some((w) => w.code === 'textOverflow') };
  };

  it('sin la propiedad ajusta como antes: la letra se achica hasta entrar', async () => {
    const r = await sizeOf({ size: 60 });
    expect(r.pt).toBeLessThan(60);
    expect(r.overflow).toBe(false);
  });

  it('con fit apagado se dibuja al tamaño pedido y se avisa que no entra', async () => {
    const r = await sizeOf({ size: 60, fit: false });
    expect(r.pt).toBe(60);
    expect(r.overflow).toBe(true);
  });

  it('con fit apagado y un tamaño que entra no hay aviso', async () => {
    const r = await sizeOf({ size: 8, fit: false, text: 'Hola' });
    expect(r.pt).toBe(8);
    expect(r.overflow).toBe(false);
  });
});
