/** Result of parsing a duration literal such as `800ms` or `1.5s`. */
export type DurationResult =
  | { ok: true; ms: number }
  | { ok: false; message: string };

const DURATION_RE = /^([0-9]+(?:\.[0-9]+)?)\s*(ms|s)$/i;

/**
 * Parses a Terminalogue duration literal.
 *
 * Accepted forms are a non-negative decimal number followed by `ms` or `s`,
 * for example `500ms`, `0.5s`, `1.5 s`. A unit is always required so that
 * bare numbers cannot be silently misread as the wrong unit.
 */
export function parseDuration(raw: string): DurationResult {
  const text = raw.trim();
  if (text === '') {
    return {
      ok: false,
      message: 'missing duration (expected a number followed by "ms" or "s", e.g. 500ms or 1.5s)',
    };
  }

  const match = DURATION_RE.exec(text);
  if (!match) {
    return {
      ok: false,
      message: `invalid duration "${text}" (expected a number followed by "ms" or "s", e.g. 500ms or 1.5s)`,
    };
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `invalid duration "${text}" (not a finite number)` };
  }

  const ms = match[2]!.toLowerCase() === 's' ? value * 1000 : value;
  return { ok: true, ms };
}
