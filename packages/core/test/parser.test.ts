import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT,
  DEFAULT_THEME,
  TERMINALOGUE_THEMES,
  isTerminalogueTheme,
  parseTerminalogue,
} from '../src/parser.js';
import { TERMINAL_SIZE_LIMITS, isTerminalSize, parseTerminalSize } from '../src/size.js';
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

describe('parseTerminalogue: @theme', () => {
  /**
   * Steps without their line numbers, so a document can be compared with the
   * same document plus a `@theme` line that shifts every line below it.
   */
  const shape = (source: string): unknown[] =>
    parse(source).steps.map(({ line: _line, ...rest }) => rest);

  it('reads every supported theme', () => {
    for (const theme of TERMINALOGUE_THEMES) {
      const doc = parse(`@theme ${theme}\n$ echo hello`);
      expect(doc.diagnostics).toEqual([]);
      expect(doc.theme).toBe(theme);
    }
  });

  it('defaults to dark, so pre-theme documents look unchanged', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(parse('$ echo hello\nhello').theme).toBe('dark');
    expect(parse('').theme).toBe('dark');
    // A v0.2 document exercising every directive there was.
    const legacy = [
      '@title Installing Nginx',
      '@prompt [root@rhel10 ~]#',
      '@speed 35ms',
      '$ dnf install -y nginx',
      'Proceed? [y/N] ',
      '@type y',
      '@wait 800ms',
      '@pause done',
      '@clear',
    ].join('\n');
    expect(parse(legacy).theme).toBe('dark');
    expect(parse(legacy).diagnostics).toEqual([]);
  });

  it('reads @theme dark as exactly the same document as no @theme at all', () => {
    const withTheme = parse('@theme dark\n\n$ echo hello\nhello');
    const without = parse('$ echo hello\nhello');
    expect(withTheme.theme).toBe(without.theme);
    expect(shape('@theme dark\n\n$ echo hello\nhello')).toEqual(shape('$ echo hello\nhello'));
    expect(withTheme.diagnostics).toEqual([]);
  });

  it('matches theme names case insensitively and normalises them to lowercase', () => {
    expect(parse('@theme Ubuntu').theme).toBe('ubuntu');
    expect(parse('@theme PowerShell').theme).toBe('powershell');
    expect(parse('@theme CMD').theme).toBe('cmd');
    expect(parse('@THEME Light').theme).toBe('light');
    expect(parse('@theme DaRk').diagnostics).toEqual([]);
  });

  it('produces no step of its own: a theme changes nothing about playback', () => {
    const source = '$ Get-Service\nRunning  WinRM';
    for (const theme of TERMINALOGUE_THEMES) {
      expect(shape(`@theme ${theme}\n${source}`)).toEqual(shape(source));
      expect(parse(`@theme ${theme}\n${source}`).finalPrompt).toBe(parse(source).finalPrompt);
    }
  });

  it('leaves the prompt alone: a theme is presentation only', () => {
    // `@theme powershell` must not turn the prompt into `PS C:\>`; only
    // `@prompt` ever decides what a command line is prefixed with.
    expect(parse('@theme powershell\n$ Get-Process').finalPrompt).toBe(DEFAULT_PROMPT);
    expect(parse('@theme cmd\n$ ver').finalPrompt).toBe(DEFAULT_PROMPT);
    expect(parse('@theme ubuntu\n@prompt user@ubuntu:~$\n$ ls').finalPrompt).toBe(
      'user@ubuntu:~$',
    );
  });

  it('reports an unknown theme with its line number and the supported names', () => {
    const doc = parse('$ ls\n@theme solarized');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
    const message = doc.diagnostics[0]!.message;
    expect(message).toContain('Unknown theme "solarized"');
    for (const theme of TERMINALOGUE_THEMES) expect(message).toContain(theme);
  });

  it('falls back to the default theme rather than dropping the block', () => {
    const doc = parse('@theme solarized\n$ echo hello\nhello');
    expect(doc.theme).toBe(DEFAULT_THEME);
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'output']);
  });

  it('rejects anything that is not a theme name, including colours and CSS', () => {
    // A theme can only ever be one of five words: the DSL offers no way to
    // reach a colour, a URL or a stylesheet.
    for (const argument of ['#ffffff', 'url(evil.css)', '<style>x</style>', 'red', 'dark;']) {
      const doc = parse(`@theme ${argument}`);
      expect(doc.theme).toBe(DEFAULT_THEME);
      expect(doc.diagnostics).toHaveLength(1);
      expect(doc.diagnostics[0]!.message).toContain('Unknown theme');
    }
  });

  it('reports a bare @theme', () => {
    const doc = parse('@theme');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('@theme expects a theme name');
    expect(doc.theme).toBe(DEFAULT_THEME);
  });

  it('keeps the first @theme and reports the duplicate', () => {
    const doc = parse('@theme ubuntu\n@theme dark\n\n$ echo hello');
    expect(doc.theme).toBe('ubuntu');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
    expect(doc.diagnostics[0]!.message).toContain('Duplicate @theme directive');
    // The message points back at the line that won, and names the loser.
    expect(doc.diagnostics[0]!.message).toContain('line 1');
    expect(doc.diagnostics[0]!.message).toContain('ubuntu');
    expect(doc.diagnostics[0]!.message).toContain('dark');
  });

  it('reports a repeated @theme even when it repeats the same theme', () => {
    const doc = parse('@theme cmd\n@theme cmd');
    expect(doc.theme).toBe('cmd');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('Duplicate @theme directive');
  });

  it('reports an invalid second @theme as the unknown theme it is', () => {
    const doc = parse('@theme ubuntu\n@theme solarized');
    expect(doc.theme).toBe('ubuntu');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('Unknown theme');
  });

  it('keeps parsing the rest of the block after a theme diagnostic', () => {
    const doc = parse('@theme nope\n$ ls\nfile.txt');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'output']);
  });
});

