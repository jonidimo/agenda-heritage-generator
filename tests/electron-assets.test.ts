/** La aplicación de escritorio pone adentro del archivo las imágenes guardadas junto a él, sin salir de su carpeta. */
import { mkdir, mkdtemp, open, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inlineAssetPaths, readInside } from '../electron/lib/assets.mjs';

const fs = { realpath, open };
let dir = '';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const b64 = Buffer.from(PNG).toString('base64');
const asset = (path: string, extra: Record<string, unknown> = {}) => ({ id: path, name: path, kind: 'raster', mime: 'image/png', path, ...extra });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-el-'));
  await mkdir(join(dir, 'agenda', 'img'), { recursive: true });
  await writeFile(join(dir, 'agenda', 'img', 'a.png'), PNG);
  await writeFile(join(dir, 'fuera.png'), PNG);
  await symlink(join(dir, 'fuera.png'), join(dir, 'agenda', 'img', 'enlace.png'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('imágenes por ruta al abrir un archivo', () => {
  it('una agenda: lee las de su carpeta y deja sin datos las que salen de ella o no están', async () => {
    const text = JSON.stringify({ name: 'x', assets: [asset('img/a.png'), asset('img/enlace.png'), asset('../fuera.png'), asset('img/no.png'), asset('img/a.png', { id: 'ya', data: 'AAAA' })] });
    const r = await inlineAssetPaths(text, join(dir, 'agenda'), fs);
    const out = JSON.parse(r.text) as { assets: Array<{ id: string; data?: string }> };
    expect(out.assets.map((a) => a.data ?? null)).toEqual([b64, null, null, null, 'AAAA']);
    expect(r.inlined).toBe(1);
    expect(r.failed).toEqual(['img/enlace.png', '../fuera.png', 'img/no.png']);
  });

  it('también dentro de una plantilla y de una copia de seguridad', async () => {
    const tpl = await inlineAssetPaths(JSON.stringify({ kind: 'heritage-template', design: { assets: [asset('img/a.png')] } }), join(dir, 'agenda'), fs);
    expect((JSON.parse(tpl.text) as { design: { assets: Array<{ data: string }> } }).design.assets[0]!.data).toBe(b64);
    const backup = await inlineAssetPaths(JSON.stringify({ kind: 'heritage-backup', designs: [{ assets: [asset('img/a.png')] }], templates: [{ design: { assets: [asset('img/a.png')] } }] }), join(dir, 'agenda'), fs);
    expect(backup.inlined).toBe(2);
  });

  it('un texto que no es JSON, o sin imágenes por ruta, vuelve tal cual', async () => {
    expect((await inlineAssetPaths('no es json', dir, fs)).text).toBe('no es json');
    const plain = JSON.stringify({ name: 'x', assets: [{ id: 'b', builtin: 'watermarks/colibri.svg' }] });
    expect((await inlineAssetPaths(plain, dir, fs)).text).toBe(plain);
  });

  it('no lee un archivo enorme, uno oculto ni uno disfrazado', async () => {
    const big = { ...fs, open: async (p: string, f: 'r') => Object.assign(await open(p, f), { stat: async () => ({ isFile: () => true, size: 65 * 1024 * 1024 }) }) };
    await expect(readInside(big, join(dir, 'agenda'), 'img/a.png')).rejects.toThrow(/too large/);
    await writeFile(join(dir, 'agenda', 'img', 'clave.png'), 'PRIVATE KEY');
    await expect(readInside(fs, join(dir, 'agenda'), 'img/clave.png')).rejects.toThrow(/extension/);
    await expect(readInside(fs, join(dir, 'agenda'), '.ssh/id_rsa')).rejects.toThrow(/relative/);
  });

  it('el mismo archivo usado por varias imágenes se lee una vez', async () => {
    const text = JSON.stringify({ assets: [asset('img/a.png'), asset('img/a.png', { id: 'otra' })] });
    const r = await inlineAssetPaths(text, join(dir, 'agenda'), fs);
    expect(r.inlined).toBe(2);
  });
});
