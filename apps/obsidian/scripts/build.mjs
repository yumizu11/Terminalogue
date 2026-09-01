import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const watch = process.argv.includes('--watch');
const require = createRequire(import.meta.url);

/** Obsidian loads `styles.css` from the plugin folder; keep it identical to VS Code's. */
function copyStylesheet() {
  const from = require.resolve('@terminalogue/renderer/terminalogue.css');
  const to = resolve(root, 'styles.css');
  copyFileSync(from, to);
  console.log(`[terminalogue-obsidian] stylesheet -> ${to}`);
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [resolve(root, 'src/main.ts')],
  outfile: resolve(root, 'main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  // Provided by the Obsidian runtime, never bundled.
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    'node:*',
  ],
};

copyStylesheet();

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('[terminalogue-obsidian] watching');
} else {
  await esbuild.build(options);
}
