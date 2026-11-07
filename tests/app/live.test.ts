/** El puente en vivo del lado de la página: permisos, lectura, cambios como un paso que se deshace y conflictos. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createDesign } from '../../src/core/design/defaults';
import { parseDesign } from '../../src/core/design/schema';
import { LIVE_CODES } from '../../src/core/live/protocol';
import { handleLive } from '../../src/app/state/live';
import { resources } from '../../src/app/state/resources';
import { useStore } from '../../src/app/state/store';
import { readFileSync } from 'node:fs';
import { toBase64 } from '../../src/core/resources';

const DORSAL = new Uint8Array(readFileSync('e2e/fixtures/dorsal-prueba.ttf'));
const DORSAL_SPEC = { family: 'Dorsal Prueba', weight: 400, style: 'normal' as const };

const fresh = () => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

const ask = (method: string, params?: unknown) => handleLive({ method, params });
const ok = async (method: string, params?: unknown) => {
  const r = await ask(method, params);
  if (!r.ok) throw new Error(`${method}: ${r.message}`);
  return r.result as Record<string, unknown>;
};

beforeEach(() => {
  useStore.setState({ design: null, past: [], future: [], liveLink: true, aiNotice: null, revision: 0, mode: 'design', pageIndex: 0 });
  useStore.getState().setDesign(fresh());
});

describe('permiso', () => {
  it('sin permiso solo se puede preguntar si lo hay: nada de leer ni cambiar', async () => {
    useStore.getState().setLiveLink(false);
    expect(await ok('design.info')).toMatchObject({ enabled: false, open: true });
    for (const [method, params] of [['design.get', {}], ['design.patch', { patch: [{ op: 'replace', path: '/name', value: 'x' }] }], ['library.list', {}], ['view.reveal', { page: 1 }]] as const) {
      expect(await ask(method, params)).toMatchObject({ ok: false, code: LIVE_CODES.disabled });
    }
    expect(useStore.getState().design!.name).not.toBe('x');
    useStore.getState().setLiveLink(true);
  });

  it('un pedido que no es de los conocidos, o con parámetros mal formados, se rechaza sin tocar nada', async () => {
    expect(await handleLive(null)).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('design.exec', {})).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('design.patch', { patch: [] })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('design.patch', { patch: 'no' })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('design.patch', { patch: [{ op: 'replace', path: '/name', value: 'x' }], baseRevision: -1 })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('view.reveal', { page: 0 })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
  });
});

describe('design.info y design.get', () => {
  it('cuenta qué hay abierto y su revisión', async () => {
    const info = await ok('design.info');
    expect(info).toMatchObject({ enabled: true, open: true, year: 2027, mode: 'design', revision: useStore.getState().revision });
    expect(info.pageCount).toBeUndefined(); // sin recursos cargados la agenda no se arma: no se inventa
  });

  it('sin agenda abierta lo dice, y lo demás da un error claro', async () => {
    useStore.getState().closeDesign();
    expect(await ok('design.info')).toMatchObject({ open: false });
    expect(await ask('design.get')).toMatchObject({ ok: false, code: LIVE_CODES.noDesign });
    expect(await ask('design.patch', { patch: [{ op: 'replace', path: '/name', value: 'x' }] })).toMatchObject({ ok: false, code: LIVE_CODES.noDesign });
  });

  it('design.get da la agenda como JSON, y con assets trae adentro los datos de las imágenes propias', async () => {
    useStore.getState().update((d) => void d.assets.push({ id: 'mi-img', name: 'Mi imagen', kind: 'raster', mime: 'image/png', width: 1, height: 1, builtin: null }));
    resources.assetBytes.set('mi-img', new Uint8Array([1, 2, 3, 4]));
    const plain = await ok('design.get', {});
    const withData = await ok('design.get', { assets: true });
    const find = (r: Record<string, unknown>) => ((r.design as { assets: Array<{ id: string; data?: string | null }> }).assets.find((a) => a.id === 'mi-img')!);
    expect(find(plain).data ?? null).toBeNull();
    expect(find(withData).data).toBe('AQIDBA==');
    expect(plain.revision).toBe(useStore.getState().revision);
    // Una copia: tocarla no toca la agenda.
    (plain.design as { name: string }).name = 'cambiado afuera';
    expect(useStore.getState().design!.name).not.toBe('cambiado afuera');
  });
});

describe('design.patch', () => {
  const rename = (value: string) => ({ patch: [{ op: 'replace', path: '/name', value }] });

  it('es un solo paso que se deshace, avisa y sube la revisión', async () => {
    const before = useStore.getState().design!;
    const rev = useStore.getState().revision;
    const r = await ok('design.patch', { ...rename('Hecho por un modelo'), baseRevision: rev });
    expect(r).toMatchObject({ applied: true, revision: rev + 1 });
    const s = useStore.getState();
    expect(s.design!.name).toBe('Hecho por un modelo');
    expect(s.past).toHaveLength(1);
    expect(s.aiNotice).toMatchObject({ revision: s.revision });
    s.undo();
    expect(useStore.getState().design!.name).toBe(before.name);
  });

  it('cada pedido es su propio paso aunque lleguen seguidos', async () => {
    await ok('design.patch', rename('Uno'));
    await ok('design.patch', rename('Dos'));
    expect(useStore.getState().past).toHaveLength(2);
    useStore.getState().undo();
    expect(useStore.getState().design!.name).toBe('Uno');
  });

  it('si la agenda cambió desde la revisión que el cliente leyó, se rechaza con conflicto y no se pisa', async () => {
    const rev = useStore.getState().revision;
    useStore.getState().update((d) => void (d.name = 'Lo escribió la persona'));
    const r = await ask('design.patch', { ...rename('Del modelo'), baseRevision: rev });
    expect(r).toMatchObject({ ok: false, code: LIVE_CODES.conflict });
    expect(useStore.getState().design!.name).toBe('Lo escribió la persona');
    expect(useStore.getState().aiNotice).toBeNull();
  });

  it('un cambio que deja la agenda inválida vuelve con los problemas y no se aplica', async () => {
    const name = useStore.getState().design!.name;
    const r = await ok('design.patch', { patch: [{ op: 'replace', path: '/calendar/year', value: 'dos mil' }] });
    expect(r).toMatchObject({ applied: false, reason: 'invalid' });
    expect((r.issues as Array<{ path: string }>)[0]!.path).toContain('calendar');
    expect(useStore.getState().design!.name).toBe(name);
    expect(useStore.getState().past).toHaveLength(0);
    const bad = await ok('design.patch', { patch: [{ op: 'remove', path: '/no/existe' }] });
    expect(bad).toMatchObject({ applied: false, reason: 'invalid' });
  });

  it('la identidad de la agenda no se puede cambiar desde afuera', async () => {
    const id = useStore.getState().design!.id;
    const r = await ok('design.patch', { patch: [{ op: 'replace', path: '/id', value: 'otra' }] });
    expect(r).toMatchObject({ applied: false });
    expect(useStore.getState().design!.id).toBe(id);
  });

  it('dos pedidos a la vez se atienden de a uno, en orden', async () => {
    const rev = useStore.getState().revision;
    const [a, b] = await Promise.all([ask('design.patch', { ...rename('A'), baseRevision: rev }), ask('design.patch', { ...rename('B'), baseRevision: rev })]);
    // El segundo partía de la revisión que el primero ya cambió: conflicto, no una carrera.
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: false, code: LIVE_CODES.conflict });
    expect(useStore.getState().design!.name).toBe('A');
  });
});

describe('design.load y design.open', () => {
  it('una agenda nueva se abre con una id nueva, aunque traiga la de otra', async () => {
    const mine = useStore.getState().design!.id;
    const incoming = { ...fresh(), id: mine, name: 'Nueva del modelo' };
    const r = await ok('design.load', { design: incoming });
    expect(r.id).not.toBe(mine);
    expect(useStore.getState().design).toMatchObject({ name: 'Nueva del modelo' });
    expect(useStore.getState().design!.id).toBe(r.id);
    expect(useStore.getState().notice).toContain('Nueva del modelo');
  });

  it('una plantilla, una copia de seguridad o algo que no es una agenda no entra (ni toca la biblioteca)', async () => {
    const before = useStore.getState().design!;
    for (const file of [{ kind: 'heritage-backup', designs: [fresh()], templates: [] }, { kind: 'heritage-template', design: fresh() }, { kind: 'otra-cosa' }]) {
      expect(await ask('design.load', { design: file })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    }
    expect(useStore.getState().design).toBe(before);
    expect(await ask('design.load', { design: { calendar: { year: 'no' } } })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('design.load', { design: 'texto' })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
  });

  it('abrir una agenda que no está en la biblioteca da un error claro', async () => {
    expect(await ask('design.open', { id: 'no-existe' })).toMatchObject({ ok: false, code: LIVE_CODES.notFound });
  });
});

describe('view.reveal', () => {
  it('sin recursos cargados la agenda no se arma y lo dice', async () => {
    const r = await ask('view.reveal', { page: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('fuentes propias', () => {
  it('fonts.add deja la fuente en la aplicación (registrada y guardada), y una que no es fuente se rechaza', async () => {
    const r = await ok('fonts.add', { spec: DORSAL_SPEC, data: toBase64(DORSAL) });
    expect(r).toMatchObject({ family: 'Dorsal Prueba', weight: 400, style: 'normal' });
    expect(r.glyphs).toBeGreaterThan(50);
    expect(resources.fonts.resolve(DORSAL_SPEC)?.source).toBe('user');
    expect(resources.userFontBytes.get(String(r.id))?.bytes.length).toBe(DORSAL.length);
    expect(await ask('fonts.add', { spec: DORSAL_SPEC, data: toBase64(new Uint8Array([1, 2, 3, 4, 5, 6])) })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
    expect(await ask('fonts.add', { spec: { family: '' }, data: 'xx' })).toMatchObject({ ok: false, code: LIVE_CODES.invalid });
  });

  it('design.get con assets trae los bytes de cada imagen propia y quita su ruta', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    useStore.getState().update((d) => void d.assets.push({ id: 'con-ruta', name: 'Escudo', kind: 'raster', mime: 'image/png', width: 1, height: 1, builtin: null, path: 'assets/escudo.png' }));
    resources.assetBytes.set('con-ruta', png);
    const got = (await ok('design.get', { assets: true })).design as { assets: Array<{ id: string; data?: string | null; path?: string | null }> };
    expect(got.assets.find((a) => a.id === 'con-ruta')).toMatchObject({ data: toBase64(png), path: null });
    // Sin pedirlas no se tocan.
    const bare = (await ok('design.get', {})).design as { assets: Array<{ id: string; path?: string | null }> };
    expect(bare.assets.find((a) => a.id === 'con-ruta')?.path).toBe('assets/escudo.png');
  });

  it('design.get con fonts trae las fuentes propias que la agenda usa, y solo esas', async () => {
    const added = await ok('fonts.add', { spec: DORSAL_SPEC, data: toBase64(DORSAL) });
    const unused = await ok('fonts.add', { spec: { family: 'Otra Sin Usar', weight: 400, style: 'normal' }, data: toBase64(DORSAL) });
    expect((await ok('design.get', { fonts: true })).design).not.toHaveProperty('userFonts');
    useStore.getState().update((d) => void (d.theme.tokens = { fonts: { title: DORSAL_SPEC } }));
    const got = (await ok('design.get', { fonts: true })).design as { userFonts?: Array<{ id: string; data: string }> };
    expect(got.userFonts?.map((f) => f.id)).toEqual([added.id]);
    expect(got.userFonts?.[0]?.data).toBe(toBase64(DORSAL));
    expect(got.userFonts?.map((f) => f.id)).not.toContain(unused.id);
    // Sin pedirlas, no van.
    expect((await ok('design.get', {})).design).not.toHaveProperty('userFonts');
  });

  it('un cambio que trae userFonts las deja en la aplicación y la agenda no guarda su base64', async () => {
    const before = useStore.getState().revision;
    const r = await ok('design.patch', { patch: [{ op: 'add', path: '/userFonts', value: [{ id: 'font-del-modelo', spec: DORSAL_SPEC, data: toBase64(DORSAL) }] }] });
    expect(r).toMatchObject({ applied: true });
    expect(useStore.getState().revision).toBeGreaterThan(before);
    expect(useStore.getState().design).not.toHaveProperty('userFonts');
    // Queda una sola «Dorsal Prueba» (si ya estaba igual, no se duplica), con sus bytes.
    const dorsal = () => [...resources.userFontBytes.values()].filter((f) => f.spec.family === DORSAL_SPEC.family);
    expect(dorsal().map((f) => f.bytes.length)).toEqual([DORSAL.length]);
    expect(resources.fonts.resolve(DORSAL_SPEC)?.source).toBe('user');
    // Otra fuente con el mismo nombre no pisa la de este equipo (otras agendas la usan).
    const other = new Uint8Array(readFileSync('public/fonts/manrope/Manrope-Bold.ttf'));
    expect(await ok('design.patch', { patch: [{ op: 'replace', path: '/name', value: 'Otra' }, { op: 'add', path: '/userFonts', value: [{ id: 'font-ajena', spec: DORSAL_SPEC, data: toBase64(other) }] }] })).toMatchObject({ applied: true });
    expect(dorsal().map((f) => f.bytes.length)).toEqual([DORSAL.length]);
    expect(resources.userFontBytes.has('font-ajena')).toBe(false);
  });
});
