import { isTypoRate, type TerminalogueDocument } from '@terminalogue/core';
import { planTypo } from './keyboard.js';
import type { ResolvedOptions } from './options.js';
import type { ScreenOp } from './screen.js';

/** Metadata carried by a `@pause` breakpoint. */
export interface Breakpoint {
  /** Optional note from `@pause <label>`, kept for the controls UI. */
  label?: string;
}

/** One scheduled screen mutation: wait `delay` ms, then apply `op`. */
export interface Frame {
  delay: number;
  op: ScreenOp;
  /**
   * Set by `@pause`. Playback stops once this frame has been applied and waits
   * for the reader. A breakpoint is a control event, not a duration, so it is
   * never scaled by the playback speed.
   */
  pause?: Breakpoint;
  /**
   * Marks the two frames one simulated typo is made of: `insert` puts the wrong
   * character on screen and `erase` backspaces it away again.
   *
   * A typo is a typing animation and nothing more, so a mode that shows no
   * typing — Instant, or `prefers-reduced-motion` — skips the pair and types
   * only the correct character. They are marked separately because the pair has
   * to be skipped as a pair: an `erase` whose `insert` has already been applied
   * must still run, or the wrong character would be left on screen.
   */
  typo?: 'insert' | 'erase';
}

/** Characters that get a slightly longer pause, the way real typing does. */
const SLOW_CHARS = new Set(['-', '_', '/', '.', ':', '=', ',', ';', '|']);

/**
 * The two extra beats a simulated typo adds, as multiples of the base typing
 * delay: how long the wrong character sits there before the mistake is noticed,
 * and how long the finger hesitates after the Backspace.
 *
 * They are multiples rather than milliseconds so that a typo keeps pace with
 * the typing around it. `@speed` scales them, the playback-speed multiplier
 * scales them again when the frame is scheduled, and the jitter that makes
 * ordinary typing look human applies to them too. At the default 55ms that
 * leaves the wrong character on screen for about 100ms and puts the correction
 * about 75ms after it, which is roughly what a real hand does.
 */
const TYPO_NOTICE_WEIGHT = 1.8;
const TYPO_RECOVER_WEIGHT = 1.4;

/**
 * Turns a parsed document into a flat, fully timed frame list.
 *
 * Jitter is drawn once, at build time, from the injected random function. That
 * keeps playback deterministic across pause/resume and restart, and makes the
 * timeline testable by passing a fixed random source.
 *
 * Delays here are the document's own timings. The playback speed multiplier is
 * applied by the player when a frame is scheduled, so the reader can change
 * speed mid-animation without the timeline being rebuilt.
 */
export function buildFrames(document: TerminalogueDocument, options: ResolvedOptions): Frame[] {
  const frames: Frame[] = [];
  const push = (delay: number, op: ScreenOp, typo?: Frame['typo']): void => {
    frames.push({
      delay: Math.max(0, Math.round(delay)),
      op,
      ...(typo === undefined ? {} : { typo }),
    });
  };

  /** Types `text` one character at a time, the one typing engine both `$` and `@type` use. */
  const typeOut = (text: string, speedMs: number | undefined, rate: number): void => {
    const speed = speedMs ?? options.typingSpeed;
    for (const char of Array.from(text)) {
      // A slip strikes the neighbouring key, notices, backspaces it away and
      // types the intended character after all — so the run of frames ends on
      // `char` either way and the finished screen can only hold correct text.
      const wrong = planTypo(char, rate, options.random);
      if (wrong !== null) {
        push(charDelay(char, speed, options), { type: 'type', char: wrong }, 'insert');
        push(weightedDelay(speed, TYPO_NOTICE_WEIGHT, options), { type: 'backspace' }, 'erase');
        push(weightedDelay(speed, TYPO_RECOVER_WEIGHT, options), { type: 'type', char });
        continue;
      }
      push(charDelay(char, speed, options), { type: 'type', char });
    }
    push(options.commandSubmitDelay, { type: 'submit' });
  };

  for (const step of document.steps) {
    switch (step.kind) {
      case 'command': {
        push(options.outputLineDelay, { type: 'command-start', prompt: step.prompt });
        typeOut(step.command, step.speedMs, typoRate(step.typoRate));
        break;
      }
      case 'type': {
        push(options.outputLineDelay, { type: 'input-start' });
        typeOut(step.text, step.speedMs, typoRate(step.typoRate));
        break;
      }
      case 'output':
        push(options.outputLineDelay, { type: 'output', text: step.text });
        break;
      case 'wait':
        push(step.ms, { type: 'noop' });
        break;
      case 'clear':
        push(options.outputLineDelay, { type: 'clear' });
        break;
      case 'pause':
        frames.push({
          delay: 0,
          op: { type: 'noop' },
          pause: step.label === undefined ? {} : { label: step.label },
        });
        break;
    }
  }

  // A block that opens with `@pause` should stop straight away, so the opening
  // delay belongs to the first frame that actually shows something.
  const first = frames.find((frame) => frame.pause === undefined);
  if (first) first.delay += Math.round(options.startDelay);

  return frames;
}

/**
 * The typo probability a step plays at.
 *
 * Re-checked rather than trusted, the same way the renderer re-checks a theme
 * and a size: a document can arrive from a Marp placeholder that something else
 * wrote, and a rate outside 0..1 would otherwise mistype every character or
 * none of them. Anything unusable means no typos, which is what a document
 * without `@typo` gets.
 */
function typoRate(rate: number | undefined): number {
  return isTypoRate(rate) ? rate : 0;
}

function charDelay(char: string, speed: number, options: ResolvedOptions): number {
  const weight = char === ' ' ? 1.8 : SLOW_CHARS.has(char) ? 1.25 : 1;
  return weightedDelay(speed, weight, options);
}

/** One typing delay: the base speed, a weight for the keystroke, and jitter. */
function weightedDelay(speed: number, weight: number, options: ResolvedOptions): number {
  const { jitterMin, jitterMax, random } = options;
  const span = Math.max(0, jitterMax - jitterMin);
  const jitter = jitterMin + clamp01(random()) * span;
  return speed * jitter * weight;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
