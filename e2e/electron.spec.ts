/**
 * Aplicación de escritorio: la ventana tiene que aparecer sola, también sin aceleración gráfica
 * (como en un equipo donde la pila gráfica no arranca). Necesita `npm run build` y una pantalla
 * (en CI, `xvfb-run`).
 */
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { smokeMcp } from '../scripts/mcp-smoke';
import { connectLive, findLiveApp, LIVE_ERRORS } from '../electron/lib/live.mjs';
import { DATA_FOLDERS, type DesktopPlatform } from '../src/app/state/platform';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Ruta del ejecutable de Electron (el módulo `electron`, en Node, exporta su ubicación). */
const ELECTRON = createRequire(import.meta.url)('electron') as string;

let profile = '';
let app: ElectronApplication | null = null;

test.beforeEach(async () => {
  // Perfil aparte: la aplicación guarda sus datos en $XDG_CONFIG_HOME (o %APPDATA%).
  profile = await mkdtemp(join(tmpdir(), 'heritage-e2e-'));
});

test.afterEach(async () => {
  await app?.close();
  app = null;
  await rm(profile, { recursive: true, force: true });
});

/**
 * Lanza la aplicación. `--no-sandbox`: los equipos de CI y los contenedores no pueden usar el
 * entorno aislado de Chromium (y esta prueba no trata de eso).
 */
async function launch(...flags: string[]): Promise<ElectronApplication> {
  app = await electron.launch({ args: [ROOT, '--no-sandbox', ...flags], env: { ...process.env, XDG_CONFIG_HOME: profile, APPDATA: profile } });
  return app;
}

for (const flags of [[], ['--disable-gpu']]) {
  test(`la ventana se muestra sola${flags.length > 0 ? ` (${flags.join(' ')})` : ''}`, async () => {
    const electronApp = await launch(...flags);
    const win = await electronApp.firstWindow();
    const visible = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()));
    await expect.poll(visible).toBe(true);
    // Y es la aplicación, ya cargada, no una ventana vacía.
    expect(win.url()).toBe('app://heritage/');
    await expect(win.locator('#root > *').first()).toBeVisible();
    // En texto: este proyecto no incluye los tipos del navegador.
    expect(await win.evaluate<string>('document.visibilityState')).toBe('visible');
    // Un arranque normal no necesita el relanzamiento sin GPU.
    expect(await electronApp.evaluate(() => process.argv.includes('--gpu-fallback'))).toBe(false);
  });
}

/** Abre la aplicación con la interfaz en español y crea una agenda (la ventana arranca con el asistente). */
async function launchWithPlanner(): Promise<{ electronApp: ElectronApplication; win: Awaited<ReturnType<ElectronApplication['firstWindow']>> }> {
  const electronApp = await launch();
  const win = await electronApp.firstWindow();
  await win.evaluate("localStorage.setItem('agenda-studio.uiLang', 'es')");
  await win.reload();
  await win.getByRole('button', { name: 'Crear agenda' }).click();
  await expect(win.locator('[data-page-index]').first()).toBeVisible({ timeout: 90_000 });
  return { electronApp, win };
}

const PLATFORM_OF: Readonly<Record<string, DesktopPlatform>> = { linux: 'linux', win32: 'windows', darwin: 'mac' };

test('el zoom con el teclado llega a la página (el menú de la aplicación no lo intercepta)', async () => {
  const { win } = await launchWithPlanner();
  const zoom = () => win.evaluate<number>('globalThis.__agenda.getState().zoom');
  expect(await zoom()).toBe(1);
  await win.keyboard.press('Control+Equal');
  await expect.poll(zoom).toBeCloseTo(1.2, 5);
  await win.keyboard.press('Control+Minus');
  await expect.poll(zoom).toBeCloseTo(1, 5);
  await win.keyboard.press('Control+Equal');
  await win.keyboard.press('Control+0');
  await expect.poll(() => win.evaluate<boolean>('globalThis.__agenda.getState().fit')).toBe(true);
});

