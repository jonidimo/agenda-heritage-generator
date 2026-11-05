/**
 * Compila el servidor MCP en un solo archivo autosuficiente (`dist-mcp/main.mjs`): el código del
 * motor y sus dependencias (SDK de MCP, zod, pdfkit, fontkit…), las guías y el WebAssembly de resvg
 * van adentro. La aplicación de escritorio lo lleva en su `.asar` y lo arranca con `--mcp`, así
 * quien la instala no necesita Node.js ni clonar el repositorio.
 *
 *   npm run build:mcp
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Compila el paquete y devuelve la ruta del archivo (por defecto `dist-mcp/main.mjs`). */
export async function buildMcpBundle(outfile = join(root, 'dist-mcp', 'main.mjs')): Promise<string> {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  await build({
    entryPoints: [join(root, 'src/mcp/bundle.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    // Los paquetes CommonJS que se incrustan llaman a `require`: se les da uno real (los módulos
    // propios de Node, como `fs`, no se incrustan).
    banner: { js: "import { createRequire as __heritageCreateRequire } from 'node:module';\nconst require = __heritageCreateRequire(import.meta.url);" },
    define: { __APP_VERSION__: JSON.stringify(version) },
    // Las guías van como texto y el WebAssembly como bytes, dentro del archivo.
    loader: { '.md': 'text', '.wasm': 'binary' },
    legalComments: 'eof',
    logLevel: 'warning',
  });
  return outfile;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await buildMcpBundle();
  console.log(`Servidor MCP compilado en ${out} (${(readFileSync(out).length / 1024 / 1024).toFixed(1)} MB)`);
}
