import type { TerminalogueDocument } from './types.js';

/**
 * Renders the document as the plain-text transcript a reader would end up with
 * after the animation has played. Used by renderers to expose the finished
 * session to assistive technology without announcing it character by character.
 */
export function toTranscript(document: TerminalogueDocument): string {
  const lines: string[] = [];

  for (const step of document.steps) {
    switch (step.kind) {
      case 'command':
        lines.push(joinPrompt(step.prompt, step.command));
        break;
      case 'output':
        lines.push(step.text);
        break;
      case 'type': {
        // `@type` answers a prompt that is already on screen, so it extends the
        // last line rather than starting one of its own.
        const last = lines.length - 1;
        if (last < 0) lines.push(step.text);
        else lines[last] = `${lines[last]!}${step.text}`;
        break;
      }
      case 'clear':
        lines.length = 0;
        break;
      case 'wait':
      case 'pause':
        break;
    }
  }

  return lines.join('\n');
}

/** Joins a prompt and a command with a single separating space. */
export function joinPrompt(prompt: string, command: string): string {
  if (prompt === '') return command;
  return `${prompt} ${command}`;
}

/**
 * The shell commands a block contains, in source order, ready for the clipboard.
 *
 * Only `$ command` lines are commands. Prompts, terminal output, `@type` input
 * and every other directive are demonstration material, not something a reader
 * would paste into their own shell, so none of it is included. Empty command
 * lines (a bare `$`) are dropped rather than copied as blank lines.
 */
export function toCommands(document: TerminalogueDocument): string[] {
  const commands: string[] = [];
  for (const step of document.steps) {
    if (step.kind === 'command' && step.command !== '') commands.push(step.command);
  }
  return commands;
}
