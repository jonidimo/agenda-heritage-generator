/**
 * Arranque del servidor MCP por entrada y salida estándar. Lo comparten las dos entradas: el código
 * fuente (`main.ts`) y el paquete de la aplicación de escritorio (`bundle.ts`).
 *
 * La salida estándar es del protocolo (JSON-RPC, un mensaje por línea): cualquier otro texto la
 * rompe, así que los avisos para la persona van siempre a la salida de errores.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parse, resolve } from 'node:path';
import { createServer, type ServerResources } from './server';

/**
 * La carpeta de trabajo: la de `AGENDA_MCP_ROOT`, o desde donde se lanzó (`INIT_CWD` es la de npm,
 * que con `--prefix` cambia a la del programa). La raíz del disco no se acepta: es lo que queda
 * cuando una aplicación gráfica lanza el servidor sin elegir una carpeta.
 */
export function workingFolder(env: Readonly<Record<string, string | undefined>>, cwd: string): string {
  const root = resolve(env.AGENDA_MCP_ROOT || env.INIT_CWD || cwd);
  if (parse(root).root === root) throw new Error('Elegí una carpeta de trabajo con AGENDA_MCP_ROOT: la raíz del disco no se usa como carpeta de trabajo.');
  return root;
}

export async function runStdio(resources: ServerResources): Promise<void> {
  const root = workingFolder(process.env, process.cwd());
  const server = createServer({ root, ...resources });
  await server.connect(new StdioServerTransport());
  console.error(`Agenda Heritage Studio (MCP ${resources.version}) listo. Carpeta de trabajo: ${root}`);
}
