#!/usr/bin/env node
/**
 * Entrada del servidor MCP por stdio (`npm run -s mcp`). La carpeta de trabajo es la de la
 * variable AGENDA_MCP_ROOT, o la carpeta desde donde se lanza. La salida estándar es del
 * protocolo: los mensajes para la persona van a la salida de errores.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

const root = process.env.AGENDA_MCP_ROOT || process.cwd();
const server = createServer({ root });
await server.connect(new StdioServerTransport());
console.error(`Agenda Heritage Studio (MCP) listo. Carpeta de trabajo: ${root}`);
