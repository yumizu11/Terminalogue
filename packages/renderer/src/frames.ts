import type { TerminalogueDocument } from '@terminalogue/core';
import type { ResolvedOptions } from './options.js';
import type { ScreenOp } from './screen.js';

/** One scheduled screen mutation: wait `delay` ms, then apply `op`. */
export interface Frame {
  delay: number;
  op: ScreenOp;
}

/** Characters that get a slightly longer pause, the way real typing does. */
const SLOW_CHARS = new Set(['-', '_', '/', '.', ':', '=', ',', ';', '|']);

/**
 * Turns a parsed document into a flat, fully timed frame list.
 *
 * Jitter is drawn once, at build time, from the injected random function. That
 * keeps playback deterministic across pause/resume and restart, and makes the
 * timeline testable by passing a fixed random source.
 */
export function buildFrames(document: TerminalogueDocument, options: ResolvedOptions): Frame[] {
  const frames: Frame[] = [];
  const push = (delay: number, op: ScreenOp): void => {
    frames.push({ delay: Math.max(0, Math.round(delay)), op });
  };

  for (const step of document.steps) {
    switch (step.kind) {
      case 'command': {
        push(options.outputLineDelay, { type: 'command-start', prompt: step.prompt });
        const speed = step.speedMs ?? options.typingSpeed;
        for (const char of Array.from(step.command)) {
          push(charDelay(char, speed, options), { type: 'type', char });
        }
        push(options.commandSubmitDelay, { type: 'command-submit' });
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
    }
  }

  const first = frames[0];
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
