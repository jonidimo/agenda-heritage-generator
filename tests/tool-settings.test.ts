import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanHostList, documentsFolder, folderName, isSecret, PROJECT_MARKER, ToolSettingsStore } from '../electron/lib/toolSettings.mjs';

const fakeSafe = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s: string) => Buffer.from(`enc:${s.split('').reverse().join('')}`),
  decryptString: (b: Buffer) => b.toString().slice(4).split('').reverse().join(''),
});

let dir: string;
let docs: string;
let store: InstanceType<typeof ToolSettingsStore>;
const make = (safe = fakeSafe()) => new ToolSettingsStore({ file: path.join(dir, 'user', 'tools.json'), documentsDir: docs, fs: fsp, safeStorage: safe });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tools-'));
  docs = path.join(dir, 'Documentos');
  await mkdir(docs);
  store = make();
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('ajustes de las herramientas del asistente', () => {
  it('la carpeta por defecto es Documentos/Heritage Studio (y no se crea hasta que hace falta)', async () => {
    expect(await store.rootDir()).toBe(path.join(docs, 'Heritage Studio'));
    expect((await store.status()).rootIsDefault).toBe(true);
    expect(await stat(path.join(docs, 'Heritage Studio')).catch(() => null)).toBeNull();
  });

  it('la carpeta se puede elegir a mano, tiene que existir, y se vuelve a la de Documentos', async () => {
    const mine = path.join(dir, 'Mis agendas');
    await expect(store.setRoot(mine)).rejects.toThrow('missing');
    await expect(store.setRoot('relativa')).rejects.toThrow('relative');
    await mkdir(mine);
    await store.setRoot(mine);
    expect(await store.rootDir()).toBe(mine);
    expect(await make().rootDir()).toBe(mine);
    await store.setRoot(null);
    expect(await store.rootDir()).toBe(path.join(docs, 'Heritage Studio'));
  });

  it('las claves se guardan cifradas, la página solo sabe si hay una y se usan como variables de entorno', async () => {
    await store.setKey('PEXELS_API_KEY', 'abc123SECRET');
    const onDisk = await readFile(path.join(dir, 'user', 'tools.json'), 'utf8');
    expect(onDisk).not.toContain('abc123SECRET');
    const status = await store.status();
    expect(JSON.stringify(status)).not.toContain('abc123SECRET');
    expect(status.hasKey.PEXELS_API_KEY).toBe(true);
    expect(status.hasKey.PIXABAY_API_KEY).toBe(false);
    expect(await make().getKey('PEXELS_API_KEY')).toBe('abc123SECRET');
    await store.update({ trustedHosts: 'nas.lan,fotos.casa' });
    expect(await store.toolEnv()).toEqual({ PEXELS_API_KEY: 'abc123SECRET', AGENDA_TRUSTED_HOSTS: 'nas.lan,fotos.casa' });
    await store.setKey('PEXELS_API_KEY', null);
    expect((await store.status()).hasKey.PEXELS_API_KEY).toBe(false);
  });

  it('sin llavero del sistema la clave no se escribe en el disco y dura mientras la aplicación siga abierta', async () => {
    const weak = make(fakeSafe(false));
    await weak.setKey('PIXABAY_API_KEY', 'sinllavero');
    expect(await readFile(path.join(dir, 'user', 'tools.json'), 'utf8')).not.toContain('sinllavero');
    expect(await weak.getKey('PIXABAY_API_KEY')).toBe('sinllavero');
    expect((await weak.status()).encryption.available).toBe(false);
  });

  it('si el sistema no tiene carpeta de documentos, es «Documents» dentro de la carpeta personal (nunca la raíz de la carpeta personal)', () => {
    expect(documentsFolder('/home/ana', '/home/ana')).toBe(path.join('/home/ana', 'Documents'));
    expect(documentsFolder('/home/ana/Documentos', '/home/ana')).toBe('/home/ana/Documentos');
  });

  it('valida claves, listas de sitios y nombres de carpeta', () => {
    expect(isSecret('abc-123_XYZ')).toBe(true);
    expect(isSecret('con espacio')).toBe(false);
    expect(isSecret('')).toBe(false);
    expect(cleanHostList('nas.lan, fotos.casa\nmas.org')).toBe('nas.lan,fotos.casa,mas.org');
    expect(cleanHostList('x'.repeat(3000))).toBeNull();
    expect(cleanHostList('a"b')).toBeNull();
    expect(folderName('Boca: Juniors/2027?')).toBe('Boca Juniors 2027');
    expect(folderName('..')).toBe('Agenda');
    expect(folderName('CON')).toBe('Agenda');
  });

  it('cada agenda tiene su carpeta, creada al hacer falta, con el nombre de la agenda y sin pisar a otra', async () => {
    const a = await store.projectDir('id-a', 'Boca Juniors 2027');
    expect(a).toBe(path.join(docs, 'Heritage Studio', 'Boca Juniors 2027'));
    expect((await stat(a)).isDirectory()).toBe(true);
    expect(JSON.parse(await readFile(path.join(a, PROJECT_MARKER), 'utf8'))).toMatchObject({ id: 'id-a' });
    expect(await store.projectDir('id-a', 'Otro nombre')).toBe(a);
    const b = await store.projectDir('id-b', 'Boca Juniors 2027');
    expect(b).toBe(path.join(docs, 'Heritage Studio', 'Boca Juniors 2027 (2)'));
  });

  it('listar no crea la carpeta de una agenda que todavía no la tiene', async () => {
    expect(await store.existingProjectDir('id-x')).toBeNull();
    expect(await stat(path.join(docs, 'Heritage Studio')).catch(() => null)).toBeNull();
  });

  it('una carpeta que se movió o se renombró dentro de la raíz se vuelve a encontrar, con todo lo que tenía', async () => {
    const a = await store.projectDir('id-a', 'Mi agenda');
    await mkdir(path.join(a, 'imagenes'));
    await writeFile(path.join(a, 'imagenes', 'foto.jpg'), 'x');
    const renamed = path.join(path.dirname(a), 'Mi agenda vieja');
    await rename(a, renamed);
    expect(await store.projectDir('id-a', 'Mi agenda')).toBe(renamed);
    expect((await stat(path.join(renamed, 'imagenes', 'foto.jpg'))).isFile()).toBe(true);
    // Y queda recordada para la próxima vez.
    expect(await make().projectDir('id-a', 'Mi agenda')).toBe(renamed);
    expect(JSON.parse(await readFile(path.join(dir, 'user', 'tools.json'), 'utf8')).projects['id-a']).toBe(renamed);
  });

  it('una carpeta movida junto a donde estaba se encuentra; una borrada se crea de nuevo sin romper nada', async () => {
    const mine = path.join(dir, 'Elegida');
    await mkdir(mine);
    await store.setRoot(mine);
    const a = await store.projectDir('id-a', 'Agenda');
    const elsewhere = path.join(path.dirname(a), 'Subcarpeta');
    await mkdir(elsewhere);
    await rename(a, path.join(elsewhere, 'Agenda'));
    // Lo movieron adentro de otra carpeta de la raíz: no se ve en el primer nivel, así que se hace una nueva (sin perder la anterior).
    const fresh = await store.projectDir('id-a', 'Agenda');
    expect((await stat(fresh)).isDirectory()).toBe(true);
    await rm(fresh, { recursive: true });
    const again = await store.projectDir('id-a', 'Agenda');
    expect((await stat(again)).isDirectory()).toBe(true);
  });

  it('una carpeta de lectura se agrega, no se repite y se quita', async () => {
    const f = path.join(dir, 'Descargas');
    await store.addFolder(f);
    await store.addFolder(f);
    expect((await store.status()).folders).toEqual([f]);
    await store.removeFolder(f);
    expect((await store.status()).folders).toEqual([]);
  });
});
