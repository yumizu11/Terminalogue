import { parseDuration } from './duration.js';
import type {
  ClearStep,
  CommandStep,
  Diagnostic,
  OutputStep,
  PauseStep,
  Step,
  TerminalogueDocument,
  TerminalogueTheme,
  TypeStep,
  WaitStep,
} from './types.js';

/** Prompt used until an `@prompt` directive says otherwise. */
export const DEFAULT_PROMPT = '$';

/**
 * Every theme `@theme` accepts, in the order the documentation lists them.
 *
 * This is the whole vocabulary of the directive: a theme name is matched
 * against this allowlist and nothing else ever reaches the renderer, so a
 * document cannot name a colour, a URL or a stylesheet.
 */
export const TERMINALOGUE_THEMES: readonly TerminalogueTheme[] = [
  'light',
  'dark',
  'ubuntu',
  'powershell',
  'cmd',
];

/**
 * Theme used when a block has no `@theme`.
 *
 * `dark` is what a Terminalogue block looked like before themes existed, so
 * every v0.1 and v0.2 document keeps its appearance unchanged.
 */
export const DEFAULT_THEME: TerminalogueTheme = 'dark';

/** Narrows an arbitrary string to a theme name. Case sensitive; normalise first. */
export function isTerminalogueTheme(value: unknown): value is TerminalogueTheme {
  return (TERMINALOGUE_THEMES as readonly unknown[]).includes(value);
}

/** `light, dark, ubuntu, powershell and cmd`, for diagnostics. */
const THEME_LIST = TERMINALOGUE_THEMES.slice(0, -1)
  .join(', ')
  .concat(` and ${TERMINALOGUE_THEMES[TERMINALOGUE_THEMES.length - 1]!}`);

/** Matches `@name` optionally followed by an argument. */
const DIRECTIVE_RE = /^@([A-Za-z][A-Za-z0-9-]*)(?:[ \t]+(.*))?$/;

/**
 * Parses the source of a single `termlogue` fenced code block.
 *
 * The parser never throws: everything it cannot make sense of becomes a
 * {@link Diagnostic} carrying the 1-based line number, so a malformed block
 * degrades to an error message inside that block instead of breaking the host.
 */
