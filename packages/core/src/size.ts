import type { TerminalSize } from './types.js';

/**
 * The terminal viewport size `@size` can ask for, and the one place its limits
 * are written down.
 *
 * The bounds exist so that a document cannot ask a host for a viewport nobody
 * could read: a terminal narrower than 20 columns wraps every real command into
 * confetti, and one taller than 100 rows is taller than the Markdown preview,
 * the Obsidian pane and the Marp slide it would have to fit into. Parser,
 * renderer and diagnostics all read these constants; none of them carries a
 * number of its own.
 */
export const TERMINAL_SIZE_LIMITS = {
  minColumns: 20,
  maxColumns: 240,
  minRows: 5,
  maxRows: 100,
} as const;

/** Result of parsing a `@size` argument such as `80x24`. */
export type TerminalSizeResult = { ok: true; size: TerminalSize } | { ok: false; message: string };

/**
 * The whole grammar of a size: digits, a lowercase `x`, digits.
 *
 * Nothing else is accepted — no sign, no spaces, no separator of any other
 * kind, no trailing text — so `80x24; background:url(evil)` is a diagnostic
 * rather than something a renderer could ever be handed.
 */
const SIZE_RE = /^([0-9]+)x([0-9]+)$/;

const { minColumns, maxColumns, minRows, maxRows } = TERMINAL_SIZE_LIMITS;

/** `columns must be between 20 and 240, rows between 5 and 100`, for diagnostics. */
export const TERMINAL_SIZE_RANGE =
  `columns must be between ${minColumns} and ${maxColumns}, ` +
  `rows between ${minRows} and ${maxRows}`;

/** The expected shape, quoted the same way in every `@size` diagnostic. */
const EXPECTED = 'expected <columns>x<rows>, e.g. 80x24';

/**
 * Parses the argument of a `@size` directive.
 *
 * Both numbers are validated integers within {@link TERMINAL_SIZE_LIMITS} by
 * the time this returns `ok`, which is what lets the renderer put them into a
 * stylesheet: a size reaches CSS as two numbers, never as document text.
 */
export function parseTerminalSize(raw: string): TerminalSizeResult {
  const text = raw.trim();
  if (text === '') {
    return { ok: false, message: `missing size (${EXPECTED})` };
  }

  const match = SIZE_RE.exec(text);
  if (!match) {
    return { ok: false, message: `invalid size "${text}" (${EXPECTED})` };
  }

  const columns = Number(match[1]);
  const rows = Number(match[2]);
  if (!inRange(columns, minColumns, maxColumns) || !inRange(rows, minRows, maxRows)) {
    return {
      ok: false,
      message: `terminal size "${text}" is out of range (${TERMINAL_SIZE_RANGE})`,
    };
  }

  return { ok: true, size: { columns, rows } };
}

/**
 * Narrows an arbitrary value to a usable {@link TerminalSize}.
 *
 * Renderers use it as a second gate on documents that did not come straight
 * from {@link parseTerminalSize} — a payload decoded from a Marp placeholder,
 * say — so nothing but a pair of in-range integers can ever reach a stylesheet.
 */
export function isTerminalSize(value: unknown): value is TerminalSize {
  if (typeof value !== 'object' || value === null) return false;
  const { columns, rows } = value as Partial<TerminalSize>;
  return inRange(columns, minColumns, maxColumns) && inRange(rows, minRows, maxRows);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
