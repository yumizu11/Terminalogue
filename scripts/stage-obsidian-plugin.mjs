import { copyFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Puts the built Obsidian plugin at the repository root, beside the manifest.
 *
 * The root already carries `manifest.json` and `versions.json`: Obsidian reads
 * the current version from the manifest at the HEAD of the default branch, so
 * the root of this repository is the plugin's shop window even though the
 * plugin itself is built in `apps/obsidian`. `main.js` and `styles.css` belong
 * in the same window — Obsidian's own review tooling looks for a built
 * `main.js` there, and a plugin repository that ships one at the root is what
 * every reviewer, human or not, expects to find.
 *
 * The copies are build output, not sources: they are ignored by git, and
 * `scripts/release-obsidian.mjs` still collects the release from
 * `apps/obsidian`, which is where the plugin is actually built.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const plugin = resolve(root, 'apps/obsidian');

/** What Obsidian downloads, minus the manifest the root already keeps in sync. */
const ASSETS = ['main.js', 'styles.css'];

for (const asset of ASSETS) {
  const from = resolve(plugin, asset);
  try {
    statSync(from);
  } catch {
    console.error(`[stage] missing ${relative(root, from)}. Run "pnpm build" first.`);
    process.exit(1);
  }
  const to = resolve(root, asset);
  copyFileSync(from, to);
  console.log(`[stage] ${relative(root, from)} -> ${relative(root, to)}`);
}
