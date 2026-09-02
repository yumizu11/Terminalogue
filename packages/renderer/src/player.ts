import type { Breakpoint, Frame } from './frames.js';
import type { PlaybackSpeed } from './options.js';
import type { Screen } from './screen.js';

/** Playback lifecycle states. */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'finished' | 'destroyed';

/** Why playback is currently paused. */
export type PauseReason = 'manual' | 'directive';

export interface PlayerHooks {
  onStateChange?: (state: PlaybackState) => void;
}

/**
 * Drives a frame list against a {@link Screen} using a single pending timeout.
 *
 * Pausing records how much of the current frame's delay is left, so resuming
 * continues mid-frame instead of restarting it. Exactly one timer can ever be
 * outstanding, which is what keeps repeated host re-renders from stacking.
 *
 * `@pause` and the Pause button share this one state machine: both end in the
 * `paused` state and differ only in {@link pauseReason}, so Play resumes from
 * wherever playback stopped either way.
 */
export class Player {
  private readonly frames: Frame[];
  private readonly screen: Screen;
  private readonly idlePrompt: string;
  private readonly hooks: PlayerHooks;

  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frameStartedAt = 0;
  /**
   * Time left on the current frame, in the document's own milliseconds rather
   * than scaled ones, so changing speed while paused takes effect on resume.
   */
  private remaining: number | null = null;
  /** Speed the pending timer was scheduled at, used to bill elapsed time back. */
  private scheduledAt: PlaybackSpeed = 1;
  private currentState: PlaybackState = 'idle';
  private currentSpeed: PlaybackSpeed = 1;
  private reason: PauseReason | null = null;
  private breakpoint: Breakpoint | null = null;

  constructor(frames: Frame[], screen: Screen, idlePrompt: string, hooks: PlayerHooks = {}) {
    this.frames = frames;
    this.screen = screen;
    this.idlePrompt = idlePrompt;
    this.hooks = hooks;
  }

  get state(): PlaybackState {
    return this.currentState;
  }

  get speed(): PlaybackSpeed {
    return this.currentSpeed;
  }

  /** Why playback is paused, or `null` when it is not paused. */
  get pauseReason(): PauseReason | null {
    return this.currentState === 'paused' ? this.reason : null;
  }

  /** The `@pause` that stopped playback, or `null` for any other state. */
  get pauseBreakpoint(): Breakpoint | null {
    return this.currentState === 'paused' && this.reason === 'directive' ? this.breakpoint : null;
  }

  play(): void {
    if (this.currentState === 'destroyed' || this.currentState === 'playing') return;
    if (this.currentState === 'finished') return;
    this.reason = null;
    this.breakpoint = null;
    this.setState('playing');
    this.advance();
  }

  pause(): void {
    if (this.currentState !== 'playing') return;
    this.suspend();
    this.stopAt('manual', null);
  }

  restart(): void {
    if (this.currentState === 'destroyed') return;
    this.stopTimer();
    this.index = 0;
    this.remaining = null;
    this.reason = null;
    this.breakpoint = null;
    this.screen.reset();
    this.setState('idle');
    this.play();
  }

  /**
   * Changes the playback speed. The reader keeps their choice across restarts,
   * and a change while playing or paused applies from the next frame onwards.
   */
  setSpeed(speed: PlaybackSpeed): void {
    if (this.currentState === 'destroyed' || this.currentSpeed === speed) return;
    const wasPlaying = this.currentState === 'playing';
    if (wasPlaying) this.suspend();
    this.currentSpeed = speed;
    if (wasPlaying) this.advance();
  }

  /**
   * Applies every remaining frame at once and settles in the finished state.
   *
   * Unlike the `instant` speed this ignores `@pause`: it exists for
   * `prefers-reduced-motion`, where the point is to show the whole finished
   * session rather than to play it quickly.
   */
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

  /** Runs the timeline from the current position, at the current speed. */
  private advance(): void {
    if (this.currentSpeed === 'instant') {
      this.runInstant();
      return;
    }
    // A breakpoint is a control event, not a delay, so it is consumed here
    // rather than scheduled: playback stops the moment the previous step
    // finishes, at every speed and with no timer of its own.
    const frame = this.frames[this.index];
    if (frame?.pause) {
      this.apply(frame);
      return;
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.index >= this.frames.length) {
      this.finish();
      return;
    }
    const frame = this.frames[this.index]!;
    const remaining = this.remaining ?? frame.delay;
    this.remaining = remaining;
    this.scheduledAt = this.currentSpeed;
    this.frameStartedAt = Date.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.remaining = null;
      this.apply(frame);
      if (this.currentState === 'playing') this.advance();
    }, this.scale(remaining));
  }

  /** Plays without delays, still honouring `@pause` and every screen op. */
  private runInstant(): void {
    this.stopTimer();
    this.remaining = null;
    while (this.index < this.frames.length) {
      const frame = this.frames[this.index]!;
      this.apply(frame);
      if (this.currentState !== 'playing') return;
    }
    this.finish();
  }

  /** Applies one frame, advances past it and stops when it is a breakpoint. */
  private apply(frame: Frame): void {
    this.screen.apply(frame.op);
    this.index++;
    if (frame.pause) this.stopAt('directive', frame.pause);
  }

  /** Cancels the pending timer, keeping the unspent part of the current frame. */
  private suspend(): void {
    const elapsed = Date.now() - this.frameStartedAt;
    // Bill the elapsed wall-clock time back at the speed it was scheduled at,
    // so `remaining` always stays in the document's own milliseconds.
    const spent =
      this.scheduledAt === 'instant' ? Number.POSITIVE_INFINITY : elapsed * this.scheduledAt;
    this.remaining = Math.max(0, (this.remaining ?? 0) - spent);
    this.stopTimer();
  }

  private stopAt(reason: PauseReason, breakpoint: Breakpoint | null): void {
    this.reason = reason;
    this.breakpoint = breakpoint;
    this.setState('paused');
  }

  /** Converts a document delay into a wall-clock one at the current speed. */
  private scale(delay: number): number {
    if (this.currentSpeed === 'instant') return 0;
    return delay / this.currentSpeed;
  }

  private finish(): void {
    if (this.currentState === 'finished') return;
    this.reason = null;
    this.breakpoint = null;
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
