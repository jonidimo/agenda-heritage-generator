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
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