test('«Acerca de» muestra la carpeta de datos de la aplicación de escritorio', async () => {
  const { win } = await launchWithPlanner();
  await win.getByRole('button', { name: 'Archivo' }).click();
  await win.getByRole('menuitem', { name: 'Acerca de Heritage Studio…' }).click();
  const about = win.getByRole('dialog', { name: 'Acerca de Heritage Studio' });
  await expect(about).toBeVisible();
  const platform = PLATFORM_OF[process.platform];
  expect(platform).toBeTruthy();
  await expect(about.getByText(/están en esta carpeta de tu equipo/)).toBeVisible();
  await expect(about.locator('code')).toHaveText(DATA_FOLDERS[platform!]);
  // El tamaño de la interfaz también se cambia desde el menú.
  await win.keyboard.press('Escape');
  await win.getByRole('button', { name: 'Archivo' }).click();
  await win.getByRole('menuitem', { name: '110 %' }).click();
  await expect.poll(() => win.evaluate('document.documentElement.style.zoom')).toBe('1.1');
});

test('con --mcp es un servidor MCP: sin ventana, la salida estándar es solo del protocolo y termina al cerrarse la entrada', async () => {
  // `--ozone-platform=headless` (Linux): los clientes de IA lanzan el servidor sin DISPLAY.
  const report = await smokeMcp({
    command: ELECTRON,
    args: [ROOT, '--no-sandbox', ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), '--mcp'],
    // Sin AGENDA_PUBLIC_DIR: la aplicación usa su propia carpeta dist/.
    env: { XDG_CONFIG_HOME: profile, APPDATA: profile },
  });
  expect(report.problems).toEqual([]);
  expect(report.tools).toHaveLength(13);
});

test('como Node puro (ELECTRON_RUN_AS_NODE) también es un servidor MCP: es la forma que funciona en Windows', async () => {
  // Sin AGENDA_PUBLIC_DIR: el paquete encuentra la carpeta dist/ que lo acompaña.
  const report = await smokeMcp({ command: ELECTRON, args: [join(ROOT, 'dist-mcp', 'main.mjs')], env: { ELECTRON_RUN_AS_NODE: '1' } });
  expect(report.problems).toEqual([]);
  expect(report.tools).toHaveLength(13);
});

test('el editor de texto en su lugar abre sin violar la política de seguridad (la letra se carga desde sus bytes)', async () => {
  const { win } = await launchWithPlanner();
  await win.evaluate(`globalThis.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => globalThis.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    globalThis.__agenda.getState().update((d) => { d.persona.name = 'Norma'; }, 'e2e-name');`);
  await win.locator('[data-block="title.name"]').first().dblclick({ force: true });
  const editor = win.locator('[data-text-editor]');
  await expect(editor).toBeFocused();
  await win.keyboard.type('Ana');
  await expect.poll(() => win.evaluate<string | null>('globalThis.__agenda.getState().previewDesign?.persona.name ?? null')).toContain('Ana');
  await win.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  expect(await win.evaluate<string[]>('globalThis.__csp')).toEqual([]);
});

test('al exportar un PDF se ve dónde quedó, y «Abrir carpeta» solo abre lo que la aplicación guardó', async () => {
  const { electronApp, win } = await launchWithPlanner();
  const out = join(profile, 'salida');
  await mkdir(out, { recursive: true });
  // El «Guardar como» del sistema se reemplaza por una ruta fija.
  await electronApp.evaluate(({ session }, dir) => {
    session.defaultSession.on('will-download', (_event, item) => item.setSavePath(`${dir}/${item.getFilename()}`));
  }, out);
  await win.getByRole('button', { name: 'Impresión', exact: true }).click();
  await win.getByRole('button', { name: 'Hoja de calibración' }).click();
  const box = win.getByTestId('last-export');
  await expect(box).toBeVisible({ timeout: 60_000 });
  await expect(box).toContainText(out);
  const saved = (await box.locator('span').first().textContent())!;
  expect((await stat(saved)).size).toBeGreaterThan(1000);

  // Lo que la aplicación guardó se puede mostrar en su carpeta; lo demás, no, venga de donde venga.
  const call = (route: string, path: string) =>
    win.evaluate<{ status: number; ok: boolean }>(
      `fetch('/_sys/${route}', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ${JSON.stringify(path)} }) }).then(async (r) => ({ status: r.status, ok: r.ok && (await r.json()).ok === true }))`,
    );
  expect(await call('reveal', saved)).toEqual({ status: 200, ok: true });
  expect((await call('reveal', '/etc/passwd')).status).toBe(403);
  expect((await call('open', join(out, '..', 'otra.pdf'))).status).toBe(403);
  expect((await call('reveal', `${saved}/../../../etc/passwd`)).status).toBe(403);
  // Y el botón de la pantalla llega al mismo lugar sin errores.
  await box.getByRole('button', { name: 'Abrir carpeta' }).click();
  await expect(box).toBeVisible();
});

