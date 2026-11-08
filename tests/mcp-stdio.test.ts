/**
 * El servidor MCP como lo arranca un cliente de IA: por entrada y salida estándar, de punta a
 * punta (ver `scripts/mcp-smoke.ts`). Se prueba el paquete compilado que lleva la aplicación de
 * escritorio y también el código fuente. En los dos, la salida estándar es solo del protocolo.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMcpBundle } from '../scripts/build-mcp';
import { smokeMcp } from '../scripts/mcp-smoke';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SLOW = 240_000;

describe('servidor MCP por stdio', () => {
  let folder = '';
  let bundle = '';

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'agenda-mcp-bundle-'));
    bundle = await buildMcpBundle(join(folder, 'main.mjs'));
  }, SLOW);
  afterAll(() => rm(folder, { recursive: true, force: true }));

  it(
    'el paquete compilado funciona solo, con los recursos de una carpeta',
    async () => {
      const report = await smokeMcp({ command: process.execPath, args: [bundle], env: { AGENDA_PUBLIC_DIR: join(ROOT, 'public') } });
      expect(report.problems).toEqual([]);
      expect(report.tools).toHaveLength(21);
      // Nueve pedidos (initialize, tools/list, seis llamadas y una lectura de recurso), nueve respuestas: nada más salió por la salida estándar.
      expect(report.stdoutLines).toBe(9);
    },
    SLOW,
  );

  it(
    'el código fuente, igual',
    async () => {
      const report = await smokeMcp({ command: process.execPath, args: ['--import', 'tsx', join(ROOT, 'src/mcp/main.ts')] });
      expect(report.problems).toEqual([]);
    },
    SLOW,
  );

  it(
    'sin la carpeta de recursos el paquete avisa por la salida de errores y termina',
    async () => {
      const report = await smokeMcp({ command: process.execPath, args: [bundle], env: { AGENDA_PUBLIC_DIR: '' }, stepTimeoutMs: 5000 });
      expect(report.ok).toBe(false);
      expect(report.stdoutLines).toBe(0);
      expect(report.stderr).toContain('AGENDA_PUBLIC_DIR');
    },
    SLOW,
  );

  it(
    'si el cliente cierra la entrada con un pedido en curso, lo contesta antes de terminar',
    async () => {
      const work = await mkdtemp(join(tmpdir(), 'agenda-mcp-drain-'));
      try {
        const child = spawn(process.execPath, [bundle], {
          env: { ...process.env, AGENDA_MCP_ROOT: work, AGENDA_PUBLIC_DIR: join(ROOT, 'public') },
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        let out = '';
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
        const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
        const send = (message: object): void => void child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
        send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'drain', version: '1' } } });
        send({ method: 'notifications/initialized' });
        send({ id: 2, method: 'tools/call', params: { name: 'create_design', arguments: { template: 'heritage', year: 2027, out: 'a.agenda.json' } } });
        // El pedido largo (el PDF) sale cuando ya existe el archivo, y la entrada se cierra enseguida.
        let sent = false;
        child.stdout.on('data', () => {
          if (sent || !out.includes('"id":2')) return;
          sent = true;
          send({ id: 3, method: 'tools/call', params: { name: 'export_pdf', arguments: { path: 'a.agenda.json', mode: 'pages', out: 'a.pdf' } } });
          child.stdin.end();
        });
        expect(await closed).toBe(0);
        const ids = out.split('\n').filter(Boolean).map((line) => (JSON.parse(line) as { id?: number }).id);
        expect(ids).toEqual(expect.arrayContaining([1, 2, 3]));
        expect((await readFile(join(work, 'a.pdf'))).subarray(0, 5).toString()).toBe('%PDF-');
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
    SLOW,
  );
});
