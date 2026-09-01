import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT, parseTerminalogue } from '../src/parser.js';
import { toTranscript } from '../src/transcript.js';
import type { CommandStep, OutputStep, WaitStep } from '../src/types.js';

const parse = parseTerminalogue;

describe('parseTerminalogue: commands', () => {
  it('reads `$ ` lines as commands using the default prompt', () => {
    const doc = parse('$ dnf install -y nginx');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.steps).toEqual([
      { kind: 'command', line: 1, prompt: DEFAULT_PROMPT, command: 'dnf install -y nginx' },
    ]);
  });

  it('treats a bare `$` as an empty command', () => {
    const doc = parse('$');
    expect(doc.steps).toEqual([{ kind: 'command', line: 1, prompt: '$', command: '' }]);
  });

  it('strips trailing whitespace from commands', () => {
    const [step] = parse('$ ls -la   ').steps as [CommandStep];
    expect(step.command).toBe('ls -la');
  });

  it('keeps `$` that is not followed by a space as output', () => {
    const doc = parse('$HOME is set');
    expect(doc.steps).toEqual([{ kind: 'output', line: 1, text: '$HOME is set' }]);
  });
});

describe('parseTerminalogue: output', () => {
  it('reads ordinary lines as output', () => {
    const doc = parse('Updating repositories...\nComplete!');
    expect(doc.steps).toEqual([
      { kind: 'output', line: 1, text: 'Updating repositories...' },
      { kind: 'output', line: 2, text: 'Complete!' },
    ]);
  });

  it('keeps interior blank lines but trims leading and trailing ones', () => {
    const doc = parse('\n\nfirst\n\nsecond\n\n\n');
    expect(doc.steps.map((step) => (step as OutputStep).text)).toEqual(['first', '', 'second']);
    expect(doc.steps[0]!.line).toBe(3);
  });

  it('preserves indentation in output', () => {
    const [step] = parse('     Active: active (running)').steps as [OutputStep];
    expect(step.text).toBe('     Active: active (running)');
  });
});

describe('parseTerminalogue: directives', () => {
  it('reads @title', () => {
    expect(parse('@title Installing Nginx').title).toBe('Installing Nginx');
  });

  it('lets a later @title win', () => {
    expect(parse('@title one\n@title two').title).toBe('two');
  });

  it('leaves title undefined when absent', () => {
    expect(parse('$ ls').title).toBeUndefined();
  });

  it('applies @prompt to the commands that follow it', () => {
    const doc = parse('$ first\n@prompt [root@rhel10 ~]#\n$ second');
    const prompts = doc.steps
      .filter((step): step is CommandStep => step.kind === 'command')
      .map((step) => step.prompt);
    expect(prompts).toEqual(['$', '[root@rhel10 ~]#']);
    expect(doc.finalPrompt).toBe('[root@rhel10 ~]#');
  });

  it('reads @wait as a step in source order', () => {
    const doc = parse('output\n@wait 800ms\nmore\n@wait 1.5s');
    expect(doc.steps.filter((step) => step.kind === 'wait')).toEqual<WaitStep[]>([
      { kind: 'wait', line: 2, ms: 800 },
      { kind: 'wait', line: 4, ms: 1500 },
    ]);
  });

  it('applies @speed only to later commands', () => {
    const doc = parse('$ a\n@speed 20ms\n$ b');
    const commands = doc.steps.filter((step): step is CommandStep => step.kind === 'command');
    expect(commands[0]!.speedMs).toBeUndefined();
    expect(commands[1]!.speedMs).toBe(20);
  });

  it('reads @clear as a step', () => {
    const doc = parse('$ ls\n@clear\n$ pwd');
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'clear', 'command']);
  });

  it('matches directive names case insensitively', () => {
    expect(parse('@TITLE Hello').title).toBe('Hello');
    expect(parse('@Clear').steps.map((step) => step.kind)).toEqual(['clear']);
  });
});

