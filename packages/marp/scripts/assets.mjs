import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = fileURLToPath(new URL('.', import.meta.url));
export const root = resolve(here, '..');
export const workspace = resolve(root, '../..');

/**
 * Bundle the shared packages from source rather than from their `dist`.
 *
 * The Marp runtime is the same renderer VS Code and Obsidian mount, and
 * building it from source keeps this package's own build and test scripts
 * independent of the order the workspace happens to build in.
 */
export const sharedAliases = {
  '@terminalogue/core': resolve(workspace, 'packages/core/src/index.ts'),
  '@terminalogue/renderer': resolve(workspace, 'packages/renderer/src/index.ts'),
};

export const STYLESHEET = resolve(workspace, 'packages/renderer/src/terminalogue.css');
export const GENERATED_DIR = resolve(root, 'src/generated');
export const GENERATED_ASSETS = resolve(GENERATED_DIR, 'assets.ts');
export const BROWSER_BUNDLE = resolve(root, 'dist/browser/terminalogue-marp.js');
export const ENGINE_BUNDLE = resolve(root, 'dist/terminalogue-marp-engine.mjs');
