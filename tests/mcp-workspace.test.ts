/**
 * La raíz de la carpeta de trabajo se calcula igual que las rutas que se comparan con ella.
 * En Windows, `realpathSync` (JavaScript) deja los nombres cortos como `RUNNER~1` y `realpath`
 * (nativo) los expande: la raíz y toda ruta quedaban "fuera" una de la otra.
 */
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Workspace } from '../src/mcp/workspace';

describe('Workspace', () => {
  let base = '';
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'agenda-workspace-'));
  });
  afterAll(() => rm(base, { recursive: true, force: true }));

  it('la raíz es la ruta canónica que da realpath, también cuando se llega por un enlace', async () => {
    await mkdir(join(base, 'real'));
    await symlink(join(base, 'real'), join(base, 'enlace'));
    expect(new Workspace(join(base, 'enlace')).root).toBe(await realpath(join(base, 'real')));
  });

  it('escribe y vuelve a leer un archivo con la raíz dada por un enlace', async () => {
    const work = new Workspace(join(base, 'enlace'));
    await work.write('a.agenda.json', '{}', { extensions: ['.agenda.json'], overwrite: false });
    expect((await work.read('a.agenda.json', ['.agenda.json'])).text).toBe('{}');
  });
});