describe('parseTerminalogue: escapes', () => {
  it('escapes a leading $', () => {
    const doc = parse('\\$ not a command');
    expect(doc.steps).toEqual([{ kind: 'output', line: 1, text: '$ not a command' }]);
  });

  it('escapes a leading @', () => {
    const doc = parse('\\@title stays output');
    expect(doc.steps).toEqual([{ kind: 'output', line: 1, text: '@title stays output' }]);
    expect(doc.diagnostics).toEqual([]);
  });

  it('escapes a leading backslash', () => {
    const doc = parse('\\\\@title');
    expect(doc.steps).toEqual([{ kind: 'output', line: 1, text: '\\@title' }]);
  });

  it('leaves a backslash that is not an escape alone', () => {
    const doc = parse('\\path\\to\\file');
    expect(doc.steps).toEqual([{ kind: 'output', line: 1, text: '\\path\\to\\file' }]);
  });
});

describe('parseTerminalogue: diagnostics', () => {
  it('reports unknown directives with a line number', () => {
    const doc = parse('$ ls\n@bogus something');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
    expect(doc.diagnostics[0]!.message).toContain('@bogus');
    expect(doc.diagnostics[0]!.message).toContain('@title');
  });

  it('reports invalid @wait durations', () => {
    const doc = parse('@wait soon');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.line).toBe(1);
    expect(doc.diagnostics[0]!.message).toContain('@wait');
    expect(doc.steps).toEqual([]);
  });

  it('reports missing @wait durations', () => {
    expect(parse('@wait').diagnostics).toHaveLength(1);
  });

  it('reports invalid and non-positive @speed', () => {
    expect(parse('@speed nope').diagnostics).toHaveLength(1);
    expect(parse('@speed 0ms').diagnostics[0]!.message).toContain('greater than 0');
  });

  it('reports empty @title and @prompt arguments', () => {
    expect(parse('@title').diagnostics[0]!.message).toContain('@title');
    expect(parse('@prompt   ').diagnostics[0]!.message).toContain('@prompt');
  });

  it('reports arguments passed to @clear', () => {
    expect(parse('@clear now').diagnostics[0]!.message).toContain('no arguments');
  });

  it('reports malformed directives', () => {
    const doc = parse('@ oops');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('Malformed directive');
  });

  it('keeps parsing after a diagnostic instead of throwing', () => {
    const doc = parse('@bogus\n$ ls\nfile.txt');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'output']);
  });
});

describe('parseTerminalogue: whole documents', () => {
  const source = [
    '@title Installing Nginx on RHEL 10',
    '@prompt [root@rhel10 ~]#',
    '',
    '$ dnf install -y nginx',
    'Updating repositories...',
    '@wait 800ms',
    'Complete!',
    '',
    '$ curl http://localhost/',
    '<!doctype html>',
  ].join('\n');

  it('produces the expected step sequence', () => {
    const doc = parse(source);
    expect(doc.title).toBe('Installing Nginx on RHEL 10');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.steps.map((step) => step.kind)).toEqual([
      'command',
      'output',
      'wait',
      'output',
      'output',
      'command',
      'output',
    ]);
  });

  it('renders a plain text transcript', () => {
    expect(toTranscript(parse(source))).toBe(
      [
        '[root@rhel10 ~]# dnf install -y nginx',
        'Updating repositories...',
        'Complete!',
        '',
        '[root@rhel10 ~]# curl http://localhost/',
        '<!doctype html>',
      ].join('\n'),
    );
  });

  it('drops transcript lines cleared by @clear', () => {
    expect(toTranscript(parse('gone\n@clear\nkept'))).toBe('kept');
  });

  it('handles CRLF sources', () => {
    const doc = parse('@title CRLF\r\n$ ls\r\nfile.txt\r\n');
    expect(doc.title).toBe('CRLF');
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'output']);
  });

  it('handles an empty source', () => {
    expect(parse('')).toEqual({ steps: [], finalPrompt: '$', diagnostics: [] });
  });
});
