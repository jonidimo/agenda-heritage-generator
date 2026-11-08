/**
 * Entrada del paquete del servidor MCP que lleva la aplicación de escritorio (`scripts/build-mcp.ts`
 * lo compila con esbuild a `dist-mcp/main.mjs`). Las guías y el WebAssembly de resvg van dentro del
 * paquete; las fuentes, los feriados y las imágenes los lee de la carpeta que indique
 * `AGENDA_PUBLIC_DIR`, o, si falta, de la carpeta `dist/` que lo acompaña.
 *
 * No atrapa los errores: quien lo importa (el arranque de Electron) decide cómo terminar.
 */
import subsetWasm from 'harfbuzzjs/dist/harfbuzz-subset.wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import guideEn from '../../docs/llm-templates.md';
import guideEs from '../../docs/plantillas-llm.md';
import { PUBLIC_DIR_ENV } from '../node/env';
import { createRasterizer } from './resvg';
import { runStdio } from './run';
import { appVersion } from './version';

// Sin AGENDA_PUBLIC_DIR, los recursos son los de la aplicación: la carpeta `dist/` que está junto a
// `dist-mcp/` (también adentro de `app.asar`, que Electron lee como una carpeta).
const bundled = fileURLToPath(new URL('../dist', import.meta.url));
if (!process.env[PUBLIC_DIR_ENV] && existsSync(bundled)) process.env[PUBLIC_DIR_ENV] = bundled;
if (!process.env[PUBLIC_DIR_ENV]) throw new Error(`Falta ${PUBLIC_DIR_ENV}: la carpeta con las fuentes, los feriados y las imágenes integradas.`);

await runStdio({
  version: appVersion(),
  guides: { en: async () => guideEn, es: async () => guideEs },
  rasterize: createRasterizer(async () => wasm),
  subsetWasm: async () => subsetWasm,
});
