/**
 * Prueba de humo del puente en vivo sobre la aplicación de escritorio empaquetada: la lanza con un
 * perfil vacío, espera a que deje su `live.json`, se conecta a su socket como lo haría el servidor
 * MCP y comprueba que la página contesta (la versión que dice es la de package.json). Al terminar la
 * cierra y comprueba que no dejó el archivo ni el socket.
 *
 *   tsx scripts/live-smoke.ts -- <ejecutable> [argumentos…]
 *   tsx scripts/live-smoke.ts -- "release/linux-unpacked/agenda-heritage-studio" --no-sandbox
 *
 * En Linux hace falta una pantalla (en CI, `xvfb-run -a`).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectLive, findLiveApp } from '../electron/lib/live.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function smokeLive(command: string, args: readonly string[], timeoutMs = 90_000): Promise<string[]> {
  const problems: string[] = [];
  const profile = await mkdtemp(join(tmpdir(), 'heritage-live-smoke-'));
  const env = { ...process.env, XDG_CONFIG_HOME: profile, APPDATA: profile, HOME: profile };
  const child = spawn(command, [...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const where = { env: { XDG_CONFIG_HOME: profile, APPDATA: profile }, platform: process.platform, home: profile };
  try {
    const until = Date.now() + timeoutMs;
    let found = await findLiveApp(where);
    while (!found && Date.now() < until && child.exitCode === null) {
      await sleep(250);
      found = await findLiveApp(where);
    }
    if (!found) return [`La aplicación no dejó su live.json en ${timeoutMs / 1000} s.${stderr ? ` Salida de errores: ${stderr.slice(0, 300)}` : ''}`];
    // La página tarda un poco más en instalar su atención que el proceso en abrir el socket.
    const link = await connectLive({ endpoint: found.endpoint, token: found.token });
    try {
      if ((await link.request('ping')) !== 'pong') problems.push('ping no contestó pong.');
      type Info = { enabled?: boolean; open?: boolean; appVersion?: string };
      const ask = async (): Promise<Info | null> => {
        while (Date.now() < until) {
          try {
            return (await link.request('design.info')) as Info;
          } catch {
            await sleep(500);
          }
        }
        return null;
      };
      const info = await ask();
      const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
      if (!info) problems.push('La página no contestó design.info.');
      else {
        if (info.appVersion !== version) problems.push(`La versión es ${String(info.appVersion)} y debería ser ${version}.`);
        if (info.enabled !== true) problems.push('El enlace debería estar permitido por defecto.');
      }
    } finally {
      link.close();
    }
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(15_000)]);
    if (existsSync(found.endpoint) && !found.endpoint.startsWith('\\\\')) problems.push('Al cerrarse la aplicación quedó el archivo del socket.');
    if (await findLiveApp(where)) problems.push('Al cerrarse la aplicación quedó el live.json.');
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true });
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const sep = process.argv.indexOf('--');
  if (sep < 0 || sep === process.argv.length - 1) {
    console.error('Uso: live-smoke -- <ejecutable> [argumentos…]');
    process.exit(2);
  }
  const [command, ...args] = process.argv.slice(sep + 1);
  const problems = await smokeLive(command!, args);
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log('El puente en vivo funciona.');
}
