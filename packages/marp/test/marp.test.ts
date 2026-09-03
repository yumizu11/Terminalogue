import { Marp } from '@marp-team/marp-core';
import { describe, expect, it } from 'vitest';
import { terminalogueEngine, type MarpitLike } from '../src/engine.js';
import { stylesheet } from '../src/markdown-it-plugin.js';
import { TERMINALOGUE_SLIDE_CSS } from '../src/slide-css.js';
import {
  PAYLOAD_ATTRIBUTE,
  PLACEHOLDER_CLASS,
  RUNTIME_ELEMENT_ID,
  SIZE_ATTRIBUTE,
  STYLE_ELEMENT_ID,
  THEME_ATTRIBUTE,
  decodeDocument,
} from '../src/placeholder.js';

/**
 * The integration against the real Marp Core, which is what Marp CLI hands the
 * engine. These are the tests that would notice Marp changing underneath us.
 */
function convert(markdown: string): { html: string; css: string } {
  const marp = new Marp();
  terminalogueEngine({ marp: marp as unknown as MarpitLike });
  const { html, css } = marp.render(markdown);
  return { html, css };
}

/**
 * Every selector in a stylesheet, ignoring at-rule preludes and the steps
 * inside `@keyframes`.
 */
function ruleSelectors(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  const open: string[] = [];
  let prelude = '';

  for (const character of source) {
    if (character === '{') {
      const head = prelude.trim();
      prelude = '';
      const inKeyframes = open.some((rule) => rule.startsWith('@keyframes'));
      if (!head.startsWith('@') && !inKeyframes) selectors.push(...head.split(','));
      open.push(head);
    } else if (character === '}') {
      open.pop();
      prelude = '';
    } else {
      prelude += character;
    }
  }
  return selectors.map((selector) => selector.trim()).filter((selector) => selector !== '');
}

function payloads(html: string) {
  return [...html.matchAll(new RegExp(`${PAYLOAD_ATTRIBUTE}="([^"]*)"`, 'g'))].map((match) =>
    decodeDocument(match[1]),
  );
}

const DECK = [
  '---',
  'theme: gaia',
  'paginate: true',
  '---',
  '',
  '# Installing Nginx',
  '',
  '```termlogue',
  '@theme ubuntu',
  '@prompt [root@rhel10 ~]#',
  '$ dnf install -y nginx',
  '@pause Dependencies resolved',
  'Complete!',
  '```',
  '',
  '---',
  '',
  '# Starting Nginx',
  '',
  '```termlogue',
  '@theme dark',
  '$ systemctl status nginx',
  '<b>active</b> (running)',
  '```',
].join('\n');

