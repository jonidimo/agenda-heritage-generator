/**
 * Reemplazo de glifos por carácter, como en un navegador: si la fuente de un texto no tiene un
 * carácter (una fuente de camiseta sin coma ni paréntesis), ese carácter sale de una fuente de reserva
 * en pantalla, en SVG y en el PDF, y no hay aviso. Solo avisa lo que no tiene ninguna.
 *
 * Con las fuentes integradas: a Atkinson Hyperlegible Next le faltan «→» y «№», que Manrope (2000
 * unidades por em; las demás, 1000) sí tiene; «✓» no lo tiene ninguna.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type CustomBlock } from '../src/core/design/schema';
import type { TextPrim } from '../src/core/layout/prims';
import { renderPdf } from '../src/core/render/pdf';
import { primsToStandaloneSvg } from '../src/core/render/svg';
import { FontRegistry, type FontFace, type GlyphFallback } from '../src/core/text/fonts';
import { outlineRun } from '../src/core/text/outline';
import { glyphPath, hasGlyph, inkBounds, measureText, segmentsOf, shapeText, wrapText } from '../src/core/text/shape';
import { ptToMm } from '../src/core/util/geometry';
import { loadFonts } from '../src/node/env';
import { openDocument, ROOT, sharedFonts } from './helpers/node-env';

const ARROW = 0x2192;
const CHECK = 0x2713;

let fonts: FontRegistry;
let atk: FontFace;
let manrope: FontFace;
let fallback: GlyphFallback;

beforeAll(async () => {
  fonts = await sharedFonts();
  atk = fonts.resolve({ family: 'Atkinson Hyperlegible Next', weight: 400, style: 'normal' })!;
  manrope = fonts.resolve({ family: 'Manrope', weight: 400, style: 'normal' })!;
  fallback = fonts.glyphFallback(atk, ['Manrope']);
});

const textPrim = (run: TextPrim['run'], x = 5, y = 12): TextPrim => ({ t: 'text', run, x, y, color: '#000000' });

describe('la lista de reserva', () => {
  it('primero las del tema, después las demás cargadas; nunca la familia del texto, y con su peso y estilo', () => {
    expect(fallback.faces[0]!.family).toBe('Manrope');
    expect(fallback.faces.every((f) => f.family !== 'Atkinson Hyperlegible Next')).toBe(true);
    expect(new Set(fallback.faces.map((f) => f.family)).size).toBe(fallback.faces.length);
    expect(fallback.faces.length).toBeGreaterThan(1);
    const bold = fonts.resolve({ family: 'Atkinson Hyperlegible Next', weight: 700, style: 'normal' })!;
    expect(fonts.glyphFallback(bold, ['Manrope']).faces[0]!.weight).toBe(700);
    // Se recuerda: la misma lista (y la misma clave de caché) para lo mismo.
    expect(fonts.glyphFallback(atk, ['Manrope'])).toBe(fallback);
    expect(fonts.glyphFallback(atk, ['Cormorant Garamond']).key).not.toBe(fallback.key);
  });

  it('el orden no depende de cuál fuente se cargó antes: las del tema, Manrope, las demás integradas por nombre y al final las subidas', () => {
    const faces = fonts.list();
    const build = (order: readonly FontFace[]): FontRegistry => {
      const r = new FontRegistry();
      for (const f of order) r.add(f);
      return r;
    };
    const a = build(faces);
    const b = build([...faces].reverse());
    const user = { ...faces.find((f) => f.family === 'Manrope')!, family: 'Aaa Propia', key: 'Aaa Propia|400|normal', source: 'user' as const };
    a.add(user);
    b.add(user);
    const families = (r: FontRegistry) => r.glyphFallback(r.resolve(atk)!, ['Cormorant Garamond']).faces.map((f) => f.family);
    expect(families(a)).toEqual(families(b));
    const list = families(a);
    expect(list.slice(0, 2)).toEqual(['Cormorant Garamond', 'Manrope']);
    // La subida va al final aunque su nombre sea el primero por orden alfabético.
    expect(list.at(-1)).toBe('Aaa Propia');
    const builtins = list.slice(2, -1);
    expect(builtins).toEqual([...builtins].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });
});

describe('caracteres que no se dibujan solos', () => {
  it('un invisible que la fuente no tiene (unión de ancho cero, selector de variante) no falta, no se toma prestado y no se dibuja', () => {
    const run = shapeText(atk, 'A\u200DB\uFE0F', 12, { fallback });
    expect(run.missing).toEqual([]);
    expect(run.borrowed).toBeUndefined();
    // Se dibuja (y el PDF recibe) el texto sin ellos: las dos letras, sin cuadrados.
    expect(segmentsOf(run).map((sg) => sg.text)).toEqual(['AB']);
    expect(run.glyphs.map((g) => g.id)).toEqual(shapeText(atk, 'AB', 12).glyphs.map((g) => g.id));
  });

  it('después de un invisible, lo que falta sigue avisando y no se vuelve un espacio (el glifo vacío de fontkit es uno solo por fuente)', () => {
    // Una cara recién leída: el glifo vacío todavía no se pidió para ningún carácter.
    const fresh = new FontRegistry().register(atk.bytes, { family: 'Atkinson Prueba' });
    shapeText(fresh, 'x\uFE0F', 12);
    const run = shapeText(fresh, 'A ✓ B', 12);
    expect(run.missing).toEqual([CHECK]);
    expect(run.glyphs.map((g) => g.id)).toContain(0);
  });

  it('una letra con su marca se toma entera de la primera fuente que tenga las dos; si ninguna, de la que tiene la letra', () => {
    const ACUTE = 0x0301;
    expect(hasGlyph(atk, ACUTE)).toBe(true);
    expect(hasGlyph(manrope, ACUTE)).toBe(false);
    // «→» no está en Atkinson. Manrope (la primera de reserva) tiene la flecha pero no el acento: el
    // grupo va entero con la siguiente que tiene los dos.
    const run = shapeText(atk, 'A \u2192\u0301 B', 12, { fallback });
    const segs = segmentsOf(run);
    const whole = fallback.faces.find((f) => hasGlyph(f, ARROW) && hasGlyph(f, ACUTE))!;
    expect(whole.family).not.toBe('Manrope');
    expect(segs.map((sg) => sg.text)).toEqual(['A ', '\u2192\u0301', ' B']);
    expect(segs[1]!.face).toBe(whole.key);
    expect(run.borrowed).toEqual([ARROW, ACUTE]);
    expect(run.missing).toEqual([]);
    // Si solo hay reserva para la letra, el grupo va con ella y falta el acento.
    const onlyManrope = shapeText(atk, '\u2192\u0301', 12, { fallback: { key: 'solo-manrope', faces: [manrope] } });
    expect(segmentsOf(onlyManrope).map((sg) => sg.face)).toEqual([manrope.key]);
    expect(onlyManrope.borrowed).toEqual([ARROW]);
    expect(onlyManrope.missing).toEqual([ACUTE]);
    // Una letra que la fuente del texto tiene, con un acento que no: si una de reserva tiene las dos, va entera con ella.
    const dorsalLike = fonts.glyphFallback(manrope, ['Atkinson Hyperlegible Next']);
    // (Sin forma compuesta: «é» se normaliza a un solo carácter, que Manrope tiene.)
    const accented = shapeText(manrope, 'q\u0301', 12, { fallback: dorsalLike });
    expect(segmentsOf(accented).map((sg) => [sg.text, sg.face])).toEqual([['q\u0301', atk.key]]);
    expect(accented.missing).toEqual([]);
  });
});

describe('conformado por tramos', () => {
  it('el carácter que falta sale de la reserva: tres tramos, cada uno con su cara y su escala', () => {
    const run = shapeText(atk, 'A → B', 12, { fallback });
    expect(run.missing).toEqual([]);
    expect(run.borrowed).toEqual([ARROW]);
    const segs = segmentsOf(run);
    expect(segs.map((s) => [s.face, s.text])).toEqual([
      [atk.key, 'A '],
      [manrope.key, '→'],
      [atk.key, ' B'],
    ]);
    expect(segs[1]!.unit).toBeCloseTo(ptToMm(12) / 2000, 12);
    expect(segs[0]!.unit).toBeCloseTo(ptToMm(12) / 1000, 12);
    // Los glifos de cada tramo son de su cara, y el ancho es la suma de los tres.
    expect(run.glyphs[segs[1]!.from]!.id).toBe(manrope.font.glyphForCodePoint(ARROW).id);
    expect(run.glyphs[segs[1]!.from]!.x).toBeCloseTo(segs[1]!.x, 9);
    const sum = measureText(atk, 'A ', 12) + measureText(manrope, '→', 12) + measureText(atk, ' B', 12);
    expect(run.width).toBeCloseTo(sum, 6);
    // Las medidas de la línea siguen siendo las de su cara.
    expect(run.capHeight).toBeCloseTo(shapeText(atk, 'A B', 12).capHeight, 9);
  });

  it('con espaciado entre letras, los tramos siguen el mismo modelo que el PDF (espacio después de cada glifo)', () => {
    const run = shapeText(atk, 'A→', 10, { fallback, tracking: 0.1 });
    const t = 0.1 * ptToMm(10);
    expect(segmentsOf(run)[1]!.x).toBeCloseTo(measureText(atk, 'A', 10) + t, 9);
    expect(run.width).toBeCloseTo(measureText(atk, 'A', 10) + t + measureText(manrope, '→', 10), 9);
  });

  it('una fuente de camiseta (letras y cifras, sin signos): la coma, el punto y los paréntesis salen de la reserva', async () => {
    // Un registro propio: la fuente subida no se mezcla con las demás pruebas.
    const reg = await loadFonts();
    const dorsal = reg.register(new Uint8Array(readFileSync(join(ROOT, 'e2e/fixtures/dorsal-prueba.ttf'))), { source: 'user', file: 'dorsal' });
    expect(dorsal.family).toBe('Dorsal Prueba');
    const run = shapeText(dorsal, 'PRIORIDADES A CORTO, MEDIANO Y LARGO PLAZO (2027).', 10, { fallback: reg.glyphFallback(dorsal, ['Manrope', 'Cormorant Garamond']) });
    expect(run.missing).toEqual([]);
    expect(new Set(run.borrowed)).toEqual(new Set([',', '(', ')', '.'].map((c) => c.codePointAt(0)!)));
    expect(segmentsOf(run).filter((seg) => seg.face !== dorsal.key).every((seg) => seg.face.startsWith('Manrope|'))).toBe(true);
    // Sin reserva: los cuatro signos sin glifo. (fontkit reusa el mismo glifo vacío para todos, con el
    // punto de código del primero; el aviso decía solo «(» aunque faltaran también la coma y el punto.)
    expect(new Set(shapeText(dorsal, 'PRIORIDADES A CORTO, MEDIANO Y LARGO PLAZO (2027).', 10).missing)).toEqual(new Set([',', '(', ')', '.'].map((c) => c.codePointAt(0)!)));
  });

  it('lo que no tiene ninguna sigue avisando, y no se parte en tramos', () => {
    const run = shapeText(atk, 'A ✓ B', 12, { fallback });
    expect(run.missing).toEqual([CHECK]);
    expect(run.segments).toBeUndefined();
    expect(run.borrowed).toBeUndefined();
    // Con algo prestado y algo que falta: tramos, y el aviso solo por lo que falta.
    const mixed = shapeText(atk, '→ ✓', 12, { fallback });
    expect(mixed.borrowed).toEqual([ARROW]);
    expect(mixed.missing).toEqual([CHECK]);
  });

  it('si la fuente tiene todo, el resultado es idéntico al de siempre', () => {
    const plain = shapeText(atk, 'Hola, mundo (2027) – ¿qué tal?', 11);
    const withFallback = shapeText(atk, 'Hola, mundo (2027) – ¿qué tal?', 11, { fallback });
    expect(withFallback).toEqual(plain);
    expect('segments' in withFallback).toBe(false);
    expect('borrowed' in withFallback).toBe(false);
  });

  it('otra lista de reserva es otra entrada de la caché', () => {
    const viaCormorant = shapeText(atk, 'A → B', 12, { fallback: fonts.glyphFallback(atk, ['Cormorant Garamond']) });
    expect(segmentsOf(viaCormorant)[1]!.face.startsWith('Cormorant Garamond|')).toBe(true);
    expect(segmentsOf(shapeText(atk, 'A → B', 12, { fallback }))[1]!.face).toBe(manrope.key);
  });

  it('medir y partir en líneas usan los avances de la reserva', () => {
    expect(measureText(atk, '→', 12, { fallback })).toBeCloseTo(measureText(manrope, '→', 12), 9);
    const text = '→→→→ →→→→';
    const withFb = measureText(atk, text, 12, { fallback });
    const without = measureText(atk, text, 12);
    expect(withFb).not.toBeCloseTo(without, 2);
    const width = withFb + 0.01;
    expect(wrapText(atk, text, 12, width, { fallback })).toEqual([text]);
  });

  it('la tinta y el contorno de una corrida con tramos usan la cara de cada tramo', () => {
    const run = shapeText(atk, 'A → B', 12, { fallback });
    const ink = inkBounds(run, fonts)!;
    expect(ink.w).toBeGreaterThan(0);
    expect(ink.x + ink.w).toBeLessThanOrEqual(run.width + 0.5);
    const outline = outlineRun(fonts, run, 0, 0, '#000000')!;
    expect(outline.d.length).toBeGreaterThan(0);
    const plain = outlineRun(fonts, shapeText(atk, 'A  B', 12), 0, 0, '#000000')!;
    expect(outline.d.length).toBeGreaterThan(plain.d.length);
  });
});

describe('dibujado', () => {
  it('SVG: la flecha es el glifo de Manrope, con la escala de Manrope', () => {
    const run = shapeText(atk, 'A → B', 12, { fallback });
    const svg = primsToStandaloneSvg(50, 20, [textPrim(run)], { fonts });
    const arrow = manrope.font.glyphForCodePoint(ARROW).id;
    // Dos caras en los glifos compartidos: la de Atkinson (f0) y la de Manrope (f1).
    expect(svg).toContain(`id="gf1g${arrow}" d="${glyphPath(manrope, arrow)}"`);
    const uses = svg.match(/<use [^>]*>/g) ?? [];
    expect(uses).toHaveLength(run.glyphs.length);
    const arrowUse = uses.find((u) => u.includes(`#gf1g${arrow}"`))!;
    const scale = Number(/matrix\(([\d.]+) /.exec(arrowUse)![1]);
    expect(scale).toBeCloseTo(ptToMm(12) / 2000, 6);
    const other = uses.find((u) => u.includes('#gf0g'))!;
    expect(Number(/matrix\(([\d.]+) /.exec(other)![1])).toBeCloseTo(ptToMm(12) / 1000, 6);
  });

  it('SVG: un texto que la fuente tiene entero se dibuja igual que siempre', () => {
    const svgPlain = primsToStandaloneSvg(50, 20, [textPrim(shapeText(atk, 'Hola (mundo)', 12))], { fonts });
    const svgFb = primsToStandaloneSvg(50, 20, [textPrim(shapeText(atk, 'Hola (mundo)', 12, { fallback }))], { fonts });
    expect(svgFb).toBe(svgPlain);
  });

  /** El contenido (descomprimido) de la primera página de un PDF, y cuántas fuentes usa. */
  async function pageContent(pdf: Uint8Array): Promise<{ ops: string; fonts: number }> {
    const doc = await PDFDocument.load(pdf);
    const page = doc.getPage(0);
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
    const ops = streams.map((s) => (s instanceof PDFRawStream ? inflateSync(s.getContents()).toString('latin1') : '')).join('\n');
    const res = page.node.Resources();
    const fontDict = res?.lookup(PDFName.of('Font'), PDFDict);
    return { ops, fonts: fontDict ? fontDict.keys().length : 0 };
  }

  it('PDF: un tramo por cara, cada uno donde lo ubicó el conformado', async () => {
    const run = shapeText(atk, 'A → B', 12, { fallback });
    const pdf = await renderPdf([{ w: 50, h: 20, prims: [textPrim(run)] }], { fonts, assetBytes: () => undefined });
    const { ops, fonts: used } = await pageContent(pdf);
    expect(used).toBe(2);
    const tf = [...ops.matchAll(/\/(\S+) [\d.]+ Tf/g)].map((m) => m[1]!);
    expect(tf).toHaveLength(3);
    expect(tf[0]).toBe(tf[2]);
    expect(tf[1]).not.toBe(tf[0]);
    const xs = [...ops.matchAll(/1 0 0 1 ([-\d.]+) [-\d.]+ Tm/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(3);
    const segs = segmentsOf(run);
    xs.forEach((x, i) => expect(x).toBeCloseTo(5 + segs[i]!.x, 3));
  });

  it('PDF: sin nada prestado, una sola llamada y una sola fuente, como siempre', async () => {
    const plain = await renderPdf([{ w: 50, h: 20, prims: [textPrim(shapeText(atk, 'Hola (mundo)', 12))] }], { fonts, assetBytes: () => undefined });
    const fb = await renderPdf([{ w: 50, h: 20, prims: [textPrim(shapeText(atk, 'Hola (mundo)', 12, { fallback }))] }], { fonts, assetBytes: () => undefined });
    const a = await pageContent(plain);
    const b = await pageContent(fb);
    expect(b.ops).toBe(a.ops);
    expect(b.fonts).toBe(1);
    expect(b.ops.match(/BT/g)).toHaveLength(1);
  });
});

