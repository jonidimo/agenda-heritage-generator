/**
 * Registro de descargas del escritorio: la página se entera de dónde quedó un PDF y puede abrirlo o
 * mostrar su carpeta, pero solo de lo que se descargó de verdad. Sin Electron.
 */
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, DownloadLog, MAX_KEPT, sysRequestAllowed, sysRoute } from '../electron/lib/downloads.mjs';

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    setTimer: (callback: () => void): number => {
      pending.set(next, callback);
      return next++;
    },
    clearTimer: (handle: unknown): void => void pending.delete(handle as number),
    count: (): number => pending.size,
    fireAll: (): void => {
      for (const [id, cb] of [...pending]) {
        pending.delete(id);
        cb();
      }
    },
  };
}

describe('registro de descargas', () => {
  it('lo que termina queda con su ruta; lo que se canceló, sin ruta', () => {
    const log = new DownloadLog();
    const a = log.start('a.pdf');
    const b = log.start('b.pdf');
    expect(log.endedAfter(0)).toEqual([]);
    log.finish(a, 'completed', '/tmp/a.pdf');
    log.finish(b, 'cancelled', '/tmp/no-se-guardó.pdf');
    expect(log.endedAfter(0).map((x) => [x.id, x.state, x.path])).toEqual([[a, 'completed', '/tmp/a.pdf'], [b, 'cancelled', null]]);
    expect(log.endedAfter(a).map((x) => x.id)).toEqual([b]);
  });

  it('solo se puede abrir una ruta que se guardó de verdad', () => {
    const log = new DownloadLog();
    const a = log.start('a.pdf');
    expect(log.hasSaved('/tmp/a.pdf')).toBe(false);
    log.finish(a, 'completed', '/tmp/a.pdf');
    expect(log.hasSaved('/tmp/a.pdf')).toBe(true);
    expect(log.hasSaved('/tmp/a.pdf/../../etc/passwd')).toBe(false);
    expect(log.hasSaved('/etc/passwd')).toBe(false);
    const c = log.start('c.pdf');
    log.finish(c, 'interrupted', '/tmp/c.pdf');
    expect(log.hasSaved('/tmp/c.pdf')).toBe(false);
  });

  it('espera a que termine una descarga y se despierta apenas termina', async () => {
    const timers = fakeTimers();
    const log = new DownloadLog(timers);
    const id = log.start('a.pdf');
    const waiting = log.wait(0, 60_000);
    expect(timers.count()).toBe(1);
    log.finish(id, 'completed', '/tmp/a.pdf');
    expect((await waiting).map((x) => x.id)).toEqual([id]);
    // El temporizador se cancela: no queda nada pendiente.
    expect(timers.count()).toBe(0);
  });

  it('si no termina nada en el tiempo pedido, devuelve vacío; sin tiempo, responde ya', async () => {
    const timers = fakeTimers();
    const log = new DownloadLog(timers);
    log.start('lenta.pdf');
    const waiting = log.wait(0, 5000);
    timers.fireAll();
    expect(await waiting).toEqual([]);
    expect(await log.wait(0, 0)).toEqual([]);
  });

  it('una descarga que ya terminó antes de preguntar se devuelve al instante', async () => {
    const log = new DownloadLog();
    const id = log.start('a.pdf');
    log.finish(id, 'completed', '/tmp/a.pdf');
    expect((await log.wait(0, 60_000)).map((x) => x.id)).toEqual([id]);
  });

  it('el tiempo de espera tiene tope y un valor raro no cuelga nada', async () => {
    const timers = fakeTimers();
    const log = new DownloadLog(timers);
    log.start('x.pdf');
    void log.wait(0, Number.POSITIVE_INFINITY);
    void log.wait(0, Number.NaN);
    expect(timers.count()).toBe(0);
  });

  it('recuerda solo las últimas descargas terminadas', () => {
    const log = new DownloadLog();
    for (let i = 0; i < MAX_KEPT + 5; i++) log.finish(log.start(`${i}.pdf`), 'completed', `/tmp/${i}.pdf`);
    expect(log.endedAfter(0)).toHaveLength(MAX_KEPT);
    expect(log.hasSaved('/tmp/0.pdf')).toBe(false);
    expect(log.hasSaved(`/tmp/${MAX_KEPT + 4}.pdf`)).toBe(true);
  });
});

describe('quién puede pedir', () => {
  it('una petición sin encabezados (como llegan las de la propia página) se atiende', () => {
    expect(sysRequestAllowed(null, null)).toBe(true);
    expect(sysRequestAllowed(APP_ORIGIN, 'same-origin')).toBe(true);
    expect(sysRequestAllowed(null, 'none')).toBe(true);
  });

  it('una que dice venir de otro lado, no', () => {
    expect(sysRequestAllowed('https://example.org', null)).toBe(false);
    expect(sysRequestAllowed('app://otra', null)).toBe(false);
    expect(sysRequestAllowed(null, 'cross-site')).toBe(false);
    expect(sysRequestAllowed(APP_ORIGIN, 'cross-site')).toBe(false);
  });

  it('las rutas que existen y nada más', () => {
    expect(sysRoute('/_sys/downloads')).toBe('downloads');
    expect(sysRoute('/_sys/reveal')).toBe('reveal');
    expect(sysRoute('/_sys/open')).toBe('open');
    expect(sysRoute('/_sys/otra')).toBeNull();
    expect(sysRoute('/_sys/downloads/../x')).toBeNull();
    expect(sysRoute('/index.html')).toBeNull();
  });
});