describe('Terminalogue as a Marp engine', () => {
  it('renders each block into a placeholder inside its own slide', () => {
    const { html } = convert(DECK);

    expect(html.split(`class="${PLACEHOLDER_CLASS}"`)).toHaveLength(3);
    expect(html.split('<section')).toHaveLength(3);
    expect(payloads(html).map((document) => document?.theme)).toEqual(['ubuntu', 'dark']);
  });

  it('leaves the deck’s own Marp directives alone', () => {
    const { html } = convert(DECK);

    // theme, paginate and Marp's slide structure are untouched by Terminalogue.
    expect(html).toContain('data-theme="gaia"');
    expect(html).toContain('data-marpit-pagination="1"');
    expect(html).toContain('data-marpit-pagination="2"');
    expect(html).toContain('<h1 id="installing-nginx">Installing Nginx</h1>');
  });

  it('puts the stylesheet in the CSS Marp writes into the document head', () => {
    const { html, css } = convert(DECK);

    // Marpit takes the stylesheet, so no <style> element travels in the body.
    expect(html).not.toContain(STYLE_ELEMENT_ID);
    expect(css).toContain('.tlg');
    expect(css).toContain("data-theme='ubuntu'");
    expect(css).toContain('@keyframes tlg-blink');
    expect(css).toContain('--tlg-font-size: 18px');
  });

  it('scopes its stylesheet to the terminal and never to the slide', () => {
    const { css } = convert(DECK);

    // Marpit prefixes every rule with the slide container, and Terminalogue's
    // own half of each selector always names the terminal.
    for (const selector of ruleSelectors(css)) {
      if (!selector.includes('tlg')) continue;
      expect(selector).toMatch(/\.tlg/);
    }
  });

  it('namespaces every selector it contributes, before Marpit ever sees it', () => {
    const selectors = ruleSelectors(stylesheet());

    expect(selectors.length).toBeGreaterThan(30);
    for (const selector of selectors) {
      // Nothing Terminalogue ships may reach `section`, `body`, `pre` or
      // `code`: a Marp deck's own styling is the deck's business.
      expect(selector).toMatch(/^\.tlg/);
    }
  });

  it('keeps the Marp theme and the Terminalogue theme apart', () => {
    const { html, css } = convert(DECK);

    // `theme: gaia` styles the slide; `@theme ubuntu` styles the terminal.
    expect(html).toContain('data-theme="gaia"');
    expect(html).toContain(`${THEME_ATTRIBUTE}="ubuntu"`);
    expect(css).toContain('--tlg-bg: #300a24'); // ubuntu
    expect(css).not.toContain('.tlg[data-theme=\'gaia\']');
  });

  it('carries a slide’s @size through Marp, and the CSS that acts on it', () => {
    const { html, css } = convert(
      ['# Installing Nginx', '', '```termlogue', '@size 72x16', '$ ls', '```'].join('\n'),
    );

    expect(payloads(html)[0]?.size).toEqual({ columns: 72, rows: 16 });
    expect(html).toContain(`${SIZE_ATTRIBUTE}="72x16"`);
    // The rules that turn those numbers into a viewport travel with the deck,
    // and they are the shared stylesheet's, not rules Marp needs of its own.
    expect(css).toContain("[data-size='fixed']");
    expect(ruleSelectors(TERMINALOGUE_SLIDE_CSS)).not.toContain("[data-size='fixed']");
  });

  it('sizes a slide terminal in the slide’s own font, not the editor’s', () => {
    // A slide re-values `--tlg-font-size`, and columns and rows are measured in
    // that font, so `@size 72x16` is 72 slide-sized characters wide. Nothing in
    // the slide override touches the metrics themselves.
    expect(TERMINALOGUE_SLIDE_CSS).toContain('--tlg-font-size');
    for (const property of [
      '--tlg-line-height',
      '--tlg-line-min-height',
      '--tlg-screen-padding-x',
      '--tlg-screen-padding-y',
      '--tlg-border-width',
      '--tlg-columns',
      '--tlg-rows',
    ]) {
      expect(TERMINALOGUE_SLIDE_CSS).not.toContain(property);
    }
  });

  it('injects the runtime once, after the slides, with no external request', () => {
    const { html } = convert(DECK);

    expect(html.split(`id="${RUNTIME_ELEMENT_ID}"`)).toHaveLength(2);
    expect(html.indexOf(RUNTIME_ELEMENT_ID)).toBeGreaterThan(html.lastIndexOf('</section>'));
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it('adds nothing at all to a deck without a termlogue block', () => {
    const { html, css } = convert('---\nmarp: true\n---\n\n# Plain deck\n\n```bash\nls\n```\n');

    expect(html).not.toContain(PLACEHOLDER_CLASS);
    expect(html).not.toContain(RUNTIME_ELEMENT_ID);
    expect(css).not.toContain('.tlg');
  });

  it('keeps HTML in a termlogue block out of the slide, with Marp’s own HTML off', () => {
    const { html } = convert(DECK);

    // Marp escapes raw HTML in Markdown by default; a termlogue block does not
    // even reach that decision, because its content is never markup.
    expect(html).not.toContain('<b>active</b>');
    expect(payloads(html)[1]?.steps[1]).toMatchObject({ text: '<b>active</b> (running)' });
  });

  it('keeps a block’s content out of the slide even when Marp HTML is enabled', () => {
    const marp = new Marp({ html: true });
    terminalogueEngine({ marp: marp as unknown as MarpitLike });
    const { html } = marp.render(
      ['```termlogue', '$ echo hi', '<img src=x onerror=alert(1)>', '```'].join('\n'),
    );

    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/onerror\s*=/);
    expect(payloads(html)[0]?.steps[1]).toMatchObject({ text: '<img src=x onerror=alert(1)>' });
  });

  it('leaves Marp’s own code highlighting to Marp', () => {
    const { html } = convert(
      ['---', 'marp: true', '---', '', '```bash', 'dnf install -y nginx', '```'].join('\n'),
    );

    expect(html).toContain('language-bash');
    expect(html).not.toContain(PLACEHOLDER_CLASS);
  });
});
