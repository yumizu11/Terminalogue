import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const BUNDLE = resolve(root, 'main.js');
const STYLES = resolve(root, 'styles.css');

/** Minimal stand-ins for the Obsidian runtime classes the plugin extends. */
class Component {
  constructor() {
    this._children = [];
    this._loaded = false;
  }
  load() {
    this._loaded = true;
    this.onload?.();
  }
  unload() {
    if (!this._loaded) return;
    this._loaded = false;
    for (const child of this._children.splice(0)) child.unload();
    this.onunload?.();
  }
  addChild(child) {
    this._children.push(child);
    child.load();
    return child;
  }
}

class MarkdownRenderChild extends Component {
  constructor(containerEl) {
    super();
    this.containerEl = containerEl;
  }
}

class Plugin extends Component {
  constructor() {
    super();
    this.processors = new Map();
  }
  registerMarkdownCodeBlockProcessor(language, handler) {
    this.processors.set(language, handler);
    return handler;
  }
}

const obsidianStub = { Component, MarkdownRenderChild, Plugin };

/** Loads the built CJS bundle with `obsidian` resolved to the stub above. */
function loadPlugin() {
  const originalLoad = Module._load;
  Module._load = function patched(request, ...rest) {
    if (request === 'obsidian') return obsidianStub;
    return originalLoad.call(this, request, ...rest);
  };
  try {
    delete require.cache[BUNDLE];
    const exported = require(BUNDLE);
    return exported.default ?? exported;
  } finally {
    Module._load = originalLoad;
  }
}

/** Runs the plugin's `termlogue` processor against a fresh jsdom element. */
function renderBlock(plugin, source) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const element = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(element);

  const children = [];
  const context = { addChild: (child) => children.push(plugin.addChild(child)) };

  plugin.processors.get('termlogue')(source, element, context);
  return { dom, element, children };
}

test('the built plugin registers a termlogue code block processor', () => {
  const TerminaloguePlugin = loadPlugin();
  const plugin = new TerminaloguePlugin();
  plugin.load();

  assert.ok(plugin.processors.has('termlogue'), 'processor should be registered on load');
});

test('the processor mounts the shared renderer into the given element', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element } = renderBlock(plugin, '@title RHEL 10\n$ ls\nfile.txt');
  const terminal = element.querySelector('.tlg');

  assert.ok(terminal, 'a Terminalogue root should be mounted');
  assert.equal(element.querySelector('.tlg__title').textContent, 'RHEL 10');
  // Play/Pause, Restart, four speeds and Copy commands.
  assert.equal(element.querySelectorAll('.tlg__button').length, 7);
  assert.equal(element.querySelector('.tlg__transcript-text').textContent, '$ ls\nfile.txt');
});

test('the v0.2 controls reach Obsidian through the shared renderer', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element } = renderBlock(plugin, '$ ls');

  const speeds = [...element.querySelectorAll('.tlg__speed')].map((node) => node.textContent);
  assert.deepEqual(speeds, ['1×', '2×', '4×', 'Instant']);
  assert.equal(element.querySelector('.tlg__group').getAttribute('aria-label'), 'Playback speed');
  assert.equal(element.querySelector('.tlg__copy').getAttribute('aria-label'), 'Copy commands');
  assert.equal(element.querySelector('.tlg__speed').getAttribute('aria-pressed'), 'true');
});

test('@type and @pause render the same transcript the parser produces', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const source = ['$ ssh rhel10', 'Continue? [yes/no] ', '@type yes', '@pause connected', 'ok'].join(
    '\n',
  );
  const { element } = renderBlock(plugin, source);

  assert.equal(
    element.querySelector('.tlg__transcript-text').textContent,
    '$ ssh rhel10\nContinue? [yes/no] yes\nok',
  );
});

test('@theme reaches Obsidian through the shared renderer alone', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  for (const theme of ['light', 'dark', 'ubuntu', 'powershell', 'cmd']) {
    const { element } = renderBlock(plugin, `@theme ${theme}\n$ ls`);
    assert.equal(element.querySelector('.tlg').getAttribute('data-theme'), theme);
  }

  // A block with no @theme keeps the look it had before themes existed.
  const { element } = renderBlock(plugin, '$ ls');
  assert.equal(element.querySelector('.tlg').getAttribute('data-theme'), 'dark');

  // The window decoration is one DOM in every theme; which half of it shows is
  // the shared stylesheet's business, not the adapter's.
  assert.equal(element.querySelectorAll('.tlg__dot').length, 3);
  assert.ok(element.querySelector('.tlg__mark'));
});

test('a theme changes no control, and no prompt, in the Obsidian adapter', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element } = renderBlock(plugin, '@theme powershell\n@prompt PS C:\\>\n$ Get-Process');

  assert.equal(element.querySelectorAll('.tlg__button').length, 7);
  assert.deepEqual(
    [...element.querySelectorAll('.tlg__speed')].map((node) => node.textContent),
    ['1×', '2×', '4×', 'Instant'],
  );
  assert.equal(element.querySelector('.tlg__copy').getAttribute('aria-label'), 'Copy commands');
  // The theme did not invent a prompt: `@prompt` is still the only thing that
  // decides what a command line is prefixed with.
  assert.equal(element.querySelector('.tlg__transcript-text').textContent, 'PS C:\\> Get-Process');
});