describe('parseTerminalogue: @size', () => {
  /**
   * Steps without their line numbers, so a document can be compared with the
   * same document plus a `@size` line that shifts every line below it.
   */
  const shape = (source: string): unknown[] =>
    parse(source).steps.map(({ line: _line, ...rest }) => rest);

  it('reads <columns>x<rows> as a fixed terminal viewport', () => {
    const doc = parse('@size 80x24\n$ echo hello');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.size).toEqual({ columns: 80, rows: 24 });
  });

  it('accepts the whole documented range, edges included', () => {
    for (const [source, size] of [
      ['@size 80x24', { columns: 80, rows: 24 }],
      ['@size 40x10', { columns: 40, rows: 10 }],
      ['@size 20x5', { columns: 20, rows: 5 }],
      ['@size 240x100', { columns: 240, rows: 100 }],
    ] as const) {
      const doc = parse(source);
      expect(doc.diagnostics).toEqual([]);
      expect(doc.size).toEqual(size);
    }
  });

  it('leaves a document without @size automatically sized', () => {
    expect(parse('$ echo hello\nhello').size).toBeUndefined();
    expect(parse('').size).toBeUndefined();
    // A v0.4 document exercising every directive there was.
    const legacy = [
      '@theme ubuntu',
      '@title Installing Nginx',
      '@prompt [root@rhel10 ~]#',
      '@speed 35ms',
      '$ dnf install -y nginx',
      'Proceed? [y/N] ',
      '@type y',
      '@pause installing',
      '@wait 800ms',
      '@clear',
      'Complete!',
    ].join('\n');
    const doc = parse(legacy);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.size).toBeUndefined();
    expect('size' in doc).toBe(false);
  });

  it('produces no step of its own: a size changes nothing about playback', () => {
    const source = '@prompt #\n$ ls\nfile.txt\n@type y\n@pause here\n@wait 1s\n@clear';
    expect(shape(`@size 80x24\n${source}`)).toEqual(shape(source));
    expect(parse(`@size 80x24\n${source}`).finalPrompt).toBe(parse(source).finalPrompt);
    expect(parse(`@size 80x24\n${source}`).theme).toBe(parse(source).theme);
  });

  it('matches the directive name case insensitively', () => {
    expect(parse('@SIZE 80x24').size).toEqual({ columns: 80, rows: 24 });
    expect(parse('@Size 80x24').diagnostics).toEqual([]);
  });

  it('rejects everything that is not <integer>x<integer>', () => {
    // The separator is a lowercase `x` and the numbers are plain digits.
    // Anything else — an uppercase X, a comma, a star, a sign, a unit, a
    // second value, or CSS smuggled in behind the numbers — is a diagnostic.
    const invalid = [
      '@size 80',
      '@size x24',
      '@size 80x',
      '@size abc',
      '@size 80*24',
      '@size 80,24',
      '@size 80X24',
      '@size -80x24',
      '@size +80x24',
      '@size 80 x 24',
      '@size 80x24x2',
      '@size 80.5x24',
      '@size 80px x 24px',
      '@size 80x24; background:url(evil.css)',
      '@size 80x24 }',
      '@size calc(80)x24',
    ];
    for (const source of invalid) {
      const doc = parse(source);
      expect(doc.size).toBeUndefined();
      expect(doc.diagnostics).toHaveLength(1);
      expect(doc.diagnostics[0]!.message).toContain('@size');
      expect(doc.diagnostics[0]!.message).toContain('<columns>x<rows>');
    }
  });

  it('reports a bare @size', () => {
    const doc = parse('@size');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('@size');
    expect(doc.diagnostics[0]!.message).toContain('missing size');
    expect(doc.size).toBeUndefined();
  });

  it('rejects a size outside the supported range, naming both ranges', () => {
    for (const source of [
      '@size 0x24',
      '@size 80x0',
      '@size 10x24',
      '@size 19x24',
      '@size 241x24',
      '@size 80x4',
      '@size 80x101',
      '@size 80x200',
      '@size 9999x9999',
    ]) {
      const doc = parse(source);
      expect(doc.size).toBeUndefined();
      expect(doc.diagnostics).toHaveLength(1);
      const message = doc.diagnostics[0]!.message;
      expect(message).toContain('out of range');
      expect(message).toContain(`between ${TERMINAL_SIZE_LIMITS.minColumns}`);
      expect(message).toContain(`${TERMINAL_SIZE_LIMITS.maxColumns}`);
      expect(message).toContain(`${TERMINAL_SIZE_LIMITS.minRows}`);
      expect(message).toContain(`${TERMINAL_SIZE_LIMITS.maxRows}`);
    }
  });

  it('anchors an invalid size to its own line', () => {
    const doc = parse('$ ls\nfile.txt\n@size abc');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]).toMatchObject({ line: 3, severity: 'error' });
  });

  it('keeps the first @size and reports the duplicate, as @theme does', () => {
    const doc = parse('@size 80x24\n@size 100x30\n\n$ echo hello');
    expect(doc.size).toEqual({ columns: 80, rows: 24 });
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.line).toBe(2);
    expect(doc.diagnostics[0]!.message).toContain('Duplicate @size directive');
    expect(doc.diagnostics[0]!.message).toContain('80x24');
    expect(doc.diagnostics[0]!.message).toContain('line 1');
  });

  it('reports a repeated @size even when it repeats the same size', () => {
    const doc = parse('@size 80x24\n@size 80x24');
    expect(doc.size).toEqual({ columns: 80, rows: 24 });
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('Duplicate @size directive');
  });

  it('reports an invalid second @size as the invalid size it is', () => {
    const doc = parse('@size 80x24\n@size nope');
    expect(doc.size).toEqual({ columns: 80, rows: 24 });
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.diagnostics[0]!.message).toContain('invalid size');
  });

  it('keeps parsing the rest of the block after a size diagnostic', () => {
    const doc = parse('@size nope\n$ ls\nfile.txt');
    expect(doc.diagnostics).toHaveLength(1);
    expect(doc.steps.map((step) => step.kind)).toEqual(['command', 'output']);
  });

  it('names @size when rejecting an unknown directive', () => {
    expect(parse('@bogus').diagnostics[0]!.message).toContain('@size');
  });

  it('leaves @cols, @rows, @width and @height unknown: the DSL has one size directive', () => {
    for (const source of ['@cols 80', '@rows 24', '@width 80', '@height 24']) {
      const doc = parse(source);
      expect(doc.size).toBeUndefined();
      expect(doc.diagnostics[0]!.message).toContain('Unknown directive');
    }
  });
});

