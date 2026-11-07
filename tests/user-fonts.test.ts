/**
 * Fuentes propias que viajan en el archivo (`userFonts`): la línea de comandos y el servidor MCP las
 * usan al dibujar, sin tocar el registro de fuentes compartido; una que no se puede leer no impide
 * abrir la agenda; y dos fuentes distintas con el mismo nombre no se confunden en las cachés.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { documentSummary } from '../src/core/document/summary';
import type { TextPrim, Prim } from '../src/core/layout/prims';
import { toBase64, withUserFonts } from '../src/core/resources';
import { glyphPath, shapeText } from '../src/core/text/shape';
import { openNodeDocument } from '../src/node/env';
import { ROOT, sharedFonts } from './helpers/node-env';

const DORSAL = new Uint8Array(readFileSync(join(ROOT, 'e2e/fixtures/dorsal-prueba.ttf')));
const MANROPE_BOLD = new Uint8Array(readFileSync(join(ROOT, 'public/fonts/manrope/Manrope-Bold.ttf')));
const spec = { family: 'Dorsal Prueba', weight: 400, style: 'normal' as const };

/** Una agenda cuyos títulos usan la fuente de camiseta (incrustada), con un texto propio con signos. */
function withDorsal(data = toBase64(DORSAL)): Design {
  const d = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  return parseDesign({
    ...d,
    userFonts: [{ id: 'font-dorsal', spec, data }],
    theme: { ...d.theme, tokens: { fonts: { title: spec } } },
    customBlocks: [{ id: 'coma', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 30, w: 100, h: 14, mirror: true, props: { text: 'Hola, mundo (2027).', role: 'title' } }],
  });
}

const texts = (prims: readonly Prim[]): TextPrim[] => prims.flatMap((p) => (p.t === 'text' ? [p] : p.t === 'group' ? texts(p.children) : []));

describe('fuentes propias en el archivo', () => {
  it('se usan al dibujar, los signos que no tiene salen de la reserva, y el registro compartido no cambia', async () => {
    const shared = await sharedFonts();
    const { doc, errors } = await openNodeDocument(withDorsal(), shared);
    expect(errors).toEqual([]);
    expect(shared.has(spec)).toBe(false);
    expect(doc.ctx.fonts.resolve(spec)?.source).toBe('user');
    const idx = doc.plan.pages.findIndex((p) => p.type === 'titlePage');
    const block = doc.page(idx).blocks.find((b) => b.id === 'custom.coma')!;
    const run = texts(block.prims)[0]!.run;
    expect(run.face).toBe('Dorsal Prueba|400|normal');
    expect(new Set(run.borrowed)).toEqual(new Set([',', '(', ')', '.'].map((c) => c.codePointAt(0)!)));
    expect(doc.pageWarnings(idx).filter((w) => w.code === 'missingGlyphs')).toEqual([]);
  });

  it('el resumen dice de dónde sale cada fuente y qué puntuación le falta, y cada aviso trae cómo se corrige', async () => {
    const { doc, errors } = await openNodeDocument(withDorsal(), await sharedFonts());
    const s = documentSummary(doc, errors);
    expect(s.fonts.embedded).toBe(1);
    const title = s.fonts.roles.find((r) => r.role === 'title')!;
    expect(title).toMatchObject({ family: 'Dorsal Prueba', source: 'user', drawnWith: 'Dorsal Prueba' });
    expect(title.punctuation?.missing).toEqual(expect.arrayContaining([',', '.', '(', ')']));
    expect(title.punctuation?.from).toBe('Manrope');
    expect(s.fonts.roles.find((r) => r.role === 'body')).toMatchObject({ source: 'builtin' });
    expect(s.fonts.roles.find((r) => r.role === 'number')?.punctuation).toBeUndefined();
    for (const w of s.warnings) expect(w.fix, w.code).toEqual(expect.any(String));
  });

  it('una fuente que no se puede leer no impide abrir la agenda: queda en los errores y se usa la de reserva', async () => {
    const { doc, errors } = await openNodeDocument(withDorsal(toBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))), await sharedFonts());
    expect(errors).toEqual([expect.stringContaining('«Dorsal Prueba» (font-dorsal) no se pudo leer')]);
    expect(doc.ctx.fonts.resolve(spec)).toBeUndefined();
    expect(documentSummary(doc, errors).fonts.roles.find((r) => r.role === 'title')).toMatchObject({ source: 'missing', drawnWith: 'Manrope' });
  });

  it('una lista mal formada se descarta entera y la agenda abre igual', () => {
    const d = parseDesign({ ...createDesign('minimal', { year: 2027 }), userFonts: [{ id: 'x', spec: { family: '' }, data: 'no es base64!' }] });
    expect(d.userFonts).toBeUndefined();
  });

  it('dos fuentes distintas con el mismo nombre (en dos agendas) no comparten formas ni contornos', async () => {
    const shared = await sharedFonts();
    const a = withUserFonts(shared, [{ id: 'a', spec, data: toBase64(DORSAL) }]).registry.resolve(spec)!;
    // Otra fuente (Manrope Bold) con el mismo nombre, peso y estilo.
    const b = withUserFonts(shared, [{ id: 'b', spec, data: toBase64(MANROPE_BOLD) }]).registry.resolve(spec)!;
    expect(a.key).toBe(b.key);
    const ra = shapeText(a, 'Hola', 12);
    const rb = shapeText(b, 'Hola', 12);
    expect(ra.width).not.toBeCloseTo(rb.width, 3);
    const gid = a.font.glyphForCodePoint(72).id;
    expect(glyphPath(a, gid)).not.toBe(glyphPath(b, b.font.glyphForCodePoint(72).id));
  });
});
