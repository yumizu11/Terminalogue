import { fileURLToPath } from 'node:url';

/**
 * Marp CLI configuration for this repository's own example decks.
 *
 * `engine` points at the self-contained module `packages/marp` builds, so
 * `pnpm build` is the only prerequisite:
 *
 *   pnpm build
 *   npx marp examples/marp-nginx.md -o marp-nginx.html
 *
 * In a project of your own, install `@terminalogue/marp` and name the package
 * instead:
 *
 *   // marp.config.mjs
 *   export default { engine: '@terminalogue/marp' };
 */
export default {
  engine: fileURLToPath(
    new URL('./packages/marp/dist/terminalogue-marp-engine.mjs', import.meta.url),
  ),
};
