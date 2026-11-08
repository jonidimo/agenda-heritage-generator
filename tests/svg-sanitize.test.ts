/** Limpieza de un SVG de internet: sin scripts, enlaces ni referencias de afuera. */
import { describe, expect, it } from 'vitest';
import { importSvg } from '../src/core/assets/svg';
import { sanitizeSvg } from '../src/core/assets/sanitizeSvg';

const wrap = (inner: string, attrs = ''): string => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100mm" height="100mm"${attrs}>${inner}</svg>`;

describe('sanitizeSvg', () => {
  it('conserva el dibujo: formas, rellenos, degradés y transformaciones', () => {
    const src = wrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><g transform="translate(5 5)"><path d="M0 0L10 10" fill="url(#g)" stroke="#000"/><rect x="1" y="2" width="3" height="4"/></g>');
    const { svg, removed } = sanitizeSvg(src);
    expect(removed).toEqual([]);
    expect(svg).toContain('<linearGradient id="g">');
    expect(svg).toContain('fill="url(#g)"');
    expect(svg).toContain('transform="translate(5 5)"');
    expect(svg).toContain('viewBox="0 0 100 100"');
    // Lo que queda sigue siendo un dibujo que la aplicación entiende.
    const vector = importSvg(svg);
    expect(vector.items).toHaveLength(2);
    expect(vector.widthMm).toBeCloseTo(100);
  });

  it('saca los scripts, foreignObject y los manejadores de eventos', () => {
    const { svg, removed } = sanitizeSvg(wrap('<script>alert(1)</script><foreignObject><iframe src="https://evil"/></foreignObject><rect width="5" height="5" onclick="x()" onload="y()"/>', ' onload="alert(2)"'));
    expect(svg).not.toMatch(/script|foreignObject|iframe|onclick|onload|alert/i);
    expect(svg).toContain('<rect width="5" height="5"/>');
    expect(removed).toEqual(expect.arrayContaining(['script', 'foreignObject']));
    expect(removed.some((r) => r.startsWith('manejador de eventos'))).toBe(true);
  });

  it('saca los enlaces y las referencias externas, deja las internas', () => {
    const src = wrap(
      '<a xlink:href="https://evil.example"><rect id="r" width="5" height="5" fill="url(https://evil.example/x.svg#a)"/></a>' +
        '<use href="https://evil.example/otro.svg#x"/><use xlink:href="#r"/>' +
        '<image href="file:///etc/passwd" width="1" height="1"/><image href="data:image/svg+xml;base64,PHN2Zz4=" width="1" height="1"/>' +
        '<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>',
      ' xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
    const { svg } = sanitizeSvg(src);
    expect(svg).not.toMatch(/evil|passwd|svg\+xml/);
    expect(svg).toContain('<use xlink:href="#r"/>');
    expect(svg).toContain('data:image/png;base64,iVBORw0KGgo=');
    // El enlace <a> se deshace pero su forma queda.
    expect(svg).toContain('<rect id="r" width="5" height="5"/>');
  });

  it('limpia el CSS: sin @import, sin url() de afuera, sin código', () => {
    const src = wrap('<style>@import url("https://evil.example/a.css"); .a{fill:url(https://evil.example/p.png);stroke:url(#ok)} .b{behavior:url(x.htc);width:expression(alert(1))}</style><rect class="a" style="fill:url(//evil.example/x); stroke:#000" width="1" height="1"/>');
    const { svg, removed } = sanitizeSvg(src);
    expect(svg).not.toMatch(/evil|@import|expression|behavior/);
    // Un estilo con algo de afuera se saca entero (uno menos es mejor que uno que rastrea).
    expect(svg).not.toContain('stroke:url(#ok)');
    expect(removed.some((r) => r.startsWith('estilo'))).toBe(true);
  });

  it('valores con javascript: o referencias externas en atributos se descartan', () => {
    const { svg } = sanitizeSvg(wrap('<rect width="1" height="1" fill="url(https://evil.example/x)" stroke="javascript:alert(1)" filter="url(#f)"/>'));
    expect(svg).not.toMatch(/evil|javascript/);
    expect(svg).toContain('filter="url(#f)"');
  });

  it('no deja pasar el DOCTYPE con entidades ni las expande', () => {
    const bomba = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "AAAA"><!ENTITY b "&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg"><text>&b;</text></svg>`;
    const { svg } = sanitizeSvg(bomba);
    expect(svg).not.toMatch(/DOCTYPE|ENTITY/);
    expect(svg.length).toBeLessThan(200);
  });

  it('elementos y atributos de otros espacios de nombres (Inkscape, Sodipodi) se van', () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="x" inkscape:version="1"><sodipodi:namedview/><path d="M0 0L1 1" inkscape:label="trazo"/></svg>`;
    const { svg } = sanitizeSvg(src);
    expect(svg).not.toMatch(/inkscape|sodipodi/);
    expect(svg).toContain('<path d="M0 0L1 1"/>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('agrega el espacio de nombres si faltaba, y escapa lo que escribe', () => {
    const { svg } = sanitizeSvg('<svg viewBox="0 0 1 1"><text>a &lt; b &amp; c</text><title>"x"</title></svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('a &lt; b &amp; c');
  });

  it('lo que no es un SVG falla, y uno demasiado hondo también', () => {
    expect(() => sanitizeSvg('<html><body/></html>')).toThrow('No es un SVG');
    expect(() => sanitizeSvg('')).toThrow('No es un SVG');
    expect(() => sanitizeSvg(wrap('<g>'.repeat(300) + '</g>'.repeat(300)))).toThrow(/profundidad/);
  });

  it('el CSS con escapes, image-set o sin cerrar no pasa (la revisión lo encontró)', () => {
    const casos = [
      '<style>rect{fill:u\\72l(https://evil.example/x.svg#a)}</style><rect width="1" height="1"/>',
      '<style>@\\69mport "https://evil.example/a.css";</style><rect width="1" height="1"/>',
      '<style>rect{fill:url(https://evil.example/x</style><rect width="1" height="1"/>',
      '<rect style="fill:url(https://evil.example/x" width="1" height="1"/>',
      `<rect style="background:image-set('https://evil.example/a.png' 1x)" width="1" height="1"/>`,
      '<rect style="cursor:image-set(\'https://evil.example/a.png\' 1x)" width="1" height="1"/>',
      '<rect fill="u\\72l(https://evil.example/x)" width="1" height="1"/>',
      '<rect style="background:image(\'https://evil.example/a.png\')" width="1" height="1"/>',
    ];
    for (const c of casos) {
      const { svg, removed } = sanitizeSvg(wrap(c));
      expect(svg, c).not.toMatch(/evil/);
      expect(removed.length, c).toBeGreaterThan(0);
    }
    // Lo legítimo sigue: colores, url(#id) cerrado, clases.
    const ok = sanitizeSvg(wrap('<style>.a{fill:#f00;stroke:url(#g)}</style><rect class="a" style="fill:url(\'#g\');opacity:.5" width="1" height="1"/>'));
    expect(ok.removed).toEqual([]);
    expect(ok.svg).toContain('.a{fill:#f00;stroke:url(#g)}');
  });

  it('elementos anidados que no cierran bien no cuelgan el proceso', () => {
    const t0 = Date.now();
    expect(() => sanitizeSvg(wrap('<g>'.repeat(40_000) + '</a>'.repeat(40_000)))).toThrow(/profundidad/);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('una entidad numérica fuera de rango o de control no rompe ni queda en la salida', () => {
    const { svg } = sanitizeSvg(wrap('<text>a&#x110000;b&#1;c&#65;</text>'));
    expect(svg).toContain('aA'.slice(0, 1));
    expect([...svg].some((c) => c.charCodeAt(0) < 9)).toBe(false);
    expect(svg).toContain('A');
  });
});