test('un archivo de agenda pasado a la aplicación («Abrir con…», doble clic) se abre solo', async () => {
  const file = join(profile, 'Desde el sistema.agenda.json');
  await writeFile(file, JSON.stringify({ name: 'Desde el sistema', calendar: { year: 2031 } }));
  const electronApp = await launch(file);
  const win = await electronApp.firstWindow();
  await expect.poll(() => win.evaluate<string | null>('globalThis.__agenda?.getState().design?.name ?? null'), { timeout: 60_000 }).toBe('Desde el sistema');
  expect(await win.evaluate<number>('globalThis.__agenda.getState().design.calendar.year')).toBe(2031);
  await expect(win.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
});

test('cerrar la ventana espera a que termine el guardado pendiente', async () => {
  const { electronApp, win } = await launchWithPlanner();
  await win.evaluate(`globalThis.__agenda.getState().update((d) => { d.name = 'Último cambio'; }, 'e2e-close')`);
  const closed = electronApp.evaluate(({ BrowserWindow }) => new Promise<void>((resolve) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.once('closed', () => resolve());
    w.close();
  }));
  await closed;
  app = null;
  // Se vuelve a abrir con el mismo perfil: lo último que se escribió está en la biblioteca.
  const again = await launch();
  const w2 = await again.firstWindow();
  await w2.evaluate("localStorage.setItem('agenda-studio.uiLang', 'es')");
  await w2.reload();
  await expect.poll(() => w2.evaluate<string | null>('globalThis.__agenda?.getState().design?.name ?? null'), { timeout: 60_000 }).toBe('Último cambio');
});

