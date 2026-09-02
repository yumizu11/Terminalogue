import { resolve } from 'node:path';
import esbuild from 'esbuild';
import { ENGINE_BUNDLE, root, sharedAliases } from './assets.mjs';

/**
 * Bundles the Marp engine into one self-contained ES module.
 *
 * Marp CLI takes an engine as a path (`--engine ./terminalogue-marp-engine.mjs`),
 * and the Obsidian companion plugin writes exactly this file into a scratch
 * directory before running Marp. It therefore has to stand on its own: no
 * imports, no `node_modules` lookup, no network — just the parser, the
 * placeholder format and the two inlined assets.
 */
const result = await esbuild.build({
  entryPoints: [resolve(root, 'src/engine.ts')],
  outfile: ENGINE_BUNDLE,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  alias: sharedAliases,
  banner: {
    js: '// @terminalogue/marp — self-contained Marp CLI engine. Generated; do not edit.',
  },
  logLevel: 'warning',
  metafile: true,
});

const external = Object.keys(result.metafile.inputs).filter((file) => file.includes('node_modules'));
if (external.length > 0) {
  console.error(`[terminalogue-marp] engine bundle is not self-contained: ${external.join(', ')}`);
  process.exit(1);
}

console.log(`[terminalogue-marp] engine -> ${ENGINE_BUNDLE}`);
