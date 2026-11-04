import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'watermarks/*', 'fonts/fonts.json'],
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
