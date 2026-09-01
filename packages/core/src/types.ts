/**
 * The Terminalogue AST.
 *
 * A parsed document is a flat, already-resolved list of steps: stateful
 * directives such as `@prompt` and `@speed` are folded into the command steps
 * they affect, so consumers (renderers) never have to track parser state.
 */

/** Severity of a parse diagnostic. */
export type DiagnosticSeverity = 'error' | 'warning';

/** A problem found while parsing, anchored to a 1-based line of the block source. */
export interface Diagnostic {
  /** 1-based line number within the `termlogue` block source. */
  line: number;
  /** Human readable, single sentence description of the problem. */
  message: string;
  severity: DiagnosticSeverity;
}

/** A command the user "types" into the terminal. */
export interface CommandStep {
  kind: 'command';
  /** 1-based line number within the block source. */
  line: number;
  /** Prompt in effect for this command, e.g. `$` or `[root@rhel10 ~]#`. */
  prompt: string;
  /** The command text, without the leading `$ ` marker. */
  command: string;
  /**
   * Per-character typing speed in milliseconds, when an `@speed` directive was
   * in effect. `undefined` means "use the renderer default".
   */
  speedMs?: number;
}

/** A single line of terminal output. */
export interface OutputStep {
  kind: 'output';
  line: number;
  /** Raw text. Always rendered as plain text, never as markup. */
  text: string;
}

/** An explicit pause produced by `@wait`. */
export interface WaitStep {
  kind: 'wait';
  line: number;
  /** Duration in milliseconds. Always finite and >= 0. */
  ms: number;
}

/** Clears the terminal screen, produced by `@clear`. */
export interface ClearStep {
  kind: 'clear';
  line: number;
}

/** Any step in a Terminalogue document. */
export type Step = CommandStep | OutputStep | WaitStep | ClearStep;

/** The result of parsing one `termlogue` block. */
export interface TerminalogueDocument {
  /** Title shown in the terminal window title bar, from `@title`. */
  title?: string;
  /** The steps to play back, in source order. */
  steps: Step[];
  /**
   * The prompt in effect at the end of the document. Renderers use it for the
   * idle prompt line shown once playback finishes.
   */
  finalPrompt: string;
  /** Parse problems. A document with diagnostics is still playable. */
  diagnostics: Diagnostic[];
}
