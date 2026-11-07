/** render_page: la resolución por ppp o por ancho, una zona en grande, el archivo guardado a resolución plena y el fondo transparente. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rasterInfo } from '../src/core/assets/image';
import { clampArea, renderSize } from '../src/core/render/size';
import { fromBase64 } from '../src/core/resources';
import { withPngDpi } from '../src/node/png';
import { sourceResources } from '../src/mcp/dev';
import { createServer } from '../src/mcp/server';
import { makePng } from './helpers/png';

let dir = '';
let client: Client;
type Content = { type: string; text?: string; data?: string };
/** Lo que informa render_page (solo lo que las pruebas miran). */
interface RenderBody {
  render: { widthPx: number; pxPerMm: number; dpi: number; area: { x: number; y: number; w: number; h: number }; shownWidthPx?: number };
  saved?: { path: string; bytes: number; widthPx: number; dpi: number };
  notes?: string[];
}
const call = async (args: Record<string, unknown>) => {
  const res = (await client.callTool({ name: 'render_page', arguments: { path: 'a.agenda.json', page: 2, ...args } })) as { content: Content[]; isError?: boolean };
  const image = res.content.find((c) => c.type === 'image');
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  const body = text.startsWith('{') ? (JSON.parse(text) as RenderBody) : null;
  return { isError: res.isError === true, text, body, png: image?.data ? fromBase64(image.data) : null };
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-render-'));
  const server = createServer({ root: dir, ...sourceResources() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prueba', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const made = (await client.callTool({ name: 'create_design', arguments: { template: 'heritage', year: 2027, out: 'a.agenda.json' } })) as { isError?: boolean };
  expect(made.isError).toBeFalsy();
}, 120_000);
afterAll(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});

describe('render_page', () => {
  it('por defecto: 800 px de ancho, y la respuesta dice a cuántos píxeles por mm salió', async () => {
    const r = await call({});
    expect(rasterInfo(r.png!)?.width).toBe(800);
    expect(r.body!.render).toMatchObject({ widthPx: 800 });
    expect(r.body!.render.pxPerMm).toBeCloseTo(800 / r.body!.render.area.w, 2);
  });

  it('dpi: el ancho sale del tamaño de la página, hasta el tope de lo que se ve acá', async () => {
    const r = await call({ dpi: 150 });
    const w = r.body!.render.area.w as number;
    expect(r.body!.render.widthPx).toBe(Math.round((w / 25.4) * 150));
    // A 300 ppp una página A5 son 1748 px: acá se ve a 1600 y se avisa.
    const big = await call({ dpi: 300 });
    expect(big.body!.render.widthPx).toBe(Math.round((w / 25.4) * 300));
    expect(rasterInfo(big.png!)?.width).toBe(1600);
    expect(big.body!.render.shownWidthPx).toBe(1600);
    expect(big.body!.notes?.[0]).toContain('out');
  });

  it('una zona en grande: solo esa parte, a 300 ppp si no se pide otra cosa', async () => {
    const r = await call({ area: { x: 10, y: 10, w: 30, h: 20 } });
    expect(r.body!.render.area).toEqual({ x: 10, y: 10, w: 30, h: 20 });
    expect(r.body!.render.widthPx).toBe(Math.round((30 / 25.4) * 300));
    expect(rasterInfo(r.png!)).toMatchObject({ width: 354, height: 236 });
  });

  it('«out» guarda el PNG a resolución plena, con sus ppp anotados, y acá va una vista más chica', async () => {
    const r = await call({ dpi: 300, out: 'pagina.png' });
    expect(r.isError, r.text).toBe(false);
    const saved = new Uint8Array(await readFile(join(dir, 'pagina.png')));
    expect(r.body!.saved).toMatchObject({ path: 'pagina.png', widthPx: r.body!.render.widthPx, dpi: 300 });
    expect(rasterInfo(saved)).toMatchObject({ width: r.body!.render.widthPx, dpi: 300 });
    expect(rasterInfo(r.png!)?.width).toBe(1000);
  });

  it('fondo transparente: la esquina no es blanca', async () => {
    const r = await call({ transparent: true, width: 400 });
    expect(r.isError, r.text).toBe(false);
    // Un PNG con canal alfa (color tipo 6).
    expect(r.png![25]).toBe(6);
  });

  it('pedidos que no se pueden: width y dpi juntos, una zona fuera de la página, un archivo que no es .png, un tamaño enorme', async () => {
    expect((await call({ width: 800, dpi: 150 })).text).toMatch(/width.*dpi/);
    expect((await call({ area: { x: 5000, y: 5000, w: 10, h: 10 } })).text).toMatch(/fuera de la página/);
    expect((await call({ out: 'pagina.txt' })).isError).toBe(true);
    expect((await call({ width: 8000 })).text).toMatch(/máximo/); // alto de 11 000 px en una página A5
    expect((await call({ width: 9000 })).isError).toBe(true); // más que el tope del esquema
  });
});

describe('tamaños de render', () => {
  it('renderSize: por defecto una página entera son 800 px y una zona 300 ppp; los extremos dan un error con el máximo', () => {
    expect(renderSize({ x: 0, y: 0, w: 148, h: 210 }, { zoomed: false })).toEqual({ w: 800, h: 1135 });
    expect(renderSize({ x: 0, y: 0, w: 25.4, h: 25.4 }, { zoomed: true })).toEqual({ w: 300, h: 300 });
    expect(renderSize({ x: 0, y: 0, w: 100, h: 50 }, { width: 1000, zoomed: false })).toEqual({ w: 1000, h: 500 });
    expect(() => renderSize({ x: 0, y: 0, w: 1000, h: 1000 }, { dpi: 600, zoomed: false })).toThrow(/máximo/);
  });

  it('clampArea recorta a la página, y una zona fuera de ella es un error', () => {
    expect(clampArea({ x: -5, y: 10, w: 30, h: 1000 }, 148, 210)).toEqual({ x: 0, y: 10, w: 25, h: 200 });
    expect(() => clampArea({ x: 200, y: 0, w: 10, h: 10 }, 148, 210)).toThrow(/fuera de la página/);
  });
});

describe('withPngDpi', () => {
  it('anota la resolución sin tocar los píxeles, la reemplaza si ya estaba, y deja intacto lo que no es un PNG', () => {
    const png = makePng(20, 10, [200, 30, 30]);
    const at300 = withPngDpi(png, 300);
    expect(rasterInfo(at300)).toMatchObject({ width: 20, height: 10, dpi: 300 });
    expect(rasterInfo(withPngDpi(at300, 150))?.dpi).toBe(150);
    expect(at300.length).toBe(png.length + 21);
    expect(withPngDpi(new Uint8Array([1, 2, 3]), 300)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
