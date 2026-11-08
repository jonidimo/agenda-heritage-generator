/**
 * Recursos del servidor MCP al correr desde el código fuente (`npm run -s mcp`, las pruebas): las
 * guías salen de `docs/` y el WebAssembly de resvg, de `node_modules`.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from '../node/env';
import { createRasterizer } from './resvg';
import type { ServerResources } from './server';
import { appVersion } from './version';

export function sourceResources(): ServerResources {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
  const subsetPath = require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm');
  const guide = (file: string) => (): Promise<string> => readFile(join(ROOT, 'docs', file), 'utf8');
  return {
    version: appVersion(),
    guides: { en: guide('llm-templates.md'), es: guide('plantillas-llm.md') },
    rasterize: createRasterizer(async () => new Uint8Array(await readFile(wasmPath))),
    subsetWasm: async () => new Uint8Array(await readFile(subsetPath)),
  };
}
