/**
 * Arrastres con vista previa: el limitador por cuadro y la vista previa transitoria del almacén
 * (no entra al historial ni se guarda; se confirma una vez, como un solo paso de deshacer).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesign } from '../../src/core/design/defaults';
import { frameThrottle, type FrameClock } from '../../src/app/state/frame';
import type { Recipe } from '../../src/app/state/store';

// El almacén guarda en IndexedDB (no existe en Node): se reemplaza por un doble que anota los guardados.
const saved: string[] = [];
vi.mock('../../src/app/state/persist', () => ({ saveDesign: vi.fn(async (d: { updatedAt: string }) => void saved.push(d.updatedAt)) }));

const { applyRecipe, flushSave, useStore } = await import('../../src/app/state/store');

/** Reloj de cuadros manual: guarda lo pedido y se avanza a mano. */
function fakeClock(): FrameClock & { frames: Map<number, () => void>; run(): void } {
  const frames = new Map<number, () => void>();
  let next = 1;
  return {
    frames,
    request: (callback) => {
      frames.set(next, callback);
      return next++;
    },
    cancel: (handle) => void frames.delete(handle),
    run: () => {
      const due = [...frames.values()];
      frames.clear();
      for (const f of due) f();
    },
  };
}

describe('frameThrottle', () => {
  it('entrega solo el último valor, una vez por cuadro', () => {
    const clock = fakeClock();
    const seen: number[] = [];
    const throttle = frameThrottle<number>((v) => seen.push(v), clock);
    throttle.push(1);
    throttle.push(2);
    throttle.push(3);
    expect(seen).toEqual([]);
    expect(clock.frames.size).toBe(1);
    clock.run();
    expect(seen).toEqual([3]);
    throttle.push(4);
    clock.run();
    expect(seen).toEqual([3, 4]);
  });

  it('flush entrega ya lo pendiente y el cuadro pedido no vuelve a entregarlo', () => {
    const clock = fakeClock();
    const seen: number[] = [];
    const throttle = frameThrottle<number>((v) => seen.push(v), clock);
    throttle.push(7);
    throttle.flush();
    expect(seen).toEqual([7]);
    expect(clock.frames.size).toBe(0);
    clock.run();
    expect(seen).toEqual([7]);
    // Sin nada pendiente, flush no hace nada.
    throttle.flush();
    expect(seen).toEqual([7]);
  });

  it('cancel descarta lo pendiente', () => {
    const clock = fakeClock();
    const seen: number[] = [];
    const throttle = frameThrottle<number>((v) => seen.push(v), clock);
    throttle.push(1);
    throttle.cancel();
    clock.run();
    expect(seen).toEqual([]);
  });
});

