/**
 * The Terminalogue AST.
 *
 * A parsed document is a flat, already-resolved list of steps: stateful
 * directives such as `@prompt` and `@speed` are folded into the command steps
 * they affect, so consumers (renderers) never have to track parser state.
 */

/**
 * The visual themes a block can ask for with `@theme`.
 *
 * A theme is a presentation concern and nothing else: it changes colours, not
 * the prompt, the commands, the timings or any other playback behaviour. The
 * list is a closed allowlist, so a document can never name a colour, a URL or a
 * stylesheet of its own.
 */
export type TerminalogueTheme = 'light' | 'dark' | 'ubuntu' | 'powershell' | 'cmd';

/**
 * A fixed terminal viewport, in character cells, from `@size <columns>x<rows>`.
 *
 * This is block-level presentation metadata rather than a playback event: it
 * describes the terminal body — the area the output scrolls in — and never the
 * title bar or the controls around it. Both numbers are integers validated
 * against the limits in `size.ts`, so a renderer can use them as numbers
 * without re-deriving anything from document text.
 */
export interface TerminalSize {
  /** Width of the terminal body in character columns. */
  columns: number;
  /** Height of the terminal body in text rows. */
  rows: number;
}

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

/**
 * Text the user "types" into a prompt that is already on screen, from `@type`.
 *
 * Unlike a command this starts no new line: the characters are appended to
 * whatever the terminal is currently showing last, which is how an answer to an
 * interactive prompt such as `Proceed? [y/N] ` behaves.
 */
export interface TypeStep {
  kind: 'type';
  line: number;
  /** The text to type, without the `@type ` marker. Never empty. */
  text: string;
  /**
   * Per-character typing speed in milliseconds, when an `@speed` directive was
   * in effect. `undefined` means "use the renderer default".
   */
  speedMs?: number;
}

/**
 * An explicit playback breakpoint produced by `@pause`.
 *
 * This is a control event rather than a duration: playback stops here and waits
 * for the reader, so playback speed does not affect it.
 */
export interface PauseStep {
  kind: 'pause';
  line: number;
  /** Optional human readable note, e.g. `@pause Dependencies resolved`. */
  label?: string;
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
export type Step = CommandStep | OutputStep | TypeStep | WaitStep | ClearStep | PauseStep;

/** The result of parsing one `termlogue` block. */
export interface TerminalogueDocument {
  /** Title shown in the terminal window title bar, from `@title`. */
  title?: string;
  /**
   * Visual theme of the whole block, from `@theme`. Always set: a block without
   * a `@theme` directive gets the default `dark` theme, which is what every
   * Terminalogue block looked like before themes existed.
   */
  theme: TerminalogueTheme;
  /**
   * Fixed terminal viewport from `@size`, in character cells.
   *
   * Absent means automatic sizing: the terminal grows with its content, which
   * is what every block did before `@size` existed.
   */
  size?: TerminalSize;
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
