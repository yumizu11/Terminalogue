/** Text used for control labels, exposed so hosts can localise it. */
export interface TerminalogueLabels {
  play: string;
  pause: string;
  restart: string;
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
  /**
   * Force reduced-motion behaviour. Defaults to the
   * `prefers-reduced-motion: reduce` media query.
   */
  reducedMotion?: boolean;
  /** Render the Play/Pause and Restart controls. Default `true`. */
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
    reducedMotion: o.reducedMotion ?? prefersReducedMotion(view),
    controls: o.controls ?? true,
    labels: { ...DEFAULT_LABELS, ...o.labels },
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}
