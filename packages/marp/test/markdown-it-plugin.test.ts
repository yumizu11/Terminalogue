import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { terminalogueEngine } from '../src/engine.js';
import { terminaloguePlugin, type MarkdownItLike } from '../src/markdown-it-plugin.js';
import {
  PAYLOAD_ATTRIBUTE,
  PLACEHOLDER_CLASS,
  RUNTIME_ELEMENT_ID,
  STYLE_ELEMENT_ID,
  THEME_ATTRIBUTE,
  decodeDocument,
} from '../src/placeholder.js';

/** A plain markdown-it, i.e. the integration without Marpit underneath it. */
function render(markdown: string): string {
  const md = new MarkdownIt();
  terminaloguePlugin(md as unknown as MarkdownItLike);
  return md.render(markdown);
}

/** Every `data-terminalogue` payload in a rendered document, decoded. */
function payloads(html: string) {
  return [...html.matchAll(new RegExp(`${PAYLOAD_ATTRIBUTE}="([^"]*)"`, 'g'))].map((match) =>
    decodeDocument(match[1]),
  );
}

const NGINX = ['```termlogue', '@theme ubuntu', '@title RHEL 10', '$ dnf install -y nginx', 'Complete!', '```'].join(
  '\n',
);

describe('the Terminalogue markdown-it plugin', () => {
  it('turns a termlogue fence into an inert placeholder', () => {
    const html = render(NGINX);

    expect(html).toContain(`class="${PLACEHOLDER_CLASS}"`);
    expect(html).not.toContain('<code');
    expect(html).not.toContain('dnf install');
  });

  it('leaves every other fence to the renderer that owned the rule', () => {
    const html = render(['```bash', 'rm -rf /', '```'].join('\n'));

    expect(html).toContain('<code class="language-bash">');
    expect(html).toContain('rm -rf /');
    expect(html).not.toContain(PLACEHOLDER_CLASS);
  });

  it('parses the block with the shared Terminalogue parser', () => {
    const [document] = payloads(render(NGINX));

    expect(document?.title).toBe('RHEL 10');
    expect(document?.steps).toEqual([
      { kind: 'command', line: 3, prompt: '$', command: 'dnf install -y nginx' },
      { kind: 'output', line: 4, text: 'Complete!' },
    ]);
    expect(document?.finalPrompt).toBe('$');
  });

  it('keeps the block’s theme, on the payload and on the placeholder', () => {
    for (const theme of ['light', 'dark', 'ubuntu', 'powershell', 'cmd']) {
      const html = render(['```termlogue', `@theme ${theme}`, '$ ls', '```'].join('\n'));

      expect(html).toContain(`${THEME_ATTRIBUTE}="${theme}"`);
      expect(payloads(html)[0]?.theme).toBe(theme);
    }

    // A block with no @theme keeps the look it had before themes existed.
    expect(payloads(render(NGINX.replace('@theme ubuntu\n', '')))[0]?.theme).toBe('dark');
  });

  it('keeps @type, @pause, @wait, @clear and @speed', () => {
    const html = render(
      [
        '```termlogue',
        '@speed 20ms',
        '$ ssh rhel10',
        'Continue? [yes/no] ',
        '@type yes',
        '@pause connected',
        '@wait 700ms',
        '@clear',
        'done',
        '```',
      ].join('\n'),
    );
    const [document] = payloads(html);

    expect(document?.steps.map((step) => step.kind)).toEqual([
      'command',
      'output',
      'type',
      'pause',
      'wait',
      'clear',
      'output',
    ]);
    expect(document?.steps.find((step) => step.kind === 'pause')).toMatchObject({
      label: 'connected',
    });
    expect(document?.steps.find((step) => step.kind === 'wait')).toMatchObject({ ms: 700 });
    expect(document?.steps.find((step) => step.kind === 'command')).toMatchObject({ speedMs: 20 });
  });

  it('reports a parse error inside its own block, not as a broken document', () => {
    const html = render(['```termlogue', '@foo bar', '$ ls', '```'].join('\n'));
    const [document] = payloads(html);

    expect(document?.diagnostics).toEqual([
      { line: 1, message: expect.stringContaining('Unknown directive "@foo"'), severity: 'error' },
    ]);
    // The rest of the block still plays.
    expect(document?.steps).toHaveLength(1);
    expect(html).toContain(PLACEHOLDER_CLASS);
  });

  it('never lets block content reach the page as markup', () => {
    const html = render(
      [
        '```termlogue',
        '@title <img src=x onerror=alert(1)>',
        '$ echo "</div><script>alert(1)</script>"',
        '<script>alert(2)</script>',
        '```',
      ].join('\n'),
    );

    // Nothing from the block survives as a tag, an attribute or a quote break.
    const placeholder = html.slice(html.indexOf('<div class="terminalogue-block'));
    const tag = placeholder.slice(0, placeholder.indexOf('</div>'));
    expect(tag).not.toContain('<script');
    // The word survives percent-encoding; an attribute that could fire does not.
    expect(tag).not.toMatch(/onerror\s*=/);
    expect(tag.match(/"/g)).toHaveLength(6); // exactly the three attribute value pairs

    // …but it is all still there, as text, for the renderer.
    const [document] = payloads(html);
    expect(document?.title).toBe('<img src=x onerror=alert(1)>');
    expect(document?.steps[1]).toMatchObject({ text: '<script>alert(2)</script>' });
  });

  it('gives every block its own independent payload', () => {
    const html = render(
      [
        '```termlogue',
        '@theme ubuntu',
        '$ one',
        '```',
        '',
        'Text between the blocks.',
        '',
        '```termlogue',
        '@theme cmd',
        '@prompt C:\\>',
        '$ two',
        '```',
      ].join('\n'),
    );
    const documents = payloads(html);

    expect(documents).toHaveLength(2);
    expect(documents[0]?.theme).toBe('ubuntu');
    expect(documents[1]?.theme).toBe('cmd');
    expect(documents[0]?.finalPrompt).toBe('$');
    expect(documents[1]?.finalPrompt).toBe('C:\\>');
    expect(html).toContain('Text between the blocks.');
  });

  describe('the injected runtime', () => {
    it('is added exactly once, however many blocks a document has', () => {
      const html = render([NGINX, '', NGINX, '', NGINX].join('\n'));

      expect(html.split(`id="${RUNTIME_ELEMENT_ID}"`)).toHaveLength(2);
      expect(html.split(`id="${STYLE_ELEMENT_ID}"`)).toHaveLength(2);
      expect(payloads(html)).toHaveLength(3);
    });

    it('is added once even when the plugin is registered twice', () => {
      const md = new MarkdownIt();
      terminaloguePlugin(md as unknown as MarkdownItLike);
      terminaloguePlugin(md as unknown as MarkdownItLike);
      const html = md.render(NGINX);

      expect(html.split(`id="${RUNTIME_ELEMENT_ID}"`)).toHaveLength(2);
      expect(html.split(`id="${STYLE_ELEMENT_ID}"`)).toHaveLength(2);
      expect(payloads(html)).toHaveLength(1);
    });

    it('is left out of a document with no termlogue block at all', () => {
      const html = render('# Just a deck\n\n```bash\nls\n```\n');

      expect(html).not.toContain(RUNTIME_ELEMENT_ID);
      expect(html).not.toContain(STYLE_ELEMENT_ID);
    });

    it('carries the shared stylesheet and the renderer, with no network access', () => {
      const html = render(NGINX);

      expect(html).toContain('.tlg[data-theme=');
      expect(html).toContain('--tlg-font-size: 18px');
      expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/);
      expect(html).not.toContain('https://');
    });
  });

  it('is what the Marp engine installs, and installs nothing else', () => {
    const installed: unknown[] = [];
    const marp = {
      use(plugin: (md: MarkdownItLike) => void) {
        installed.push(plugin);
        return marp;
      },
    };

    expect(terminalogueEngine({ marp })).toBe(marp);
    expect(installed).toEqual([terminaloguePlugin]);
  });

  it('is a functional engine, which Marp CLI tells from a class by its prototype', () => {
    // Marp CLI calls an engine with the prepared `marp` instance only when it
    // has no prototype; anything else it tries to `new`.
    expect(terminalogueEngine.prototype).toBeUndefined();
  });
});
