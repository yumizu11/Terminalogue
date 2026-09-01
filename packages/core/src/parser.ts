import { parseDuration } from './duration.js';
import type {
  ClearStep,
  CommandStep,
  Diagnostic,
  OutputStep,
  Step,
  TerminalogueDocument,
  WaitStep,
} from './types.js';

/** Prompt used until an `@prompt` directive says otherwise. */
export const DEFAULT_PROMPT = '$';

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
              '@title, @prompt, @wait, @speed and @clear.',
          );
          break;
        }
      }
      continue;
    }

    steps.push(output(lineNumber, raw));
  }

  return {
    ...(title === undefined ? {} : { title }),
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

function wait(line: number, ms: number): WaitStep {
  return { kind: 'wait', line, ms };
}

function clear(line: number): ClearStep {
  return { kind: 'clear', line };
}
