#!/usr/bin/env node
/**
 * Entrada del servidor MCP por stdio (`npm run -s mcp`). La carpeta de trabajo es la de la
 * variable AGENDA_MCP_ROOT, o la carpeta desde donde se lanza. La salida estándar es del
 * protocolo: los mensajes para la persona van a la salida de errores.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parse, resolve } from 'node:path';
import { createServer } from './server';

// INIT_CWD: la carpeta desde donde se lanzó npm (con --prefix, npm cambia a la del programa).
const root = resolve(process.env.AGENDA_MCP_ROOT || process.env.INIT_CWD || process.cwd());
if (parse(root).root === root) {
  console.error('Elegí una carpeta de trabajo con AGENDA_MCP_ROOT: la raíz del disco no se usa como carpeta de trabajo.');
  process.exit(1);
}
const server = createServer({ root });
await server.connect(new StdioServerTransport());
console.error(`Agenda Heritage Studio (MCP) listo. Carpeta de trabajo: ${root}`);
