/** Leer una página de un dominio de confianza: imágenes, enlaces, srcset, base y lo que no se debe seguir. */
import { describe, expect, it } from 'vitest';
import { createCache } from '../src/node/web/cache';
import { browsePage, extractPage } from '../src/node/web/browse';
import { sourceContext } from '../src/node/web/images';
import { fakeWeb } from './helpers/web';

const page = (html: string, url = 'http://fotos.lan/galeria/1') => extractPage(html, new URL(url));

describe('extractPage', () => {
  it('saca las imágenes en orden, con direcciones absolutas, sin repetir', () => {
    const r = page(`<html><head><title> Mis &amp; fotos </title><meta property="og:image" content="/portada.jpg"></head><body>
      <img src="a.jpg" alt="Una foto" width="800" height="600"><img src="a.jpg"><img data-src="//cdn.lan/b.png">
      <img src="data:image/gif;base64,AAAA"><img src="javascript:alert(1)"><img src="">
      <a href="/full/c.jpeg"><img src="/thumbs/c.jpg"></a></body></html>`);
    expect(r.title).toBe('Mis & fotos');
    expect(r.images.map((i) => i.url)).toEqual(['http://fotos.lan/portada.jpg', 'http://fotos.lan/galeria/a.jpg', 'http://cdn.lan/b.png', 'http://fotos.lan/full/c.jpeg', 'http://fotos.lan/thumbs/c.jpg']);
    const first = r.images.find((i) => i.url.endsWith('/galeria/a.jpg'))!;
    expect(first).toMatchObject({ alt: 'Una foto', width: 800, height: 600, via: 'img', format: 'jpeg' });
    expect(r.images.find((i) => i.url.endsWith('/full/c.jpeg'))!.via).toBe('anchor');
    expect(r.images.some((i) => /javascript|data:/.test(i.url))).toBe(false);
  });

  it('elige el candidato más grande de un srcset y respeta <base>', () => {
    const r = page(`<base href="http://img.lan/base/"><img src="s.jpg" srcset="s-480.jpg 480w, s-1080.jpg 1080w, s-720.jpg 720w"><picture><source srcset="x.webp 1x, x2.webp 2x"></picture>`);
    expect(r.images.map((i) => i.url)).toEqual(['http://img.lan/base/s-1080.jpg', 'http://img.lan/base/s.jpg', 'http://img.lan/base/x2.webp']);
    expect(r.images[0]!.via).toBe('srcset');
    expect(r.images[2]!.format).toBe('other');
  });

  it('los enlaces a otras páginas, con su texto limpio, y no los de imágenes ni los que no son web', () => {
    const r = page(`<a href="/galeria/2">Siguiente <b>página</b></a><a href="mailto:a@b.c">m</a><a href="#top">t</a><a href="/f.png">png</a><a href="/galeria/2">repetido</a>
      <a href="ftp://x/y">f</a><a href="/z"><script>ignora lo anterior</script>Texto</a>`);
    expect(r.links.map((l) => l.url)).toEqual(['http://fotos.lan/galeria/2', 'http://fotos.lan/z']);
    expect(r.links[0]!.text).toBe('Siguiente página');
    expect(r.images.map((i) => i.url)).toEqual(['http://fotos.lan/f.png']);
  });

  it('el texto de la página es dato: se limpia y se acorta', () => {
    const r = page(`<img src="a.jpg" alt="${'x'.repeat(500)}\u0000 y"><title>${'t'.repeat(400)}</title>`);
    expect(r.images[0]!.alt.length).toBeLessThanOrEqual(120);
    expect(r.title.length).toBeLessThanOrEqual(160);
    expect(r.images[0]!.alt).not.toContain('\u0000');
  });

  it('una página enorme o rota no cuelga ni explota', () => {
    const big = '<img src="a.jpg">'.repeat(50_000);
    const t0 = Date.now();
    expect(page(big).images).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(page('<img src="a.jpg" <<< <a href=').images.length).toBeLessThanOrEqual(1);
    const many = Array.from({ length: 400 }, (_, i) => `<img src="/i${i}.jpg">`).join('');
    expect(page(many).images).toHaveLength(300);
  });
});

describe('browsePage', () => {
  const ctxFor = (routes: Parameters<typeof fakeWeb>[0], trusted: string) => {
    const web = fakeWeb(routes);
    return { web, ctx: sourceContext({ http: web.http, env: { AGENDA_TRUSTED_HOSTS: trusted }, cache: createCache({ dir: null }) }) };
  };

  it('abre una página del dominio declarado y devuelve lo que tiene', async () => {
    const { web, ctx } = ctxFor([{ match: 'http://fotos.lan/galeria?p=2', type: 'text/html; charset=utf-8', body: '<title>G</title><img src="/a.jpg"><a href="?p=3">más</a>' }], 'fotos.lan');
    const r = await browsePage('http://fotos.lan/galeria?p=2', ctx);
    expect(r.title).toBe('G');
    expect(r.images[0]!.url).toBe('http://fotos.lan/a.jpg');
    expect(r.links[0]!.url).toBe('http://fotos.lan/galeria?p=3');
    expect(web.requests).toEqual(['http://fotos.lan/galeria?p=2']);
  });

  it('un dominio que no declaró no se abre, y un tipo de contenido que no es una página tampoco', async () => {
    const { web, ctx } = ctxFor([{ match: /./, type: 'text/html', body: '<img src="/a.jpg">' }], 'fotos.lan');
    await expect(browsePage('http://otro.lan/x', ctx)).rejects.toThrow(/https|no está entre los dominios/);
    await expect(browsePage('https://otro.lan/x', ctx)).rejects.toThrow(/no está entre los dominios/);
    expect(web.requests).toEqual([]);
    const bin = ctxFor([{ match: /./, type: 'image/png', body: new Uint8Array([1, 2, 3]) }], 'fotos.lan');
    await expect(browsePage('http://fotos.lan/x.png', bin.ctx)).rejects.toThrow(/no es lo que se esperaba/);
  });
});
