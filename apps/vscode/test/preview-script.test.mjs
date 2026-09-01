import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderPlaceholder, SOURCE_ATTRIBUTE } from '../dist/markdown-it-plugin.cjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const PREVIEW_SCRIPT = resolve(root, 'media/terminalogue-preview.js');
const STYLESHEET = resolve(root, 'media/terminalogue.css');
const script = readFileSync(PREVIEW_SCRIPT, 'utf8');

/**
 * Builds a preview-like page and runs the real bundled preview script in it,
 * the same way VS Code loads `markdown.previewScripts` into the webview.
 */
async function openPreview(...sources) {
  const body = sources.map((source) => renderPlaceholder(source)).join('');
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });

  if (dom.window.document.readyState === 'loading') {
    await once(dom.window, 'DOMContentLoaded');
  }
  dom.window.eval(script);
  return dom;
}

/**
 * Edits one placeholder in place and fires the event VS Code dispatches after
 * an incremental preview update. Since 1.63 the preview patches the existing
 * DOM instead of reloading, so untouched blocks keep their element identity.
 */
function updateContent(dom, edits) {
  const placeholders = [...dom.window.document.querySelectorAll('.terminalogue-block')];
  for (const [index, source] of Object.entries(edits)) {
    if (source === null) placeholders[index].remove();
    else placeholders[index].setAttribute(SOURCE_ATTRIBUTE, encodeURIComponent(source));
  }
  dom.window.dispatchEvent(new dom.window.Event('vscode.markdown.updateContent'));
}

const roots = (dom) => [...dom.window.document.querySelectorAll('.tlg')];

test('hydrates every placeholder on the page', async () => {
  const dom = await openPreview('@title One\n$ ls', '@title Two\n$ pwd');
  const titles = [...dom.window.document.querySelectorAll('.tlg__title')].map(
    (node) => node.textContent,
  );

  assert.deepEqual(titles, ['One', 'Two']);
  assert.equal(roots(dom).length, 2);
  dom.window.close();
});

test('hydrates a placeholder that appears after the script has already run', async () => {
  // Regression test: VS Code's real Markdown preview can still be inserting
  // the rendered body content into the webview after previewScripts have
  // already executed, so `document.readyState` alone is not a reliable
  // "the markup is here" signal. Without a MutationObserver fallback this
  // placeholder — added a tick after the script ran, with no
  // `vscode.markdown.updateContent` event dispatched — would never hydrate.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  if (dom.window.document.readyState === 'loading') await once(dom.window, 'DOMContentLoaded');
  dom.window.eval(script);

  assert.equal(roots(dom).length, 0, 'nothing to hydrate yet');

  dom.window.document.body.innerHTML = renderPlaceholder('@title Late\n$ ls');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(roots(dom).length, 1, 'the MutationObserver fallback must catch the late content');
  assert.equal(dom.window.document.querySelector('.tlg__title').textContent, 'Late');
  dom.window.close();
});

test('does not mount a second instance when the content has not changed', async () => {
  const dom = await openPreview('$ ls');
  const [mounted] = roots(dom);

  dom.window.dispatchEvent(new dom.window.Event('vscode.markdown.updateContent'));
  dom.window.dispatchEvent(new dom.window.Event('vscode.markdown.updateContent'));

  assert.equal(roots(dom).length, 1, 'a re-render must not stack a second animation');
  assert.equal(roots(dom)[0], mounted, 'the existing instance is reused');
  dom.window.close();
});

test('remounts only the block whose source changed', async () => {
  const dom = await openPreview('@title Before\n$ ls', '@title Untouched\n$ pwd');
  const [edited, untouched] = roots(dom);

  updateContent(dom, { 0: '@title After\n$ ls' });

  const after = roots(dom);
  assert.equal(after.length, 2, 'still exactly one instance per block');
  assert.notEqual(after[0], edited, 'the edited block is torn down and mounted again');
  assert.equal(after[1], untouched, 'the untouched block keeps its running instance');
  assert.equal(after[0].querySelector('.tlg__title').textContent, 'After');
  dom.window.close();
});

test('drops instances whose placeholder was removed from the preview', async () => {
  const dom = await openPreview('@title Kept\n$ ls', '@title Gone\n$ pwd');
  assert.equal(roots(dom).length, 2);

  updateContent(dom, { 1: null });

  const after = roots(dom);
  assert.equal(after.length, 1);
  assert.equal(after[0].querySelector('.tlg__title').textContent, 'Kept');
  dom.window.close();
});

test('survives a placeholder whose payload is not valid percent-encoding', async () => {
  const dom = new JSDOM(
    '<!doctype html><body><div class="terminalogue-block" data-terminalogue="%"></div></body>',
    { runScripts: 'dangerously', pretendToBeVisual: true },
  );
  if (dom.window.document.readyState === 'loading') await once(dom.window, 'DOMContentLoaded');
  dom.window.eval(script);

  assert.equal(roots(dom).length, 1, 'a malformed payload degrades to an empty terminal');
  dom.window.close();
});

test('renders hostile block content as terminal text only', async () => {
  const dom = await openPreview('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  const [terminal] = roots(dom);

  assert.equal(terminal.querySelector('script'), null);
  assert.equal(terminal.querySelector('img'), null);
  assert.equal(terminal.querySelector('[onerror]'), null);
  assert.match(
    terminal.querySelector('.tlg__transcript-text').textContent,
    /<script>alert\(1\)<\/script>/,
  );
  dom.window.close();
});

test('the preview bundle contains no command execution, eval or network APIs', () => {
  // Terminalogue is a display-only extension: it must never gain the ability to
  // run a command, evaluate a string, or reach the network.
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
    assert.ok(!script.includes(forbidden), `bundle must not reference ${forbidden}`);
  }
});

test('the preview stylesheet is the shared renderer stylesheet, byte for byte', () => {
  const shared = require.resolve('@terminalogue/renderer/terminalogue.css');
  assert.equal(readFileSync(STYLESHEET, 'utf8'), readFileSync(shared, 'utf8'));
});
