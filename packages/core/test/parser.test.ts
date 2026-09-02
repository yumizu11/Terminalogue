import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT, parseTerminalogue } from '../src/parser.js';
import { toCommands, toTranscript } from '../src/transcript.js';
import type { CommandStep, OutputStep, PauseStep, TypeStep, WaitStep } from '../src/types.js';

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

  it('keeps trailing whitespace, which @type relies on', () => {
    // `Proceed? [y/N] ` must keep its space so that `@type y` reads as
    // `Proceed? [y/N] y` rather than `Proceed? [y/N]y`.
    const [step] = parse('Proceed? [y/N] \n@type y').steps as [OutputStep, TypeStep];
    expect(step.text).toBe('Proceed? [y/N] ');
  });
});

describe('parseTerminalogue: @type', () => {
  it('reads the text to type', () => {
    const doc = parse('Continue? \n@type yes');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.steps[1]).toEqual<TypeStep>({ kind: 'type', line: 2, text: 'yes' });
  });

  it('keeps spaces inside the typed text', () => {
    const [step] = parse('@type y e s').steps as [TypeStep];
    expect(step.text).toBe('y e s');
  });

  it('applies @speed to typed input as well as to commands', () => {
    const doc = parse('@speed 20ms\n$ ssh host\nContinue? \n@type yes');
    const command = doc.steps.find((step) => step.kind === 'command') as CommandStep;
    const typed = doc.steps.find((step) => step.kind === 'type') as TypeStep;
    expect(command.speedMs).toBe(20);
    expect(typed.speedMs).toBe(20);
  });

  it('reports a bare @type instead of typing nothing', () => {
    const doc = parse('Continue? \n@type');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
    expect(doc.diagnostics[0]!.message).toContain('@type');
    expect(doc.steps.some((step) => step.kind === 'type')).toBe(false);
  });

  it('reports an @type whose argument is only whitespace', () => {
    expect(parse('@type    ').diagnostics).toHaveLength(1);
  });

  it('never treats typed text as anything but text', () => {
    const [step] = parse('@type <script>alert(1)</script>').steps as [TypeStep];
    expect(step.text).toBe('<script>alert(1)</script>');
  });
});

describe('parseTerminalogue: @pause', () => {
  it('reads a bare @pause as a breakpoint with no label', () => {
    const doc = parse('$ ls\n@pause');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.steps[1]).toEqual<PauseStep>({ kind: 'pause', line: 2 });
    expect((doc.steps[1] as PauseStep).label).toBeUndefined();
  });

  it('keeps the optional label', () => {
    const [step] = parse('@pause Dependencies resolved').steps as [PauseStep];
    expect(step.label).toBe('Dependencies resolved');
  });

  it('keeps breakpoints in source order among the other steps', () => {
    const doc = parse('$ a\n@pause\nout\n@pause done');
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'pause', 'output', 'pause']);
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

  it('names the v0.2 directives when rejecting an unknown one', () => {
    const message = parse('@bogus').diagnostics[0]!.message;
    expect(message).toContain('@type');
    expect(message).toContain('@pause');
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

  it('appends @type to the previous transcript line', () => {
    expect(toTranscript(parse('Proceed? [y/N] \n@type y\nDone'))).toBe('Proceed? [y/N] y\nDone');
  });

  it('starts a transcript line when @type has nothing to answer', () => {
    expect(toTranscript(parse('@type yes'))).toBe('yes');
  });

  it('leaves @pause out of the transcript', () => {
    expect(toTranscript(parse('one\n@pause here\ntwo'))).toBe('one\ntwo');
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

describe('toCommands', () => {
  it('extracts the $ command lines and nothing else', () => {
    const doc = parse(
      ['$ command1', 'output', '@type yes', '@wait 500ms', '@pause note', '$ command2'].join('\n'),
    );
    expect(toCommands(doc)).toEqual(['command1', 'command2']);
  });

  it('drops the prompt, so the text is what a reader would paste', () => {
    const doc = parse('@prompt [root@rhel10 ~]#\n$ dnf install -y nginx');
    expect(toCommands(doc)).toEqual(['dnf install -y nginx']);
  });

  it('skips empty command lines rather than copying blank lines', () => {
    expect(toCommands(parse('$ ls\n$\n$ pwd'))).toEqual(['ls', 'pwd']);
  });

  it('returns nothing for a block that only shows output', () => {
    expect(toCommands(parse('just output\n@type yes'))).toEqual([]);
  });
});