describe('en una agenda', () => {
  it('un texto con caracteres que su fuente no tiene: sin aviso por lo prestado, aviso solo por lo que falta en todas', async () => {
    const base = parseDesign(createDesign('clara', { year: 2027, locale: 'es-AR', country: 'AR' }));
    const first = await openDocument(base);
    const page = first.doc.plan.pages.find((p) => p.type !== 'cover') ?? first.doc.plan.pages[0]!;
    const d = parseDesign({
      ...base,
      customBlocks: [...base.customBlocks, { id: 'flecha', pageType: page.type, pageKey: page.key, kind: 'text', x: 20, y: 30, w: 90, h: 12, mirror: true, props: { text: 'Ir → listo' } } as CustomBlock],
    });
    const { doc } = await openDocument(d);
    const idx = doc.plan.pages.findIndex((p) => p.key === page.key);
    expect(doc.pageWarnings(idx).filter((w) => w.code === 'missingGlyphs')).toEqual([]);
    const block = doc.page(idx).blocks.find((b) => b.id === 'custom.flecha')!;
    const texts: TextPrim[] = [];
    const walk = (ps: readonly import('../src/core/layout/prims').Prim[]): void => ps.forEach((p) => (p.t === 'text' ? texts.push(p) : p.t === 'group' ? walk(p.children) : undefined));
    walk(block.prims);
    expect(texts.some((t) => t.run.borrowed?.includes(ARROW))).toBe(true);

    const withCheck = parseDesign({ ...d, customBlocks: d.customBlocks.map((b) => (b.id === 'flecha' ? ({ ...b, props: { text: 'Ir → listo ✓' } } as CustomBlock) : b)) });
    const again = await openDocument(withCheck);
    const warnings = again.doc.pageWarnings(idx).filter((w) => w.code === 'missingGlyphs');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.params.chars).toBe('✓');
    expect(warnings[0]!.params.family).toBe('Atkinson Hyperlegible Next');
  });
});
