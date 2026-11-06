import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'legacy', 'public', 'coverage', 'test-results', 'playwright-report', 'dev-dist', 'dist-mcp', 'release'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/cli/**/*.ts', 'src/node/**/*.ts', 'src/mcp/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts', '*.config.ts', 'electron/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // El núcleo es el mismo para la aplicación, la línea de comandos y el servidor MCP: no conoce el
    // navegador, Node, Electron ni la interfaz (todo eso le llega desde afuera).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fs', 'path', 'os', 'child_process', 'crypto', 'url'].map((name) => ({ name, message: 'El núcleo no usa Node: recibe lo que necesita (bytes, rutas) desde afuera.' })),
          patterns: [
            { group: ['node:*'], message: 'El núcleo no usa Node: recibe lo que necesita (bytes, rutas) desde afuera.' },
            { group: ['react', 'react-dom', 'react/*', 'zustand', 'zustand/*', 'immer', 'lucide-react', 'electron'], message: 'El núcleo no depende de la interfaz ni de Electron.' },
            { group: ['**/app/**', '**/node/**', '**/mcp/**', '**/cli/**', '**/workers/**', '**/electron/**'], message: 'El núcleo no importa de las capas de afuera.' },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
