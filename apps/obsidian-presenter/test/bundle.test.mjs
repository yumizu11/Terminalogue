import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const BUNDLE = readFileSync(resolve(root, 'main.js'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

test('the Presenter is a separate, desktop-only plugin', () => {
  assert.equal(MANIFEST.id, 'terminalogue-presenter');
  assert.equal(MANIFEST.isDesktopOnly, true);

  // …and it does not replace the renderer plugin, which stays on mobile.
  const renderer = JSON.parse(readFileSync(resolve(root, '../obsidian/manifest.json'), 'utf8'));
  assert.equal(renderer.id, 'terminalogue');
  assert.equal(renderer.isDesktopOnly, false);
});

test('the plugin carries the whole Terminalogue engine, needing no network', () => {
  // The engine is written to a scratch directory and passed to Marp CLI, so a
  // generated presentation animates with no node_modules and no internet.
  assert.match(BUNDLE, /terminalogue-block/);
  assert.match(BUNDLE, /--tlg-bg/);
  assert.match(BUNDLE, /bespoke-marp-active/);

  for (const network of ['XMLHttpRequest', 'WebSocket(', 'https://cdn', 'fetch("http']) {
    assert.ok(!BUNDLE.includes(network), `the plugin must not reference ${network}`);
  }
});

test('the only program the plugin can start is the configured Marp CLI', () => {
  // One import of child_process, and one spawn: the Marp CLI from the setting.
  assert.equal(BUNDLE.split('node:child_process').length - 1, 1);
  for (const forbidden of ['execSync(', 'execFileSync(', 'eval(', 'new Function']) {
    assert.ok(!BUNDLE.includes(forbidden), `the plugin must not use ${forbidden}`);
  }
  // A `termlogue` block stays text: nothing feeds block content to a process.
  assert.ok(!BUNDLE.includes('shell:!0'), 'no spawn may enable a shell');
  assert.ok(!BUNDLE.includes('shell: true'), 'no spawn may enable a shell');
});

test('the engine the plugin ships is the one @terminalogue/marp built', () => {
  const shipped = readFileSync(require.resolve('@terminalogue/marp/engine'), 'utf8');
  const embedded = require(resolve(root, 'dist/internals.cjs'));

  assert.ok(shipped.includes('terminalogue-block'));
  assert.ok(embedded.PresenterWorkspace, 'the internals bundle is what the tests exercise');
  // The generated constant holds that file verbatim.
  const generated = readFileSync(resolve(root, 'src/generated/engine-source.ts'), 'utf8');
  assert.equal(JSON.parse(generated.slice(generated.indexOf('= ') + 2).replace(/;\s*$/, '')), shipped);
});
