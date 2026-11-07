/** «Abrir archivo…» del escritorio: el archivo con las imágenes que están junto a él adentro, y los casos que no se abren. */
import { mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sysRoute } from '../electron/lib/downloads.mjs';
import { readPlanner } from '../electron/lib/openPlanner.mjs';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let dir = '';
const reader = (maxBytes = 1024 * 1024) => ({ stat: (f: string) => stat(f).catch(() => null), readFile: (f: string) => readFile(f, 'utf8'), fs: { realpath, open }, maxBytes });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenda-abrir-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'assets', 'cover.png'), PNG);
  await writeFile(join(dir, 'a.agenda.json'), JSON.stringify({ name: 'Con rutas', assets: [{ id: 'c', name: 'Cover', kind: 'raster', mime: 'image/png', path: 'assets/cover.png' }, { id: 'f', name: 'Falta', kind: 'raster', mime: 'image/png', path: 'assets/falta.png' }] }));
  await writeFile(join(dir, 'grande.agenda.json'), 'x'.repeat(2048));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('readPlanner', () => {
  it('devuelve el archivo con las imágenes de su carpeta adentro, y dice cuáles no pudo leer', async () => {
    const r = await readPlanner(join(dir, 'a.agenda.json'), reader());
    expect(r).toMatchObject({ ok: true, name: 'a.agenda.json', inlined: 1, failed: ['assets/falta.png'] });
    if (!r.ok) throw new Error('no se abrió');
    const out = JSON.parse(r.text) as { assets: Array<{ data?: string }> };
    expect(out.assets[0]!.data).toBe(Buffer.from(PNG).toString('base64'));
    expect(out.assets[1]!.data).toBeUndefined();
  });

  it('un archivo que no existe, una carpeta o uno demasiado grande no se abren', async () => {
    expect(await readPlanner(join(dir, 'no-esta.json'), reader())).toEqual({ ok: false, reason: 'unreadable' });
    expect(await readPlanner(dir, reader())).toEqual({ ok: false, reason: 'unreadable' });
    expect(await readPlanner(join(dir, 'grande.agenda.json'), reader(1024))).toEqual({ ok: false, reason: 'too-large' });
  });

  it('lo que no es JSON se devuelve como está (la página lo informa)', async () => {
    await writeFile(join(dir, 'texto.json'), 'esto no es json');
    const r = await readPlanner(join(dir, 'texto.json'), reader());
    expect(r).toMatchObject({ ok: true, text: 'esto no es json', inlined: 0 });
  });
});

describe('ruta del sistema', () => {
  it('open-planner es una ruta conocida', () => {
    expect(sysRoute('/_sys/open-planner')).toBe('open-planner');
    expect(sysRoute('/_sys/open-planner/x')).toBeNull();
  });
});
