import { defineConfig } from '@playwright/test';

/** Pruebas de la aplicación de escritorio (Electron): `xvfb-run -a npx playwright test -c playwright.electron.config.ts`. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'electron.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
