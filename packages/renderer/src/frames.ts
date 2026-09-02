import type { TerminalogueDocument } from '@terminalogue/core';
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
}

/** Characters that get a slightly longer pause, the way real typing does. */
const SLOW_CHARS = new Set(['-', '_', '/', '.', ':', '=', ',', ';', '|']);

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
  const push = (delay: number, op: ScreenOp): void => {
    frames.push({ delay: Math.max(0, Math.round(delay)), op });
  };

  /** Types `text` one character at a time, the one typing engine both `$` and `@type` use. */
  const typeOut = (text: string, speedMs: number | undefined): void => {
    const speed = speedMs ?? options.typingSpeed;
    for (const char of Array.from(text)) {
      push(charDelay(char, speed, options), { type: 'type', char });
    }
    push(options.commandSubmitDelay, { type: 'submit' });
  };

  for (const step of document.steps) {
    switch (step.kind) {
      case 'command': {
        push(options.outputLineDelay, { type: 'command-start', prompt: step.prompt });
        typeOut(step.command, step.speedMs);
        break;
      }
      case 'type': {
        push(options.outputLineDelay, { type: 'input-start' });
        typeOut(step.text, step.speedMs);
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

function charDelay(char: string, speed: number, options: ResolvedOptions): number {
  const { jitterMin, jitterMax, random } = options;
  const span = Math.max(0, jitterMax - jitterMin);
  const jitter = jitterMin + clamp01(random()) * span;
  const weight = char === ' ' ? 1.8 : SLOW_CHARS.has(char) ? 1.25 : 1;
  return speed * jitter * weight;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
