/**
 * El servidor MCP como lo arranca un cliente de IA: por entrada y salida estándar, de punta a
 * punta (ver `scripts/mcp-smoke.ts`). Se prueba el paquete compilado que lleva la aplicación de
 * escritorio y también el código fuente. En los dos, la salida estándar es solo del protocolo.
 */
import { mkdtemp, rm } from 'node:fs/promises';
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
      expect(report.tools).toHaveLength(9);
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
});
