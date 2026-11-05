/**
 * Arranque del servidor MCP por entrada y salida estándar. Lo comparten las dos entradas: el código
 * fuente (`main.ts`) y el paquete de la aplicación de escritorio (`bundle.ts`).
 *
 * La salida estándar es del protocolo (JSON-RPC, un mensaje por línea): cualquier otro texto la
 * rompe, así que los avisos para la persona van siempre a la salida de errores.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isJSONRPCErrorResponse, isJSONRPCRequest, isJSONRPCResultResponse } from '@modelcontextprotocol/sdk/types.js';
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

/** Tiempo máximo que se espera por pedidos sin respuesta después de cerrarse la entrada (los cancelados nunca la tienen). */
export const DRAIN_LIMIT_MS = 10 * 60_000;

/**
 * Sirve por entrada y salida estándar hasta que el cliente cierra su entrada y se contestaron todos
 * los pedidos que tenía en curso (un PDF largo puede tardar más que el cierre). Recién ahí termina.
 */
export async function runStdio(resources: ServerResources): Promise<void> {
  const root = workingFolder(process.env, process.cwd());
  const server = createServer({ root, ...resources });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Pedidos recibidos y todavía sin respuesta.
  let pending = 0;
  let inputClosed = false;
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const settle = (): void => {
    if (inputClosed && pending === 0) finish();
  };
  const received = transport.onmessage;
  transport.onmessage = (message) => {
    if (isJSONRPCRequest(message)) pending++;
    received?.(message);
  };
  const send = transport.send.bind(transport);
  transport.send = async (message) => {
    await send(message);
    if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) pending = Math.max(0, pending - 1);
    settle();
  };
  process.stdin.once('end', () => {
    inputClosed = true;
    settle();
    // Un pedido cancelado no tiene respuesta: no se espera para siempre.
    setTimeout(finish, DRAIN_LIMIT_MS).unref();
  });

  console.error(`Agenda Heritage Studio (MCP ${resources.version}) listo. Carpeta de trabajo: ${root}`);
  await finished;
  await server.close();
}
