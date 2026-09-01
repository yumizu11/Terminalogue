import { describe, expect, it } from 'vitest';
import { parseDuration } from '../src/duration.js';

describe('parseDuration', () => {
  it('parses milliseconds', () => {
    expect(parseDuration('800ms')).toEqual({ ok: true, ms: 800 });
    expect(parseDuration('0ms')).toEqual({ ok: true, ms: 0 });
  });

  it('parses seconds, including fractions', () => {
    expect(parseDuration('1.5s')).toEqual({ ok: true, ms: 1500 });
    expect(parseDuration('2s')).toEqual({ ok: true, ms: 2000 });
  });

  it('tolerates surrounding and internal whitespace', () => {
    expect(parseDuration('  500 ms ')).toEqual({ ok: true, ms: 500 });
  });

  it('is case insensitive about the unit', () => {
    expect(parseDuration('1.5S')).toEqual({ ok: true, ms: 1500 });
    expect(parseDuration('250MS')).toEqual({ ok: true, ms: 250 });
  });

  it('rejects durations without a unit', () => {
    const result = parseDuration('500');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: expect.stringContaining('500') });
  });

  it('rejects negative, empty and nonsense durations', () => {
    for (const input of ['', '-100ms', 'fast', '1.5sec', 'ms', '1..2s']) {
      expect(parseDuration(input).ok, input).toBe(false);
    }
  });
});