describe('parseTerminalSize', () => {
  it('returns the two numbers as validated integers', () => {
    expect(parseTerminalSize('80x24')).toEqual({ ok: true, size: { columns: 80, rows: 24 } });
    expect(parseTerminalSize('  72x16  ')).toEqual({ ok: true, size: { columns: 72, rows: 16 } });
  });

  it('never returns a size a renderer would have to sanitise', () => {
    for (const raw of ['', '80', '80x', 'x24', '80X24', '80;24', '1e2x24', '0x24', '80x9999']) {
      expect(parseTerminalSize(raw).ok).toBe(false);
    }
  });
});

describe('isTerminalSize', () => {
  it('accepts a pair of in-range integers and nothing else', () => {
    expect(isTerminalSize({ columns: 80, rows: 24 })).toBe(true);
    expect(isTerminalSize({ columns: 20, rows: 5 })).toBe(true);
    expect(isTerminalSize({ columns: 240, rows: 100 })).toBe(true);

    for (const value of [
      null,
      undefined,
      '80x24',
      42,
      {},
      { columns: 80 },
      { rows: 24 },
      { columns: 19, rows: 24 },
      { columns: 241, rows: 24 },
      { columns: 80, rows: 4 },
      { columns: 80, rows: 101 },
      { columns: 80.5, rows: 24 },
      { columns: '80', rows: '24' },
      { columns: Number.NaN, rows: 24 },
      { columns: Number.POSITIVE_INFINITY, rows: 24 },
    ]) {
      expect(isTerminalSize(value)).toBe(false);
    }
  });
});

describe('isTerminalogueTheme', () => {
  it('accepts exactly the five supported themes', () => {
    for (const theme of TERMINALOGUE_THEMES) expect(isTerminalogueTheme(theme)).toBe(true);
    for (const other of ['Dark', 'solarized', '#fff', '', null, undefined, 0, {}]) {
      expect(isTerminalogueTheme(other)).toBe(false);
    }
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

  it('names @theme when rejecting an unknown directive', () => {
    expect(parse('@bogus').diagnostics[0]!.message).toContain('@theme');
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
    expect(parse('')).toEqual({ steps: [], theme: 'dark', finalPrompt: '$', diagnostics: [] });
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