export function parseTerminalogue(source: string): TerminalogueDocument {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const steps: Step[] = [];
  const diagnostics: Diagnostic[] = [];

  let title: string | undefined;
  let prompt = DEFAULT_PROMPT;
  let speedMs: number | undefined;
  let theme: TerminalogueTheme | undefined;
  /** Line of the `@theme` that won, so a duplicate can point back at it. */
  let themeLine = 0;

  const error = (line: number, message: string): void => {
    diagnostics.push({ line, message, severity: 'error' });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNumber = i + 1;

    // Escape: a leading backslash makes the rest of the line plain output,
    // so `\$ x` and `\@title` can be shown literally. `\\` yields a literal
    // backslash at the start of an output line.
    if (raw.startsWith('\\')) {
      const rest = raw.slice(1);
      const next = rest.charAt(0);
      steps.push(output(lineNumber, next === '$' || next === '@' || next === '\\' ? rest : raw));
      continue;
    }

    // Command: `$ command`, or a bare `$` for an empty command line.
    if (raw === '$' || raw.startsWith('$ ')) {
      steps.push(command(lineNumber, prompt, raw.slice(2).trimEnd(), speedMs));
      continue;
    }

    if (raw.startsWith('@')) {
      const match = DIRECTIVE_RE.exec(raw.trimEnd());
      if (!match) {
        error(
          lineNumber,
          `Malformed directive "${raw.trim()}". Directives look like "@name" or "@name value"; ` +
            'write "\\@" to start an output line with a literal "@".',
        );
        continue;
      }

      const name = match[1]!.toLowerCase();
      const argument = (match[2] ?? '').trim();

      switch (name) {
        case 'title': {
          if (argument === '') {
            error(lineNumber, '@title expects a title, e.g. "@title Installing Nginx".');
            break;
          }
          title = argument;
          break;
        }
        case 'prompt': {
          if (argument === '') {
            error(lineNumber, '@prompt expects a prompt string, e.g. "@prompt [root@server ~]#".');
            break;
          }
          prompt = argument;
          break;
        }
        case 'theme': {
          if (argument === '') {
            error(
              lineNumber,
              '@theme expects a theme name, e.g. "@theme ubuntu". ' +
                `Supported themes are ${THEME_LIST}.`,
            );
            break;
          }
          // Theme names are matched case insensitively but stored lowercase, so
          // `@theme PowerShell` and `@theme powershell` are the same theme.
          const requested = argument.toLowerCase();
          if (!isTerminalogueTheme(requested)) {
            error(
              lineNumber,
              `Unknown theme "${argument}". Supported themes are ${THEME_LIST}.`,
            );
            break;
          }
          if (theme !== undefined) {
            // A theme applies to the whole block, so there is nothing sensible
            // a second one could mean: Terminalogue does not switch theme
            // part-way through an animation.
            error(
              lineNumber,
              `Duplicate @theme directive. A block has one theme: "${theme}" from ` +
                `line ${themeLine} is kept and "${requested}" here is ignored.`,
            );
            break;
          }
          theme = requested;
          themeLine = lineNumber;
          break;
        }
        case 'wait': {
          const result = parseDuration(argument);
          if (!result.ok) {
            error(lineNumber, `@wait: ${result.message}.`);
            break;
          }
          steps.push(wait(lineNumber, result.ms));
          break;
        }
        case 'speed': {
          const result = parseDuration(argument);
          if (!result.ok) {
            error(lineNumber, `@speed: ${result.message}.`);
            break;
          }
          if (result.ms <= 0) {
            error(lineNumber, `@speed: typing speed must be greater than 0, got "${argument}".`);
            break;
          }
          speedMs = result.ms;
          break;
        }
        case 'type': {
          if (argument === '') {
            error(
              lineNumber,
              '@type expects the text to type, e.g. "@type yes"; ' +
                'a bare "@type" would type nothing at all.',
            );
            break;
          }
          steps.push(type(lineNumber, argument, speedMs));
          break;
        }
        case 'pause': {
          steps.push(pause(lineNumber, argument === '' ? undefined : argument));
          break;
        }
        case 'clear': {
          if (argument !== '') {
            error(lineNumber, `@clear takes no arguments, but got "${argument}".`);
            break;
          }
          steps.push(clear(lineNumber));
          break;
        }
        default: {
          error(
            lineNumber,
            `Unknown directive "@${match[1]!}". Supported directives are ` +
              '@title, @theme, @prompt, @type, @wait, @pause, @speed and @clear.',
          );
          break;
        }
      }
      continue;
    }

    // Output keeps the line verbatim, trailing whitespace included: `@type`
    // appends to the last line on screen, so `Proceed? [y/N] ` needs its
    // trailing space to survive in order to read as `Proceed? [y/N] y`.
    steps.push(output(lineNumber, raw));
  }

  return {
    ...(title === undefined ? {} : { title }),
    theme: theme ?? DEFAULT_THEME,
    steps: trimBlankEdges(steps),
    finalPrompt: prompt,
    diagnostics,
  };
}

/** Drops blank output lines at the very start and end of a block. */
function trimBlankEdges(steps: Step[]): Step[] {
  const isBlank = (step: Step | undefined): boolean =>
    step !== undefined && step.kind === 'output' && step.text.trim() === '';

  let start = 0;
  let end = steps.length;
  while (start < end && isBlank(steps[start])) start++;
  while (end > start && isBlank(steps[end - 1])) end--;
  return steps.slice(start, end);
}

function command(
  line: number,
  prompt: string,
  text: string,
  speedMs: number | undefined,
): CommandStep {
  return {
    kind: 'command',
    line,
    prompt,
    command: text,
    ...(speedMs === undefined ? {} : { speedMs }),
  };
}

function output(line: number, text: string): OutputStep {
  return { kind: 'output', line, text };
}

function type(line: number, text: string, speedMs: number | undefined): TypeStep {
  return {
    kind: 'type',
    line,
    text,
    ...(speedMs === undefined ? {} : { speedMs }),
  };
}

function pause(line: number, label: string | undefined): PauseStep {
  return { kind: 'pause', line, ...(label === undefined ? {} : { label }) };
}

function wait(line: number, ms: number): WaitStep {
  return { kind: 'wait', line, ms };
}

function clear(line: number): ClearStep {
  return { kind: 'clear', line };
}
