/** Result of parsing a `@typo` probability such as `0.02`. */
export type TypoRateResult = { ok: true; rate: number } | { ok: false; message: string };

/** The range a typo probability has to fall in, inclusive at both ends. */
export const TYPO_RATE_RANGE = { min: 0, max: 1 } as const;

/** No `@typo` in effect: typing never goes wrong, exactly as it did before v0.6. */
export const DEFAULT_TYPO_RATE = 0;

/**
 * The whole grammar of a probability: digits, optionally a dot and more digits.
 *
 * Nothing else is accepted — no sign, no percent sign, no exponent, no trailing
 * text — so `2%`, `-0.1` and `2e-2` are diagnostics rather than a guess about
 * what the author meant. A probability is always a plain number from 0 to 1.
 */
const RATE_RE = /^[0-9]+(?:\.[0-9]+)?$/;

/** The expected shape, quoted the same way in every `@typo` diagnostic. */
const EXPECTED = 'expected a number between 0 and 1, e.g. 0.02 for a 2% chance';

/**
 * Parses the argument of a `@typo` directive.
 *
 * By the time this returns `ok` the rate is a finite number within
 * {@link TYPO_RATE_RANGE}, so a renderer can compare it against a random draw
 * without re-deriving anything from document text.
 */
export function parseTypoRate(raw: string): TypoRateResult {
  const text = raw.trim();
  if (text === '') {
    return { ok: false, message: `missing probability (${EXPECTED})` };
  }

  if (!RATE_RE.test(text)) {
    return { ok: false, message: `invalid probability "${text}" (${EXPECTED})` };
  }

  const rate = Number(text);
  if (!Number.isFinite(rate) || rate < TYPO_RATE_RANGE.min || rate > TYPO_RATE_RANGE.max) {
    return {
      ok: false,
      message:
        `typo probability "${text}" is out of range ` +
        `(must be between ${TYPO_RATE_RANGE.min} and ${TYPO_RATE_RANGE.max}, e.g. 0.02)`,
    };
  }

  return { ok: true, rate };
}

/**
 * Narrows an arbitrary value to a usable typo probability.
 *
 * Renderers use it as a second gate on documents that did not come straight
 * from {@link parseTypoRate} — a payload decoded from a Marp placeholder, say —
 * so nothing but a number in range can ever drive the typing engine.
 */
export function isTypoRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= TYPO_RATE_RANGE.min &&
    value <= TYPO_RATE_RANGE.max
  );
}
