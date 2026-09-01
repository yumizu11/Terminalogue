import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const watch = process.argv.includes('--watch');
const require = createRequire(import.meta.url);

/** Copies the shared Terminalogue stylesheet so both hosts look identical. */
function copyStylesheet() {
  const from = require.resolve('@terminalogue/renderer/terminalogue.css');
  const to = resolve(root, 'media/terminalogue.css');
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`[terminalogue-vscode] stylesheet -> ${to}`);
}

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    // Extension host: only rewrites fences into placeholders.
    entryPoints: [resolve(root, 'src/extension.ts')],
    outfile: resolve(root, 'dist/extension.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    // Exposed as CommonJS so the markdown-it plugin can be unit tested.
    entryPoints: [resolve(root, 'src/markdown-it-plugin.ts')],
    outfile: resolve(root, 'dist/markdown-it-plugin.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['markdown-it'],
  },
  {
    // Preview webview: a classic script, so it must be a self-contained IIFE.
    entryPoints: [resolve(root, 'src/preview/main.ts')],
    outfile: resolve(root, 'media/terminalogue-preview.js'),
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
  },
];

const common = {
  bundle: true,
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

copyStylesheet();

if (watch) {
  const contexts = await Promise.all(builds.map((build) => esbuild.context({ ...common, ...build })));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('[terminalogue-vscode] watching');
} else {
  await Promise.all(builds.map((build) => esbuild.build({ ...common, ...build })));
}
