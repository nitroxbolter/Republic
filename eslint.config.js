import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Types are part of the design: see CLAUDE.md "Types".
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true },
      ],
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
    },
  },
  {
    // The save server runs on Node and must not reach into the client beyond shared types.
    files: ['server/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['pixi.js', 'react', 'react-dom', 'jotai', '**/src/render/**', '**/src/app/**', '**/src/game/**'] },
      ],
    },
  },
  {
    // Sim, shared code, scripts and the server run as plain TypeScript (bun, and later the Worker)
    // with types simply stripped: keep to erasable syntax, so no parameter properties or enums.
    files: ['src/sim/**/*.ts', 'src/shared/**/*.ts', 'scripts/**/*.ts', 'server/**/*.ts'],
    rules: {
      '@typescript-eslint/parameter-properties': 'error',
      'no-restricted-syntax': ['error', { selector: 'TSEnumDeclaration', message: 'Use an `as const` object (erasable syntax only).' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, Bun: 'readonly' } },
  },
  {
    // The simulation must stay pure: no rendering, UI or DOM dependencies.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['pixi.js', 'react', 'react-dom', 'jotai', '**/render/**', '**/app/**', '**/game/**'] },
      ],
    },
  },
);
