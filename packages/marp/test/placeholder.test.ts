import { parseTerminalogue } from '@terminalogue/core';
import { describe, expect, it } from 'vitest';
import { decodeDocument, encodeDocument, fenceLanguage, unreadableDocument } from '../src/placeholder.js';

describe('the placeholder payload', () => {
  it('round-trips a parsed document', () => {
    const source = ['@theme ubuntu', '@title Deploy', '@prompt #', '$ ls -la', 'total 0'].join('\n');
    const document = parseTerminalogue(source);

    expect(decodeDocument(encodeDocument(document))).toEqual(document);
  });

  it('keeps @type, @pause, @wait and @clear as the parser produced them', () => {
    const source = [
      '$ ssh rhel10',
      'Continue? [yes/no] ',
      '@type yes',
      '@pause connected',
      '@wait 700ms',
      '@clear',
      'done',
    ].join('\n');
    const document = parseTerminalogue(source);
    const decoded = decodeDocument(encodeDocument(document));

    expect(decoded?.steps.map((step) => step.kind)).toEqual([
      'command',
      'output',
      'type',
      'pause',
      'wait',
      'clear',
      'output',
    ]);
    expect(decoded?.steps).toEqual(document.steps);
  });

  it('escapes every character that could break out of an attribute', () => {
    const encoded = encodeDocument(parseTerminalogue('<img src=x onerror=alert(1)>\n"&<>'));

    for (const character of ['<', '>', '&', '"']) {
      expect(encoded).not.toContain(character);
    }
  });

  it('carries a block’s diagnostics through to the renderer', () => {
    const decoded = decodeDocument(encodeDocument(parseTerminalogue('@bogus x')));

    expect(decoded?.diagnostics).toHaveLength(1);
    expect(decoded?.diagnostics[0]?.message).toContain('@bogus');
  });

  it('carries a fixed @size through to the renderer', () => {
    const document = parseTerminalogue(['@size 72x16', '$ ls'].join('\n'));

    expect(document.size).toEqual({ columns: 72, rows: 16 });
    expect(decodeDocument(encodeDocument(document))?.size).toEqual({ columns: 72, rows: 16 });
  });

  it('leaves a block without @size automatically sized on the other side too', () => {
    const decoded = decodeDocument(encodeDocument(parseTerminalogue('$ ls')));

    expect(decoded?.size).toBeUndefined();
    expect(decoded && 'size' in decoded).toBe(false);
  });

  it('drops a size that is not a pair of in-range integers', () => {
    // The payload is an attribute in generated HTML: anything that reaches the
    // renderer through it is re-validated, so no hand-edited size can become a
    // style. An unusable one falls back to automatic sizing.
    for (const size of [
      '80x24',
      { columns: '80; background:url(evil.css)', rows: 24 },
      { columns: 80 },
      { columns: 80, rows: 0 },
      { columns: 10, rows: 24 },
      { columns: 80, rows: 200 },
      { columns: 80.5, rows: 24 },
      null,
    ]) {
      const raw = encodeURIComponent(
        JSON.stringify({ theme: 'dark', size, steps: [], finalPrompt: '$', diagnostics: [] }),
      );
      expect(decodeDocument(raw)?.size).toBeUndefined();
    }
  });

  it('rejects anything that is not a document instead of throwing', () => {
    for (const raw of [null, undefined, '', 'not%20json', '%7B%7D', encodeURIComponent('[]')]) {
      expect(decodeDocument(raw)).toBeNull();
    }
  });

  it('falls back to safe values for a document with unusable fields', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ theme: 'url(evil)', steps: [], finalPrompt: 42, diagnostics: 'nope' }),
    );

    expect(decodeDocument(raw)).toEqual({
      theme: 'dark',
      steps: [],
      finalPrompt: '$',
      diagnostics: [],
    });
  });

  it('describes an unreadable block as a diagnostic rather than an empty terminal', () => {
    expect(unreadableDocument('broken')).toEqual({
      theme: 'dark',
      steps: [],
      finalPrompt: '$',
      diagnostics: [{ line: 1, message: 'broken', severity: 'error' }],
    });
  });

  it('reads the language word out of a fence info string', () => {
    expect(fenceLanguage('termlogue')).toBe('termlogue');
    expect(fenceLanguage('  TermLogue  {1-3}  ')).toBe('termlogue');
    expect(fenceLanguage('bash')).toBe('bash');
    expect(fenceLanguage('')).toBe('');
  });
});
