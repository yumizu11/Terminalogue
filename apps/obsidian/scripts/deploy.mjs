import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the built plugin into an Obsidian vault for manual testing:
 *
 *   pnpm --filter terminalogue-obsidian deploy -- "/path/to/vault"
 *
 * or set the OBSIDIAN_VAULT environment variable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const vault = process.argv[2] ?? process.env.OBSIDIAN_VAULT;
if (!vault) {
  console.error('Usage: node scripts/deploy.mjs <path-to-obsidian-vault>');
  process.exit(1);
}

if (!existsSync(resolve(vault, '.obsidian'))) {
  console.error(`Not an Obsidian vault (no .obsidian folder): ${vault}`);
  process.exit(1);
}

const target = resolve(vault, '.obsidian/plugins/terminalogue');
mkdirSync(target, { recursive: true });

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  const from = resolve(root, file);
  if (!existsSync(from)) {
    console.error(`Missing ${file}. Run "pnpm --filter terminalogue-obsidian build" first.`);
    process.exit(1);
  }
  copyFileSync(from, resolve(target, file));
}

console.log(`[terminalogue-obsidian] installed into ${target}`);
console.log('Reload Obsidian, then enable Terminalogue under Settings > Community plugins.');
