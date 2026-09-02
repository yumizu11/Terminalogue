/**
 * Playback speed chosen in the controls.
 *
 * The numbers divide every delay in the document; `instant` drops delays
 * altogether. `instant` skips time, not control flow: `@pause` still stops
 * playback and `@clear` still clears the screen.
 */
export type PlaybackSpeed = 1 | 2 | 4 | 'instant';

/** The speeds offered by the controls, in the order they are shown. */
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [1, 2, 4, 'instant'];

/** Writes text to the system clipboard. Rejects when copying is not possible. */
export type ClipboardWriter = (text: string) => void | Promise<void>;

/** Text used for control labels, exposed so hosts can localise it. */
export interface TerminalogueLabels {
  play: string;
  pause: string;
  restart: string;
  /** Accessible name of the speed button group. */
  speed: string;
  /** Speed button faces. They are the buttons' accessible names too. */
  speed1x: string;
  speed2x: string;
  speed4x: string;
  speedInstant: string;
  /** Accessible name of the Copy commands button. */
  copy: string;
  /** Accessible name shown briefly after a successful copy. */
  copied: string;
  /** Accessible name shown briefly after a failed copy. */
  copyFailed: string;
  /** Visible face of the Copy commands button. */
  copyText: string;
  /** Visible face shown briefly after a successful copy. */
  copiedText: string;
  /** Visible face shown briefly after a failed copy. */
  copyFailedText: string;
  /** Accessible name of the region holding the finished transcript. */
  transcript: string;
  /** Accessible name of the animated terminal screen. */
  terminal: string;
  /** Heading shown above parse diagnostics. */
  diagnostics: string;
  /** Fallback window title when the document has no `@title`. */
  untitled: string;
}

/** Options accepted by `mountTerminalogue`. */
export interface RendererOptions {
  /** Start playback without waiting for a user click. Default `true`. */
  autoplay?: boolean;
  /**
   * When autoplaying, wait until the block first scrolls into view
   * (via `IntersectionObserver`). Default `true`.
   */
  autoplayOnVisible?: boolean;
  /** Base per-character typing speed in ms. `@speed` overrides it. Default `55`. */
  typingSpeed?: number;
  /** Lower bound of the typing jitter multiplier. Default `0.65`. */
  jitterMin?: number;
  /** Upper bound of the typing jitter multiplier. Default `1.35`. */
  jitterMax?: number;
  /** Source of randomness for typing jitter. Injectable for tests. Default `Math.random`. */
  random?: () => number;
  /** Delay before each output line appears, in ms. Default `110`. */
  outputLineDelay?: number;
  /** Pause after a command is fully typed, before "Enter", in ms. Default `340`. */
  commandSubmitDelay?: number;
  /** Delay before the very first frame, in ms. Default `260`. */
  startDelay?: number;
  /** Playback speed the block starts at. Default `1`. */
  speed?: PlaybackSpeed;
  /** How long the "Copied" feedback stays on the button, in ms. Default `1500`. */
  copyFeedbackDelay?: number;
  /**
   * How the Copy commands button reaches the clipboard. Defaults to the
   * standard asynchronous Clipboard API, which both hosts provide; inject a
   * writer only where a host needs its own clipboard API.
   */
  clipboard?: ClipboardWriter;
  /**
   * Force reduced-motion behaviour. Defaults to the
   * `prefers-reduced-motion: reduce` media query.
   */
  reducedMotion?: boolean;
  /** Render the playback, speed and copy controls. Default `true`. */
  controls?: boolean;
  /** Override individual control labels. */
  labels?: Partial<TerminalogueLabels>;
}

/** Fully resolved options, with every default applied. */
export interface ResolvedOptions extends Required<Omit<RendererOptions, 'labels' | 'reducedMotion'>> {
  reducedMotion: boolean;
  labels: TerminalogueLabels;
}

export const DEFAULT_LABELS: TerminalogueLabels = {
  play: 'Play terminal animation',
  pause: 'Pause terminal animation',
  restart: 'Restart terminal animation',
  speed: 'Playback speed',
  speed1x: '1\u00d7',
  speed2x: '2\u00d7',
  speed4x: '4\u00d7',
  speedInstant: 'Instant',
  copy: 'Copy commands',
  copied: 'Commands copied',
  copyFailed: 'Could not copy commands',
  copyText: 'Copy',
  copiedText: 'Copied',
  copyFailedText: 'Failed',
  transcript: 'Terminal session transcript',
  terminal: 'Animated terminal session',
  diagnostics: 'Terminalogue could not parse this block',
  untitled: 'Terminal',
};

/** Reads `prefers-reduced-motion` defensively; environments without matchMedia say "no". */
export function prefersReducedMotion(view: Window | null | undefined): boolean {
  try {
    return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function resolveOptions(
  options: RendererOptions | undefined,
  view: Window | null | undefined,
): ResolvedOptions {
  const o = options ?? {};
  return {
    autoplay: o.autoplay ?? true,
    autoplayOnVisible: o.autoplayOnVisible ?? true,
    typingSpeed: positive(o.typingSpeed, 55),
    jitterMin: o.jitterMin ?? 0.65,
    jitterMax: o.jitterMax ?? 1.35,
    random: o.random ?? Math.random,
    outputLineDelay: nonNegative(o.outputLineDelay, 110),
    commandSubmitDelay: nonNegative(o.commandSubmitDelay, 340),
    startDelay: nonNegative(o.startDelay, 260),
    speed: isSpeed(o.speed) ? o.speed : 1,
    copyFeedbackDelay: nonNegative(o.copyFeedbackDelay, 1500),
    clipboard: o.clipboard ?? systemClipboard(view),
    reducedMotion: o.reducedMotion ?? prefersReducedMotion(view),
    controls: o.controls ?? true,
    labels: { ...DEFAULT_LABELS, ...o.labels },
  };
}

/** The label shown on the button for one speed. */
export function speedLabel(speed: PlaybackSpeed, labels: TerminalogueLabels): string {
  switch (speed) {
    case 1:
      return labels.speed1x;
    case 2:
      return labels.speed2x;
    case 4:
      return labels.speed4x;
    case 'instant':
      return labels.speedInstant;
  }
}

/**
 * The default clipboard writer: the standard asynchronous Clipboard API.
 *
 * It only ever writes a string. Nothing here reads the clipboard, and nothing
 * anywhere in Terminalogue runs what it copied.
 */
function systemClipboard(view: Window | null | undefined): ClipboardWriter {
  return async (text: string): Promise<void> => {
    const clipboard = view?.navigator?.clipboard;
    if (typeof clipboard?.writeText !== 'function') {
      throw new Error('Terminalogue: the Clipboard API is unavailable in this host.');
    }
    await clipboard.writeText(text);
  };
}

function isSpeed(value: unknown): value is PlaybackSpeed {
  return value === 1 || value === 2 || value === 4 || value === 'instant';
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}