describe('vista previa y confirmación', () => {
  const setInk =
    (color: string): Recipe =>
    (d) =>
      void (d.theme.tokens = { colors: { ink: color } });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2027-01-01T10:00:00.000Z'));
    saved.length = 0;
    const st = useStore.getState();
    st.closeDesign();
    st.setDesign(createDesign('heritage', { year: 2027, locale: 'es-AR' }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('la vista previa no toca el historial, la revisión ni el guardado', async () => {
    const before = useStore.getState();
    before.preview(setInk('#112233'), 'tok:ink');
    const after = useStore.getState();
    expect(after.design).toBe(before.design);
    expect(after.previewDesign).not.toBeNull();
    expect(after.previewDesign?.theme.tokens).toEqual({ colors: { ink: '#112233' } });
    expect(after.previewBase).toBe(before.design);
    expect(after.past).toHaveLength(0);
    expect(after.revision).toBe(before.revision);
    saved.length = 0;
    await flushSave();
    // Solo se guarda lo confirmado (la apertura de la agenda); la vista previa no.
    expect(JSON.stringify(saved)).not.toContain('#112233');
  });

  it('cada cuadro se arma sobre el diseño confirmado (valores absolutos, sin acumular)', () => {
    const st = useStore.getState();
    st.preview(setInk('#111111'), 'tok:ink');
    st.preview(setInk('#222222'), 'tok:ink');
    expect(useStore.getState().previewDesign?.theme.tokens).toEqual({ colors: { ink: '#222222' } });
  });

  it('una receta que no cambia nada no deja vista previa', () => {
    useStore.getState().preview(() => undefined, 'nada');
    expect(useStore.getState().previewDesign).toBeNull();
  });

  it('confirmar adopta la vista previa del mismo control: un paso de historial y el mismo diseño', () => {
    const st = useStore.getState();
    const base = st.design;
    const revision = st.revision;
    st.preview(setInk('#334455'), 'tok:ink');
    const preview = useStore.getState().previewDesign;
    st.commit(setInk('#334455'), 'tok:ink');
    const done = useStore.getState();
    expect(done.design).toBe(preview);
    expect(done.previewDesign).toBeNull();
    expect(done.previewBase).toBeNull();
    expect(done.past).toEqual([base]);
    expect(done.revision).toBe(revision + 1);
  });

  it('confirmar sin vista previa, o de otro control, aplica la receta como un cambio normal', () => {
    const st = useStore.getState();
    st.commit(setInk('#abcdef'), 'tok:ink');
    expect(useStore.getState().design?.theme.tokens).toEqual({ colors: { ink: '#abcdef' } });
    expect(useStore.getState().past).toHaveLength(1);

    st.preview(setInk('#111111'), 'otro');
    st.commit(setInk('#999999'), 'tok:ink');
    const done = useStore.getState();
    expect(done.design?.theme.tokens).toEqual({ colors: { ink: '#999999' } });
    expect(done.previewDesign).toBeNull();
  });

  it('si el diseño cambió mientras tanto, la vista previa vieja no se adopta', () => {
    const st = useStore.getState();
    st.preview(setInk('#111111'), 'tok:ink');
    // Otro cambio confirmado (p. ej. deshacer o editar otra cosa) cambia la base.
    st.update((d) => void (d.name = 'Otro nombre'));
    st.preview(setInk('#111111'), 'tok:ink');
    st.update((d) => void (d.name = 'Y otro más'));
    st.commit(setInk('#555555'), 'tok:ink');
    const done = useStore.getState();
    expect(done.design?.name).toBe('Y otro más');
    expect(done.design?.theme.tokens).toEqual({ colors: { ink: '#555555' } });
  });

  it('los cambios seguidos del mismo control se funden en un paso de deshacer', () => {
    const st = useStore.getState();
    const base = st.design;
    st.commit(setInk('#101010'), 'tok:ink');
    vi.setSystemTime(Date.now() + 200);
    st.commit(setInk('#202020'), 'tok:ink');
    expect(useStore.getState().past).toEqual([base]);
    // Pasada la ventana, es otro paso.
    vi.setSystemTime(Date.now() + 2000);
    st.commit(setInk('#303030'), 'tok:ink');
    expect(useStore.getState().past).toHaveLength(2);
  });

  it('una receta que no cambia nada no crea un paso de historial', () => {
    const st = useStore.getState();
    const name = st.design!.name;
    st.update(() => undefined);
    // Poner el mismo valor tampoco cambia nada.
    st.update((d) => void (d.name = name));
    expect(useStore.getState().past).toHaveLength(0);
    expect(useStore.getState().revision).toBe(st.revision);
  });

  it('deshacer y rehacer descartan la vista previa y suben la revisión', () => {
    const st = useStore.getState();
    st.update((d) => void (d.name = 'Cambiada'));
    const revision = useStore.getState().revision;
    st.preview(setInk('#777777'), 'tok:ink');
    st.undo();
    expect(useStore.getState().previewDesign).toBeNull();
    expect(useStore.getState().revision).toBe(revision + 1);
    st.preview(setInk('#777777'), 'tok:ink');
    st.redo();
    expect(useStore.getState().previewDesign).toBeNull();
    expect(useStore.getState().revision).toBe(revision + 2);
  });

  it('clearPreview cancela el arrastre', () => {
    const st = useStore.getState();
    st.preview(setInk('#777777'), 'tok:ink');
    st.clearPreview();
    const s = useStore.getState();
    expect(s.previewDesign).toBeNull();
    expect(s.previewBase).toBeNull();
    expect(s.previewKey).toBeNull();
  });

  it('cerrar o abrir otra agenda descarta la vista previa', () => {
    const st = useStore.getState();
    st.preview(setInk('#777777'), 'tok:ink');
    st.setDesign(createDesign('minimal', { year: 2028, locale: 'es-AR' }));
    expect(useStore.getState().previewDesign).toBeNull();
    st.preview(setInk('#888888'), 'tok:ink');
    st.closeDesign();
    expect(useStore.getState().previewDesign).toBeNull();
  });
});

describe('applyRecipe', () => {
  it('devuelve el mismo diseño si la receta no cambia nada, y marca la fecha si cambia', () => {
    const design = createDesign('heritage', { year: 2027, locale: 'es-AR' });
    expect(applyRecipe(design, () => undefined)).toBe(design);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-05-05T00:00:00.000Z'));
    const next = applyRecipe(design, (d) => void (d.name = 'Nuevo'));
    vi.useRealTimers();
    expect(next).not.toBe(design);
    expect(next.name).toBe('Nuevo');
    expect(next.updatedAt).toBe('2030-05-05T00:00:00.000Z');
    // Lo que no se tocó sigue siendo el mismo objeto (de ahí sale la reutilización de documentos).
    expect(next.sections).toBe(design.sections);
    expect(next.persona).toBe(design.persona);
  });
});
