import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Assigning user content as markup is how a terminal demo becomes an XSS hole. */
const NO_MARKUP_SINKS = {
  selector:
    'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/], ' +
    'CallExpression[callee.property.name="write"][callee.object.name="document"]',
  message: 'Terminalogue renders block content with textContent only, never as markup.',
};

/** Terminalogue is display only: nothing may execute a command or evaluate a string. */
const NO_EXECUTION = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-restricted-imports': [
    'error',
    {
      paths: [
        { name: 'child_process', message: 'Terminalogue never executes commands.' },
        { name: 'node:child_process', message: 'Terminalogue never executes commands.' },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/obsidian/main.js',
      'apps/obsidian-presenter/main.js',
      'apps/vscode/media/terminalogue-preview.js',
      // Build artefacts: the shared stylesheet and the bundled runtime, as
      // string constants.
      'packages/marp/src/generated/**',
      'apps/obsidian-presenter/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...NO_EXECUTION,
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    // The parser is the shared foundation: it must run anywhere, so it may not
    // reach for the DOM or for a host API.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: '@terminalogue/core must stay DOM free.' },
        { name: 'document', message: '@terminalogue/core must stay DOM free.' },
        { name: 'navigator', message: '@terminalogue/core must stay DOM free.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['vscode', 'obsidian'], paths: [{ name: 'child_process' }] },
      ],
    },
  },

  {
    // The renderer is shared by every host, so it may not depend on one.
    files: ['packages/renderer/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', NO_MARKUP_SINKS],
      'no-restricted-imports': [
        'error',
        {
          patterns: ['vscode', 'obsidian'],
          paths: [{ name: 'child_process' }],
        },
      ],
    },
  },

  {
    files: ['apps/*/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_MARKUP_SINKS] },
  },

  {
    // The Marp adapter is a shared package like the other two: it may not
    // reach for a host API, and it may not run anything.
    files: ['packages/marp/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', NO_MARKUP_SINKS],
      'no-restricted-imports': [
        'error',
        {
          patterns: ['vscode', 'obsidian'],
          paths: [
            { name: 'child_process', message: 'Terminalogue never executes commands.' },
            { name: 'node:child_process', message: 'Terminalogue never executes commands.' },
          ],
        },
      ],
    },
  },

  {
    // Terminalogue Presenter is the one place a process is ever started, and
    // src/platform.ts is the one file that may reach for child_process. It
    // starts the configured Marp CLI and nothing else; a `termlogue` block is
    // still text, everywhere, always.
    files: ['apps/obsidian-presenter/src/platform.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    files: ['**/*.mjs', '**/*.cjs', 'eslint.config.js', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
