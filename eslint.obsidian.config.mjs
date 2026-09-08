import obsidianmd from 'eslint-plugin-obsidianmd';

/**
 * The Obsidian community-plugin review, run locally.
 *
 * `pnpm lint:obsidian` is `pnpm lint` plus everything the directory's own
 * review tooling checks: `eslint-plugin-obsidianmd` on its recommended
 * settings, with the type-aware rules that need a TypeScript program. Kept
 * separate from `eslint.config.js` because it is a different question — the
 * everyday config says what this repository has decided, this one says what
 * Obsidian will say about it — and because it needs types, so it is much
 * slower.
 *
 * The plugin reads the root `manifest.json` the way the reviewer does, which is
 * why `isDesktopOnly: false` there makes it hold every file in the workspace,
 * Terminalogue Presenter's included, to the mobile rules.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'dist-release/**',
      // The built Obsidian plugin, and the copy staged at the repository root.
      'main.js',
      'apps/obsidian/main.js',
      'apps/obsidian-presenter/main.js',
      'apps/vscode/media/terminalogue-preview.js',
      'packages/marp/src/generated/**',
      'apps/obsidian-presenter/src/generated/**',
      // Only what ships inside a plugin is reviewed. Tests, build scripts and
      // configuration run in Node, on a developer's machine — the mobile rules
      // are about the plugin, and type-aware rules cannot read a file that
      // belongs to no package's TypeScript program anyway.
      '**/test/**',
      '**/scripts/**',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.config.ts',
      'examples/**',
      'docs/**',
    ],
  },

  ...obsidianmd.configs.recommended,

  {
    files: ['**/*.{ts,cts,mts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // TypeScript resolves its own identifiers, and `no-undef` cannot see a
      // type: it reads `NodeJS.Signals` as an undefined variable. This is what
      // typescript-eslint says to do on TypeScript, and it matches the review,
      // which reports no such thing.
      'no-undef': 'off',
    },
  },
];
