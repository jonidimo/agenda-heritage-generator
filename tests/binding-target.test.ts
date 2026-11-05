/**
 * Destino de la agenda: para imprimir es lo de siempre; para leer en pantalla se anula todo lo que
 * solo existe por el papel (costura, recortes, zona no imprimible, marcas, relleno de cuadernillos).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { effectiveBinding, printGuides, safeArea } from '../src/core/document/binding';
import { pageGeometry } from '../src/core/document/context';
import { openDocument } from './helpers/node-env';

const norma = (patch: (d: Design) => void = () => {}): Design => {
  const d = parseDesign(createDesign('heritage-norma', { year: 2027, locale: 'es-AR', country: 'AR' }));
  patch(d);
  return parseDesign(d);
};

const tuned = (target: 'print' | 'screen') =>
  norma((d) => {
    d.binding.target = target;
    d.binding.gutter = 6;
    d.binding.nonPrintable = 5;
    d.binding.trim = { top: 3, bottom: 3, outer: 4 };
    d.binding.marks = { fold: true, crop: true, collation: true, signatureLabel: true };
    d.binding.creep = { mode: 'caliper', caliper: 0.2, measured: 0 };
    d.binding.backOffset = { x: 1, y: 1 };
  });

describe('encuadernación efectiva', () => {
  it('para imprimir es exactamente la guardada (misma referencia)', () => {
    const d = tuned('print');
    expect(effectiveBinding(d)).toBe(d.binding);
  });

  it('para leer en pantalla anula costura, recortes, zona no imprimible, marcas y compensación', () => {
    const d = tuned('screen');
    const b = effectiveBinding(d);
    expect(b).toMatchObject({ target: 'screen', gutter: 0, nonPrintable: 0, trim: { top: 0, bottom: 0, outer: 0 }, backOffset: { x: 0, y: 0 } });
    expect(b.marks).toEqual({ fold: false, crop: false, collation: false, signatureLabel: false });
    expect(b.creep.mode).toBe('off');
    // Lo demás se conserva (las páginas numeradas y las pestañas son para leer también) y no se toca lo guardado.
    expect(b.pageNumbers).toBe(d.binding.pageNumbers);
    expect(b.thumbIndex).toBe(d.binding.thumbIndex);
    expect(d.binding.gutter).toBe(6);
    // Se calcula una sola vez por diseño: la identidad sirve para reutilizar páginas.
    expect(effectiveBinding(d)).toBe(b);
  });

  it('un archivo anterior (sin destino) se abre para imprimir', () => {
    const raw = JSON.parse(JSON.stringify(createDesign('heritage-norma', { year: 2027 })));
    delete raw.binding.target;
    expect(parseDesign(raw).binding.target).toBe('print');
  });

  it('el núcleo no lee design.binding salvo para elegir el tamaño de la página, el esquema y esta función', () => {
    const allowed = new Set(['src/core/document/binding.ts', 'src/core/document/reuse.ts', 'src/core/design/schema.ts', 'src/core/design/defaults.ts']);
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !allowed.has(p)) {
          readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (/\bdesign\.binding\b|\bd\.binding\b/.test(line)) hits.push(`${p}:${i + 1}: ${line.trim()}`);
            });
        }
      }
    };
    walk('src/core');
    // Las únicas lecturas permitidas: el método que fija el tamaño de página, `separate()` (copia el diseño) y el resumen.
    const unexpected = hits.filter((h) => !/pageFormat|method === 'single'|method: 'saddle'|\.\.\.this\.design\.binding/.test(h));
    expect(unexpected).toEqual([]);
  });
});

describe('guías de imprenta', () => {
  const page = { w: 100, h: 150 };
  it('plegada, el lado del lomo no tiene franja no imprimible', () => {
    const b = { method: 'sewn', nonPrintable: 5 } as const;
    expect(safeArea(b, { ...page, side: 'recto' })).toEqual({ x: 0, y: 5, w: 95, h: 140 });
    expect(safeArea(b, { ...page, side: 'verso' })).toEqual({ x: 5, y: 5, w: 95, h: 140 });
  });

  it('en papel suelto o pila cortada, la franja rodea la hoja', () => {
    for (const method of ['single', 'cut-stack'] as const) expect(safeArea({ method, nonPrintable: 4 }, { ...page, side: 'recto' })).toEqual({ x: 4, y: 4, w: 92, h: 142 });
  });

  it('la costura es una franja del lomo, del lado que le toca a cada página', () => {
    const b = { method: 'sewn', nonPrintable: 0, gutter: 6 } as const;
    expect(printGuides(b, { ...page, side: 'recto' }).gutter).toEqual({ x: 0, y: 0, w: 6, h: 150 });
    expect(printGuides(b, { ...page, side: 'verso' }).gutter).toEqual({ x: 94, y: 0, w: 6, h: 150 });
    expect(printGuides({ ...b, gutter: 0 }, { ...page, side: 'recto' }).gutter).toBeNull();
  });

  it('el área segura de la verificación es la misma que se dibuja', async () => {
    const { doc } = await openDocument(tuned('print'));
    const p = doc.page(doc.plan.pages.findIndex((x) => x.type === 'monthLog'));
    expect(printGuides(doc.binding, p).safe).toEqual(safeArea(doc.binding, p));
  });
});

describe('agenda para leer en pantalla', () => {
  it('las páginas tienen el mismo tamaño que para imprimir, pero la costura y los recortes desaparecen', async () => {
    const print = await openDocument(tuned('print'));
    const screen = await openDocument(tuned('screen'));
    const base = await openDocument(norma());
    // Sin recortes: la página es la del papel completo dividido; con ellos, más chica.
    expect(screen.doc.format.w).toBeGreaterThan(print.doc.format.w);
    expect(screen.doc.format.h).toBeGreaterThan(print.doc.format.h);
    expect(screen.doc.format.w).toBeCloseTo(base.doc.format.w, 6);
    // El contenido ocupa lo que dejan los márgenes del tema: sin los 6 mm de costura.
    const inner = (d: typeof screen) => pageGeometry(d.doc.ctx, 'recto').content.x - d.doc.ctx.theme.margins.inner;
    expect(inner(print)).toBe(6);
    expect(inner(screen)).toBe(0);
    expect(inner(base)).toBe(base.doc.design.binding.gutter);
  });

  it('no completa cuadernillos: no hay páginas de relleno ni hojas impuestas', async () => {
    const print = await openDocument(norma((d) => void (d.binding.target = 'print')));
    const screen = await openDocument(norma((d) => void (d.binding.target = 'screen')));
    expect(screen.doc.plan.signatureFillers).toBe(0);
    expect(screen.doc.plan.signatures.padding).toBe(0);
    expect(screen.doc.plan.pages.length).toBe(screen.doc.plan.contentPages + screen.doc.plan.parityFillers);
    expect(print.doc.plan.pages.length % 4).toBe(0);
    expect(screen.doc.sides()).toEqual([]);
    expect(screen.doc.screen).toBe(true);
  });

  it('el PDF de páginas se genera; los de imprenta se rechazan diciendo por qué', async () => {
    const screen = await openDocument(norma((d) => void (d.binding.target = 'screen')));
    const opts = { assetBytes: () => undefined, pages: [0, 1] };
    const bytes = await screen.doc.exportPdf('pages', opts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    for (const kind of ['imposed', 'fronts', 'backs', 'signature', 'calibration', 'sewing', 'cover', 'separate'] as const) {
      await expect(screen.doc.exportPdf(kind, opts)).rejects.toThrow(/leer en pantalla/);
    }
  });

  it('cambiar el destino de ida y vuelta devuelve exactamente las mismas páginas', async () => {
    const a = await openDocument(norma());
    const b = await openDocument(norma((d) => void (d.binding.target = 'screen')));
    const c = await openDocument(norma((d) => void (d.binding.target = 'print')));
    expect(c.doc.plan.pages.map((p) => p.key)).toEqual(a.doc.plan.pages.map((p) => p.key));
    expect(b.doc.plan.pages.length).toBeLessThanOrEqual(a.doc.plan.pages.length);
  });
});
