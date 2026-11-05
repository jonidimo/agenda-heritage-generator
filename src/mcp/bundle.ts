/**
 * Entrada del paquete del servidor MCP que lleva la aplicación de escritorio (`scripts/build-mcp.ts`
 * lo compila con esbuild a `dist-mcp/main.mjs`). Las guías y el WebAssembly de resvg van dentro del
 * paquete; las fuentes, los feriados y las imágenes los lee de la carpeta que indique
 * `AGENDA_PUBLIC_DIR` (la aplicación apunta a su `dist/`).
 *
 * No atrapa los errores: quien lo importa (el arranque de Electron) decide cómo terminar.
 */
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import guideEn from '../../docs/llm-templates.md';
import guideEs from '../../docs/plantillas-llm.md';
import { PUBLIC_DIR_ENV } from '../node/env';
import { createRasterizer } from './resvg';
import { runStdio } from './run';
import { appVersion } from './version';

if (!process.env[PUBLIC_DIR_ENV]) throw new Error(`Falta ${PUBLIC_DIR_ENV}: la carpeta con las fuentes, los feriados y las imágenes integradas.`);

await runStdio({
  version: appVersion(),
  guides: { en: async () => guideEn, es: async () => guideEs },
  rasterize: createRasterizer(async () => wasm),
});
