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
      case 'clear':
        lines.length = 0;
        break;
      case 'wait':
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
