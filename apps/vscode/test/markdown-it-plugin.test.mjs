import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const MarkdownIt = require('markdown-it');
const { terminaloguePlugin, fenceLanguage, renderPlaceholder } = require(
  resolve(here, '../dist/markdown-it-plugin.cjs'),
);

const md = () => new MarkdownIt().use(terminaloguePlugin);

test('replaces a termlogue fence with a placeholder carrying the encoded source', () => {
  const html = md().render(['```termlogue', '@title Demo', '$ ls', '```'].join('\n'));

  assert.match(html, /class="terminalogue-block"/);
  const match = /data-terminalogue="([^"]*)"/.exec(html);
  assert.ok(match, 'placeholder should carry the source attribute');
  assert.equal(decodeURIComponent(match[1]), '@title Demo\n$ ls\n');
});

test('leaves other fenced blocks to the default renderer', () => {
  const html = md().render(['```bash', 'echo hi', '```'].join('\n'));
  assert.match(html, /<pre><code class="language-bash">/);
  assert.doesNotMatch(html, /terminalogue-block/);
});

test('leaves indented and inline code untouched', () => {
  assert.doesNotMatch(md().render('    $ ls'), /terminalogue-block/);
  assert.doesNotMatch(md().render('`termlogue`'), /terminalogue-block/);
});

test('preserves a fence renderer installed by another extension', () => {
  const instance = new MarkdownIt();
  instance.renderer.rules.fence = () => '<div class="other"></div>';
  instance.use(terminaloguePlugin);

  assert.match(instance.render('```js\n1\n```'), /class="other"/);
  assert.match(instance.render('```termlogue\n$ ls\n```'), /terminalogue-block/);
});

/** Parses emitted HTML the way a browser would, so the assertions are real. */
function parse(html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body;
}

test('never emits block content as markup', () => {
  const hostile = [
    '```termlogue',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '</div><b>escaped?</b>',
    '```',
  ];
  const body = parse(md().render(hostile.join('\n')));

  assert.equal(body.querySelector('script'), null);
  assert.equal(body.querySelector('img'), null);
  assert.equal(body.querySelector('b'), null);
  assert.equal(body.querySelector('[onerror]'), null);
  assert.equal(body.children.length, 1, 'exactly one placeholder element is produced');
  assert.equal(body.children[0].className, 'terminalogue-block');
});

test('round-trips quotes, angle brackets and ampersands through the attribute', () => {
  const hostile = 'a"b<c>d&e\'f\n"><script>alert(1)</script>';
  const body = parse(renderPlaceholder(hostile));
  const placeholder = body.children[0];

  assert.equal(body.children.length, 1);
  assert.equal(placeholder.attributes.length, 2, 'only class and the source attribute survive');
  assert.equal(decodeURIComponent(placeholder.getAttribute('data-terminalogue')), hostile);
});

test('reads the language word from a fence info string', () => {
  assert.equal(fenceLanguage('termlogue'), 'termlogue');
  assert.equal(fenceLanguage('  TermLogue  extra '), 'termlogue');
  assert.equal(fenceLanguage('termlogue-ish'), 'termlogue-ish');
  assert.equal(fenceLanguage(''), '');
});