test.describe('puente en vivo con un modelo de IA', () => {
  /** Se conecta al socket de la aplicación como lo haría el servidor MCP (por su `live.json`). */
  async function connectToApp() {
    // La aplicación escribe `live.json` al arrancar: se espera a que aparezca.
    await expect.poll(() => findLiveApp({ env: { XDG_CONFIG_HOME: profile, APPDATA: profile }, platform: process.platform, home: profile }), { timeout: 30_000 }).not.toBeNull();
    const found = (await findLiveApp({ env: { XDG_CONFIG_HOME: profile, APPDATA: profile }, platform: process.platform, home: profile }))!;
    return { found, link: await connectLive({ endpoint: found.endpoint, token: found.token }) };
  }

  test('lee la agenda abierta, la cambia como un paso que se deshace y rechaza lo que pisaría un cambio de la persona', async () => {
    const { win } = await launchWithPlanner();
    const { link } = await connectToApp();
    try {
      const info = (await link.request('design.info')) as { open: boolean; enabled: boolean; revision: number; name: string };
      expect(info).toMatchObject({ open: true, enabled: true });
      const got = (await link.request('design.get', {})) as { revision: number; design: { name: string; persona: { name: string } } };
      expect(got.revision).toBe(info.revision);

      // Un cambio del modelo: se ve en la página, queda avisado y se puede deshacer.
      const applied = await link.request('design.patch', { patch: [{ op: 'replace', path: '/persona/name', value: 'Escrito por un modelo' }], baseRevision: got.revision });
      expect(applied).toMatchObject({ applied: true, revision: got.revision + 1 });
      await expect.poll(() => win.evaluate<string>('globalThis.__agenda.getState().design.persona.name')).toBe('Escrito por un modelo');
      await expect(win.getByTestId('ai-notice')).toContainText('Un modelo de IA cambió la agenda');
      await win.getByTestId('ai-notice').getByRole('button', { name: 'Deshacer' }).click();
      await expect.poll(() => win.evaluate<string>('globalThis.__agenda.getState().design.persona.name')).toBe(got.design.persona.name);

      // La persona cambia algo: un parche con la revisión vieja ya no se aplica.
      const stale = (await link.request('design.info')) as { revision: number };
      await win.evaluate(`globalThis.__agenda.getState().update((d) => { d.persona.name = 'Lo puso la persona'; }, 'e2e-person')`);
      await expect(link.request('design.patch', { patch: [{ op: 'replace', path: '/persona/name', value: 'Pisado' }], baseRevision: stale.revision })).rejects.toMatchObject({ code: -32012 });
      expect(await win.evaluate<string>('globalThis.__agenda.getState().design.persona.name')).toBe('Lo puso la persona');

      // Mostrar algo en la aplicación.
      const shown = (await link.request('view.reveal', { page: 5 })) as { page: number };
      expect(shown.page).toBe(5);
      await expect.poll(() => win.evaluate<number>('globalThis.__agenda.getState().pageIndex')).toBe(4);
    } finally {
      link.close();
    }
  });

  test('si la persona desactiva el permiso, solo se puede preguntar; con un token equivocado ni eso', async () => {
    const { win } = await launchWithPlanner();
    const { found, link } = await connectToApp();
    try {
      await win.getByRole('button', { name: 'Archivo' }).click();
      await win.getByRole('menuitem', { name: /Permitir que un modelo de IA edite la agenda abierta/ }).click();
      await expect.poll(() => win.evaluate<boolean>('globalThis.__agenda.getState().liveLink')).toBe(false);
      expect(await link.request('design.info')).toMatchObject({ enabled: false, open: true });
      await expect(link.request('design.get', {})).rejects.toMatchObject({ code: -32010 });
      await expect(link.request('design.patch', { patch: [{ op: 'replace', path: '/name', value: 'x' }] })).rejects.toMatchObject({ code: -32010 });
    } finally {
      link.close();
    }
    await expect(connectLive({ endpoint: found.endpoint, token: 'token-equivocado' })).rejects.toMatchObject({ code: LIVE_ERRORS.unauthorized });
    // El permiso no corta el enlace: con el token correcto se sigue pudiendo preguntar.
    const again = await connectLive({ endpoint: found.endpoint, token: found.token });
    expect(await again.request('design.info')).toMatchObject({ enabled: false });
    again.close();
  });

  test('el servidor MCP del paquete encuentra la aplicación abierta (AGENDA_APP_LINK) y trabaja sobre su agenda', async () => {
    await launchWithPlanner();
    await expect.poll(() => findLiveApp({ env: { XDG_CONFIG_HOME: profile, APPDATA: profile }, platform: process.platform, home: profile }), { timeout: 30_000 }).not.toBeNull();
    const work = await mkdtemp(join(tmpdir(), 'heritage-mcp-live-'));
    try {
      const { spawn } = await import('node:child_process');
      const child = spawn(ELECTRON, [join(ROOT, 'dist-mcp', 'main.mjs')], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', AGENDA_MCP_ROOT: work, AGENDA_APP_LINK: join(profile, 'Heritage Studio (dev)', 'live.json') },
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      let out = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
      const send = (message: object): void => void child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
      const reply = async (id: number): Promise<Record<string, unknown>> => {
        const until = Date.now() + 60_000;
        while (Date.now() < until) {
          const line = out.split('\n').find((l) => l.includes(`"id":${id}`) && l.includes('"result"'));
          if (line) return JSON.parse(line) as Record<string, unknown>;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error(`sin respuesta al pedido ${id}: ${out.slice(0, 400)}`);
      };
      send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } });
      await reply(1);
      send({ method: 'notifications/initialized' });
      send({ id: 2, method: 'tools/call', params: { name: 'app_status', arguments: {} } });
      const status = JSON.parse(((await reply(2)).result as { content: Array<{ text: string }> }).content[0]!.text) as { running: boolean; open: boolean; pageCount: number };
      expect(status).toMatchObject({ running: true, open: true });
      expect(status.pageCount).toBeGreaterThan(50);
      send({ id: 3, method: 'tools/call', params: { name: 'update_design', arguments: { app: true, patch: [{ op: 'replace', path: '/persona/name', value: 'Desde el servidor MCP' }] } } });
      const updated = JSON.parse(((await reply(3)).result as { content: Array<{ text: string }> }).content[0]!.text) as { applied: boolean };
      expect(updated.applied).toBe(true);
      child.stdin.end();
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    const win = app ? await app.firstWindow() : null;
    await expect.poll(() => win!.evaluate<string>('globalThis.__agenda.getState().design.persona.name')).toBe('Desde el servidor MCP');
  });
});