test('@size reaches Obsidian through the shared renderer alone', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element } = renderBlock(plugin, '@size 72x16\n$ ls\nfile.txt');
  const terminal = element.querySelector('.tlg');

  assert.equal(terminal.getAttribute('data-size'), 'fixed');
  assert.equal(terminal.getAttribute('style'), '--tlg-columns: 72; --tlg-rows: 16;');
  // Rows are the terminal body: the chrome around it is outside the screen.
  assert.ok(terminal.querySelector('.tlg__screen'));
  assert.equal(terminal.querySelector('.tlg__screen .tlg__titlebar'), null);

  // A block with no @size keeps the automatic sizing it had before v0.5, which
  // is what a note on a phone screen wants.
  const automatic = renderBlock(plugin, '$ ls').element.querySelector('.tlg');
  assert.equal(automatic.getAttribute('data-size'), null);
  assert.equal(automatic.getAttribute('style'), null);
});

test('an invalid @size is a diagnostic in the block, not a broken note', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element } = renderBlock(plugin, '@size 80x200\n$ ls');

  assert.equal(element.querySelector('.tlg').getAttribute('data-size'), null);
  assert.match(element.querySelector('.tlg__diagnostic').textContent, /out of range/);
  assert.equal(element.querySelector('.tlg__transcript-text').textContent, '$ ls');
});

test('the adapter contains no size logic of its own', () => {
  // A fixed viewport is the shared renderer's and the shared stylesheet's
  // business, and needs no Electron or Node API to work out.
  const adapter = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  for (const token of ['@size', 'data-size', '--tlg-columns', '--tlg-rows', 'getComputedStyle']) {
    assert.ok(!adapter.includes(token), `the adapter must not mention ${token}`);
  }
});

test('the adapter contains no theme logic of its own', () => {
  // Themes live in the shared renderer and the shared stylesheet. A host
  // adapter that knew a theme name would be the start of the two hosts
  // drifting apart.
  const adapter = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  for (const theme of ['ubuntu', 'powershell', 'data-theme']) {
    assert.ok(!adapter.includes(theme), `the adapter must not mention ${theme}`);
  }
});

test('block content is rendered as text, never as markup', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element } = renderBlock(plugin, '<img src=x onerror=alert(1)>\n<script>alert(1)</script>');

  assert.equal(element.querySelector('img'), null);
  assert.equal(element.querySelector('script'), null);
  assert.match(element.querySelector('.tlg__transcript-text').textContent, /<img src=x onerror=/);
});

test('re-rendering a note tears the previous instance down', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const { element, children } = renderBlock(plugin, '$ ls');
  assert.equal(children.length, 1, 'the processor must register a render child');
  assert.ok(element.querySelector('.tlg'));

  children[0].unload();
  assert.equal(element.querySelector('.tlg'), null, 'unloading must remove the rendered DOM');
});

test('plugin unload tears down every live block', () => {
  const plugin = new (loadPlugin())();
  plugin.load();

  const first = renderBlock(plugin, '$ ls');
  const second = renderBlock(plugin, '$ pwd');

  plugin.unload();

  assert.equal(first.element.querySelector('.tlg'), null);
  assert.equal(second.element.querySelector('.tlg'), null);
});

test('the bundle contains no command execution, eval or network APIs', () => {
  // Terminalogue is a display-only plugin: it must never gain the ability to
  // run a command, evaluate a string, or reach the network.
  const source = readFileSync(BUNDLE, 'utf8');
  for (const forbidden of [
    'child_process',
    'execSync',
    'spawnSync',
    'eval(',
    'new Function',
    'XMLHttpRequest',
    'WebSocket',
    'fetch(',
  ]) {
    assert.ok(!source.includes(forbidden), `bundle must not reference ${forbidden}`);
  }
});

test('the repository root advertises this exact plugin to Obsidian', () => {
  // Obsidian reads manifest.json from the *root* of the repository to decide
  // which version is current, and consults versions.json when the app is older
  // than minAppVersion. Those two files are the plugin's shop window; this is
  // what stops them drifting away from the plugin they advertise.
  // `node scripts/release-obsidian.mjs --sync` regenerates both.
  const repo = resolve(root, '../..');
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
  const advertised = JSON.parse(readFileSync(resolve(repo, 'manifest.json'), 'utf8'));
  const versions = JSON.parse(readFileSync(resolve(repo, 'versions.json'), 'utf8'));

  assert.deepEqual(advertised, manifest, 'the root manifest.json must be this plugin’s');
  assert.equal(
    versions[manifest.version],
    manifest.minAppVersion,
    `versions.json must map ${manifest.version} to ${manifest.minAppVersion}`,
  );
  // The release is found by a tag equal to the version, so the workspace and
  // the plugin cannot disagree about what that version is.
  const workspace = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  assert.equal(workspace.version, manifest.version);
});

test('the stylesheet is the shared renderer stylesheet, byte for byte', () => {
  const shared = require.resolve('@terminalogue/renderer/terminalogue.css');
  assert.equal(readFileSync(STYLES, 'utf8'), readFileSync(shared, 'utf8'));
});
