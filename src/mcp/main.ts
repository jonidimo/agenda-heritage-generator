#!/usr/bin/env node
/**
 * Entrada del servidor MCP desde el código fuente (`npm run -s mcp`). La carpeta de trabajo es la de
 * AGENDA_MCP_ROOT, o la carpeta desde donde se lanza. La aplicación de escritorio usa `bundle.ts`.
 */
import { sourceResources } from './dev';
import { runStdio } from './run';

try {
  await runStdio(sourceResources());
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
