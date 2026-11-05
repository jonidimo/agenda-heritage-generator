import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string; homepage?: string };

export default defineConfig({
  // Las mismas constantes que define Vite al compilar la aplicación.
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_HOMEPAGE__: JSON.stringify(pkg.homepage ?? '') },
  resolve: {
    alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
