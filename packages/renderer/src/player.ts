import type { Frame } from './frames.js';
import type { Screen } from './screen.js';

/** Playback lifecycle states. */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'finished' | 'destroyed';

export interface PlayerHooks {
  onStateChange?: (state: PlaybackState) => void;
}

/**
 * Drives a frame list against a {@link Screen} using a single pending timeout.
 *
 * Pausing records how much of the current frame's delay is left, so resuming
 * continues mid-frame instead of restarting it. Exactly one timer can ever be
 * outstanding, which is what keeps repeated host re-renders from stacking.
 */
export class Player {
  private readonly frames: Frame[];
  private readonly screen: Screen;
  private readonly idlePrompt: string;
  private readonly hooks: PlayerHooks;

  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frameStartedAt = 0;
  private remaining: number | null = null;
  private currentState: PlaybackState = 'idle';

  constructor(frames: Frame[], screen: Screen, idlePrompt: string, hooks: PlayerHooks = {}) {
    this.frames = frames;
    this.screen = screen;
    this.idlePrompt = idlePrompt;
    this.hooks = hooks;
  }

  get state(): PlaybackState {
    return this.currentState;
  }

  play(): void {
    if (this.currentState === 'destroyed' || this.currentState === 'playing') return;
    if (this.currentState === 'finished') return;
    this.setState('playing');
    this.schedule();
  }

  pause(): void {
    if (this.currentState !== 'playing') return;
    const elapsed = Date.now() - this.frameStartedAt;
    this.remaining = Math.max(0, (this.remaining ?? 0) - elapsed);
    this.stopTimer();
    this.setState('paused');
  }

  restart(): void {
    if (this.currentState === 'destroyed') return;
    this.stopTimer();
    this.index = 0;
    this.remaining = null;
    this.screen.reset();
    this.setState('idle');
    this.play();
  }

  /** Applies every remaining frame at once and settles in the finished state. */
  seekToEnd(): void {
    if (this.currentState === 'destroyed') return;
    this.stopTimer();
    this.remaining = null;
    while (this.index < this.frames.length) {
      this.screen.apply(this.frames[this.index]!.op);
      this.index++;
    }
    this.finish();
  }

  destroy(): void {
    this.stopTimer();
    this.setState('destroyed');
  }

  private schedule(): void {
    if (this.index >= this.frames.length) {
      this.finish();
      return;
    }
    const frame = this.frames[this.index]!;
    const delay = this.remaining ?? frame.delay;
    this.remaining = delay;
    this.frameStartedAt = Date.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.remaining = null;
      this.screen.apply(frame.op);
      this.index++;
      if (this.currentState === 'playing') this.schedule();
    }, delay);
  }

  private finish(): void {
    if (this.currentState === 'finished') return;
    this.screen.showIdlePrompt(this.idlePrompt);
    this.setState('finished');
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(state: PlaybackState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.hooks.onStateChange?.(state);
  }
}
