import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Collects everything the Obsidian community plugin release needs, and checks
 * that it is the release it claims to be.
 *
 *   node scripts/release-obsidian.mjs          # verify and collect
 *   node scripts/release-obsidian.mjs --sync   # …after refreshing the root files
 *
 * Nothing here publishes: it writes into `dist-release/obsidian`, prints the
 * commands to run, and stops. Making the repository public and creating the
 * GitHub release stay manual, deliberate steps.
 *
 * Obsidian installs a community plugin by reading `manifest.json` from the
 * *root* of the repository to find the latest version, then downloading
 * `manifest.json`, `main.js` and `styles.css` from the GitHub release tagged
 * exactly that version. That is why this repository carries a root
 * `manifest.json` and `versions.json` at all: they are the Obsidian plugin's
 * shop window, while `apps/obsidian/manifest.json` stays the file the plugin is
 * actually built from. `--sync` copies the second onto the first, and the
 * Obsidian test suite fails if they ever drift apart.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** `owner/name` of the GitHub repository the release is created in. */
const REPO = readRepo();

const PLUGIN = resolve(root, 'apps/obsidian');
const OUT = resolve(root, 'dist-release/obsidian');

/** The three files Obsidian downloads, and nothing else. */
const ASSETS = ['main.js', 'manifest.json', 'styles.css'];

/** Sources whose age decides whether the built plugin is stale. */
const SOURCE_DIRS = [
  resolve(root, 'packages/core/src'),
  resolve(root, 'packages/renderer/src'),
  resolve(PLUGIN, 'src'),
];

const sync = process.argv.includes('--sync');
const problems = [];

const fail = (message) => problems.push(message);

const manifest = readJson(resolve(PLUGIN, 'manifest.json'));
const { version, minAppVersion, id } = manifest;

// ------------------------------------------------------------------ the root files

if (sync) {
  writeFileSync(resolve(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // versions.json maps every published plugin version to the Obsidian version
  // it needs, so an older app can still find a plugin release it can run. Past
  // entries are kept; only this version's is added or corrected.
  const versionsPath = resolve(root, 'versions.json');
  const versions = { ...readJson(versionsPath), [version]: minAppVersion };
  const ordered = Object.fromEntries(
    Object.entries(versions).sort(([a], [b]) => compareVersions(a, b)),
  );
  writeFileSync(versionsPath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  console.log('[release] synchronised manifest.json and versions.json in the repository root');
}

const rootManifest = readJson(resolve(root, 'manifest.json'));
if (JSON.stringify(rootManifest) !== JSON.stringify(manifest)) {
  fail('The root manifest.json differs from apps/obsidian/manifest.json. Run with --sync.');
}

const versions = readJson(resolve(root, 'versions.json'));
if (versions[version] !== minAppVersion) {
  fail(`versions.json has no "${version}": "${minAppVersion}" entry. Run with --sync.`);
}

const packageVersion = readJson(resolve(root, 'package.json')).version;
if (packageVersion !== version) {
  fail(
    `The workspace is version ${packageVersion} but the plugin manifest says ${version}. ` +
      'Terminalogue versions in lockstep; bump them together.',
  );
}

// -------------------------------------------------------------- the built plugin

for (const asset of ASSETS) {
  const path = resolve(PLUGIN, asset);
  if (!exists(path)) {
    fail(`Missing ${relative(root, path)}. Run "pnpm build" first.`);
  }
}

// A stale build is the one mistake that reaches users looking like a good
// release, so it is checked twice: the stylesheet must be the shared one byte
// for byte, and no source may be newer than the bundle built from it.
if (exists(resolve(PLUGIN, 'styles.css'))) {
  const shared = readFileSync(resolve(root, 'packages/renderer/src/terminalogue.css'));
  const shipped = readFileSync(resolve(PLUGIN, 'styles.css'));
  if (!shared.equals(shipped)) {
    fail('apps/obsidian/styles.css is not the shared stylesheet. Run "pnpm build" first.');
  }
}

if (exists(resolve(PLUGIN, 'main.js'))) {
  const built = statSync(resolve(PLUGIN, 'main.js')).mtimeMs;
  const newest = SOURCE_DIRS.flatMap(walk).reduce(
    (latest, file) => Math.max(latest, statSync(file).mtimeMs),
    0,
  );
  if (newest > built) {
    fail('apps/obsidian/main.js is older than its sources. Run "pnpm build" first.');
  }
}

if (problems.length > 0) {
  console.error('\n[release] this is not a releasable state:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

// ------------------------------------------------------------------ collect

mkdirSync(OUT, { recursive: true });
for (const asset of ASSETS) copyFileSync(resolve(PLUGIN, asset), resolve(OUT, asset));

/**
 * The entry for the pull request against obsidianmd/obsidian-releases. It is
 * generated from the manifest rather than written by hand, so the id, name,
 * author and description in the directory can never disagree with the plugin.
 */
const entry = {
  id,
  name: manifest.name,
  author: manifest.author,
  description: manifest.description,
  repo: REPO,
};
writeFileSync(
  resolve(OUT, 'community-plugins-entry.json'),
  `${JSON.stringify(entry, null, 2)}\n`,
  'utf8',
);

const assetPaths = ASSETS.map((asset) => `dist-release/obsidian/${asset}`).join(' ');

console.log(`\n[release] ${manifest.name} ${version} collected into ${relative(root, OUT)}\n`);
for (const asset of ASSETS) {
  console.log(`    ${asset.padEnd(14)} ${statSync(resolve(OUT, asset)).size} bytes`);
}
console.log(`    community-plugins-entry.json\n`);

console.log('Next, by hand — none of it done for you:\n');
console.log(`  1. Make ${REPO} public.`);
console.log('  2. Create the release. The tag must be the bare version, with no "v":\n');
console.log(
  `       gh release create ${version} ${assetPaths} --repo ${REPO} ` +
    `--title "${manifest.name} ${version}" --notes-file apps/vscode/CHANGELOG.md\n`,
);
console.log('  3. Open a pull request against obsidianmd/obsidian-releases adding');
console.log('     dist-release/obsidian/community-plugins-entry.json to community-plugins.json.\n');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(dir) {
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/** Orders `0.9.0` before `0.10.0`, which a plain string sort does not. */
function compareVersions(a, b) {
  const parts = (value) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Reads `owner/name` from the one place in the repository that records it. */
function readRepo() {
  const url = readJson(resolve(root, 'apps/vscode/package.json')).repository?.url ?? '';
  const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(url);
  if (!match) {
    throw new Error('Could not read the GitHub repository from apps/vscode/package.json.');
  }
  return match[1];
}
