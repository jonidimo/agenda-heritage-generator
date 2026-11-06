import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Política de seguridad del sitio publicado: solo código propio (sin scripts en línea ni
 * manejadores en atributos), así un archivo de diseño manipulado no puede ejecutar nada.
 * Solo en la compilación: el servidor de desarrollo de Vite necesita scripts en línea.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  // El asistente de IA habla con el proveedor que elige la persona (https) o con un modelo en esta misma
  // computadora (Ollama, LM Studio). Conectarse no es ejecutar: `script-src` sigue siendo solo código propio.
  "connect-src 'self' blob: data: https: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Versión y dirección del proyecto: una sola fuente (package.json) para el «Acerca de» y el servidor MCP. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string; homepage: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_HOMEPAGE__: JSON.stringify(pkg.homepage) },
  // Rutas relativas: el sitio funciona igual en GitHub Pages, en una carpeta local o en un servidor propio.
  base: './',
  resolve: {
    alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
  plugins: [
    {
      name: 'heritage-csp',
      apply: 'build',
      transformIndexHtml: (html: string) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Las fuentes integradas y el índice de feriados se guardan al instalar: la primera
      // apertura sin conexión ya los tiene (los feriados de cada país se guardan al usarlos).
      includeAssets: ['icons/*.png', 'icons/*.svg', 'icons/lucide/*.svg', 'icons/lucide/LICENSE.txt', 'watermarks/*', 'fonts/fonts.json', 'fonts/**/*.ttf', 'holidays/index.json'],
      manifest: {
        name: 'Agenda Heritage Studio',
        short_name: 'Agenda Studio',
        description: 'Diseñá, previsualizá e imprimí agendas artesanales en cuadernillos.',
        lang: 'es',
        display: 'standalone',
        background_color: '#f7f5ef',
        theme_color: '#2f3b2f',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'agenda-fonts', expiration: { maxEntries: 80 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/holidays/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'agenda-holidays', expiration: { maxEntries: 300 } },
          },
        ],
      },
    }),
  ],
});
