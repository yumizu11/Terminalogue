import {
  DEFAULT_THEME,
  isTerminalSize,
  isTerminalogueTheme,
  toCommands,
  toTranscript,
  type TerminalogueDocument,
} from '@terminalogue/core';
import {
  CHECK_ICON,
  COPY_ICON,
  PAUSE_ICON,
  PLAY_ICON,
  RESTART_ICON,
  clearChildren,
  el,
  icon,
} from './dom.js';
import { buildFrames } from './frames.js';
import {
  PLAYBACK_SPEEDS,
  resolveOptions,
  speedLabel,
  type PlaybackSpeed,
  type RendererOptions,
} from './options.js';
import { Player, type PauseReason, type PlaybackState } from './player.js';
import { Screen } from './screen.js';

export type {
  ClipboardWriter,
  PlaybackSpeed,
  RendererOptions,
  ResolvedOptions,
  TerminalogueLabels,
} from './options.js';
export { PLAYBACK_SPEEDS, prefersReducedMotion } from './options.js';
export type { PauseReason, PlaybackState } from './player.js';
export type { Breakpoint, Frame } from './frames.js';
export { buildFrames } from './frames.js';

/** Handle returned by {@link mountTerminalogue}. */
export interface TerminalogueInstance {
  /** Root element created by the renderer, appended to the container. */
  readonly element: HTMLElement;
  /** Current playback state. */
  readonly state: PlaybackState;
  /** Why playback is paused, or `null` when it is not paused. */
  readonly pauseReason: PauseReason | null;
  /** Current playback speed. */
  readonly speed: PlaybackSpeed;
  /** Starts or resumes playback. Restarts when playback has finished. */
  play(): void;
  /** Pauses playback, keeping the position within the current frame. */
  pause(): void;
  /** Replays from the beginning, keeping the chosen playback speed. */
  restart(): void;
  /** Changes the playback speed. Takes effect from the next frame onwards. */
  setSpeed(speed: PlaybackSpeed): void;
  /**
   * Copies the block's `$ command` lines to the clipboard, exactly as the Copy
   * commands button does. Resolves to whether the clipboard accepted them.
   */
  copyCommands(): Promise<boolean>;
  /** Cancels every timer and observer and removes the rendered DOM. */
  destroy(): void;
}

/** Which face the Copy commands button is currently showing. */
type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Renders a parsed Terminalogue document into `container` and returns a handle
 * controlling its playback.
 *
 * This is the single rendering path shared by every host. Nothing here touches
 * a VS Code or Obsidian API, and no block content is ever treated as markup.
 */
export function mountTerminalogue(
  container: HTMLElement,
  document: TerminalogueDocument,
  options?: RendererOptions,
): TerminalogueInstance {
  const doc = container.ownerDocument;
  const view = doc.defaultView;
  const opts = resolveOptions(options, view);

  const root = el(doc, 'div', 'tlg');
  root.setAttribute('data-state', 'idle');
  // The one place a theme is applied. Everything a theme changes is a CSS
  // custom property keyed off this attribute, so no host adapter, and no other
  // part of the renderer, has to know which themes exist. The name is
  // re-checked against the allowlist here because `data-theme` is the only
  // value a document contributes to a selector: anything unrecognised falls
  // back to the default theme rather than reaching the stylesheet.
  const theme = isTerminalogueTheme(document.theme) ? document.theme : DEFAULT_THEME;
  root.setAttribute('data-theme', theme);

  // `@size` fixes the terminal viewport before anything is played, so a block
  // occupies its final area from the first paint: nothing below it moves as
  // output arrives, and `@clear`, Pause, Restart and Instant all leave the area
  // exactly as it is. Without a `@size` nothing is written here at all and the
  // block keeps the automatic sizing every pre-0.5 block had.
  //
  // The two numbers are the only thing a document ever contributes to a style:
  // they are re-checked against the same limits the parser used, and reach CSS
  // as numbers in custom properties. The stylesheet does the arithmetic, so no
  // document text can appear in a declaration.
  const size = isTerminalSize(document.size) ? document.size : null;
  if (size) {
    root.setAttribute('data-size', 'fixed');
    root.style.setProperty('--tlg-columns', String(size.columns));
    root.style.setProperty('--tlg-rows', String(size.rows));
  }

  const screen = new Screen(doc);
  const title = document.title ?? opts.labels.untitled;
  const commands = toCommands(document);

  const titlebar = buildTitleBar(doc, title);
  root.appendChild(titlebar);
  const body = el(doc, 'div', 'tlg__body');
  body.appendChild(screen.root);
  root.appendChild(body);

  if (document.diagnostics.length > 0) {
    root.appendChild(buildDiagnostics(doc, document, opts.labels.diagnostics));
  }

  root.appendChild(buildTranscript(doc, document, `${opts.labels.transcript}: ${title}`));

  // Shown while `@pause` holds playback, so a labelled breakpoint says why.
  const breakpointBadge = el(doc, 'span', 'tlg__breakpoint');
  breakpointBadge.setAttribute('role', 'status');
  titlebar.appendChild(breakpointBadge);

  const frames = buildFrames(document, opts);
  const player = new Player(frames, screen, document.finalPrompt, {
    onStateChange: (state) => {
      root.setAttribute('data-state', state);
      const reason = player.pauseReason;
      if (reason === null) root.removeAttribute('data-pause-reason');
      else root.setAttribute('data-pause-reason', reason);
      breakpointBadge.textContent = player.pauseBreakpoint?.label ?? '';
      syncToggle(state);
    },
  });
  player.setSpeed(opts.speed);

  let destroyed = false;

  let observer: IntersectionObserver | null = null;
  const stopObserving = (): void => {
    observer?.disconnect();
    observer = null;
  };

  let toggleButton: HTMLButtonElement | null = null;
  let copyButton: HTMLButtonElement | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  const speedButtons = new Map<PlaybackSpeed, HTMLButtonElement>();

  function syncToggle(state: PlaybackState): void {
    if (!toggleButton) return;
    const playing = state === 'playing';
    clearChildren(toggleButton);
    toggleButton.appendChild(icon(doc, 'tlg__icon', playing ? PAUSE_ICON : PLAY_ICON));
    toggleButton.setAttribute('aria-label', playing ? opts.labels.pause : opts.labels.play);
  }

  function syncSpeed(): void {
    for (const [speed, button] of speedButtons) {
      button.setAttribute('aria-pressed', String(speed === player.speed));
    }
  }

  function showCopyState(state: CopyState): void {
    if (!copyButton) return;
    const faces: Record<CopyState, { label: string; text: string }> = {
      idle: { label: opts.labels.copy, text: opts.labels.copyText },
      copied: { label: opts.labels.copied, text: opts.labels.copiedText },
      failed: { label: opts.labels.copyFailed, text: opts.labels.copyFailedText },
    };
    const face = faces[state];
    clearChildren(copyButton);
    copyButton.appendChild(icon(doc, 'tlg__icon', state === 'copied' ? CHECK_ICON : COPY_ICON));
    copyButton.appendChild(el(doc, 'span', 'tlg__button-text', face.text));
    copyButton.setAttribute('aria-label', face.label);
    copyButton.setAttribute('data-copy', state);
  }

  function stopCopyTimer(): void {
    if (copyTimer !== null) {
      clearTimeout(copyTimer);
      copyTimer = null;
    }
  }

  /** Flashes the copy result, then returns the button to its resting face. */
  function flashCopyState(state: CopyState): void {
    if (destroyed) return;
    stopCopyTimer();
    showCopyState(state);
    copyTimer = setTimeout(() => {
      copyTimer = null;
      showCopyState('idle');
    }, opts.copyFeedbackDelay);
  }

  /**
   * Copies the `$ command` lines and nothing else. Terminalogue only ever puts
   * a string on the clipboard; it never runs a command.
   */
  function copyCommands(): Promise<boolean> {
    if (destroyed || commands.length === 0) return Promise.resolve(false);
    return Promise.resolve()
      .then(() => opts.clipboard(commands.join('\n')))
      .then(
        () => {
          flashCopyState('copied');
          return true;
        },
        () => {
          flashCopyState('failed');
          return false;
        },
      );
  }

  function buildSpeedGroup(): HTMLElement {
    const group = el(doc, 'div', 'tlg__group');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', opts.labels.speed);

    for (const speed of PLAYBACK_SPEEDS) {
      const button = el(doc, 'button', 'tlg__button tlg__speed', speedLabel(speed, opts.labels));
      button.type = 'button';
      // A toggle group: the pressed button is the speed currently in effect.
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        // Choosing a speed is not a playback command, so a block still waiting
        // to scroll into view autoplays later at the newly chosen speed.
        player.setSpeed(speed);
        syncSpeed();
      });
      speedButtons.set(speed, button);
      group.appendChild(button);
    }
    return group;
  }

  function buildCopyButton(): HTMLElement {
    const button = el(doc, 'button', 'tlg__button tlg__copy');
    button.type = 'button';
    button.addEventListener('click', () => {
      void copyCommands();
    });
    copyButton = button;
    showCopyState('idle');
    // Nothing to copy is a disabled button rather than a silent no-op.
    button.disabled = commands.length === 0;
    return button;
  }

  if (opts.controls) {
    const controls = el(doc, 'div', 'tlg__controls');

    toggleButton = el(doc, 'button', 'tlg__button');
    toggleButton.type = 'button';
    toggleButton.addEventListener('click', () => {
      stopObserving();
      if (player.state === 'playing') player.pause();
      else if (player.state === 'finished') player.restart();
      else player.play();
    });

    const restartButton = el(doc, 'button', 'tlg__button');
    restartButton.type = 'button';
    restartButton.setAttribute('aria-label', opts.labels.restart);
    restartButton.appendChild(icon(doc, 'tlg__icon', RESTART_ICON));
    restartButton.addEventListener('click', () => {
      stopObserving();
      player.restart();
    });

    controls.appendChild(toggleButton);
    controls.appendChild(restartButton);
    controls.appendChild(buildSpeedGroup());
    controls.appendChild(buildCopyButton());
    titlebar.appendChild(controls);

    syncToggle(player.state);
    syncSpeed();
  }

  container.appendChild(root);

  if (opts.reducedMotion) {
    // Honour prefers-reduced-motion: no autoplay, show the finished transcript.
    player.seekToEnd();
  } else if (opts.autoplay) {
    const Observer = view?.IntersectionObserver;
    if (opts.autoplayOnVisible && typeof Observer === 'function') {
      observer = new Observer((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          // Autoplay happens at most once, so scrolling away and back never
          // restarts a block on its own.
          stopObserving();
          player.play();
        }
      }, { threshold: 0.2 });
      observer.observe(root);
    } else {
      player.play();
    }
  }

  return {
    element: root,
    get state() {
      return player.state;
    },
    get pauseReason() {
      return player.pauseReason;
    },
    get speed() {
      return player.speed;
    },
    play() {
      stopObserving();
      if (player.state === 'finished') player.restart();
      else player.play();
    },
    pause() {
      stopObserving();
      player.pause();
    },
    restart() {
      stopObserving();
      player.restart();
    },
    setSpeed(speed: PlaybackSpeed) {
      player.setSpeed(speed);
      syncSpeed();
    },
    copyCommands,
    destroy() {
      destroyed = true;
      stopObserving();
      stopCopyTimer();
      player.destroy();
      root.remove();
    },
  };
}

/**
 * The window decoration: three dots, and the console mark the Windows themes
 * use instead of them.
 *
 * Both are built for every theme and both are decorative, so the stylesheet
 * alone decides which one a theme shows. That keeps the DOM identical across
 * themes — no host, and no part of the renderer, knows a theme name — and
 * keeps the mark itself out of the document: its glyph comes from CSS
 * `content`, never from block content.
 */
function buildTitleBar(doc: Document, title: string): HTMLElement {
  const bar = el(doc, 'div', 'tlg__titlebar');

  const dots = el(doc, 'span', 'tlg__dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.appendChild(el(doc, 'span', 'tlg__dot'));
  bar.appendChild(dots);

  const mark = el(doc, 'span', 'tlg__mark');
  mark.setAttribute('aria-hidden', 'true');
  bar.appendChild(mark);

  bar.appendChild(el(doc, 'span', 'tlg__title', title));
  return bar;
}

function buildDiagnostics(
  doc: Document,
  document: TerminalogueDocument,
  label: string,
): HTMLElement {
  const box = el(doc, 'div', 'tlg__diagnostics');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', label);
  box.appendChild(el(doc, 'p', 'tlg__diagnostics-title', label));
  const list = el(doc, 'ul', 'tlg__diagnostics-list');
  for (const diagnostic of document.diagnostics) {
    list.appendChild(
      el(doc, 'li', 'tlg__diagnostic', `Line ${diagnostic.line}: ${diagnostic.message}`),
    );
  }
  box.appendChild(list);
  return box;
}

function buildTranscript(
  doc: Document,
  document: TerminalogueDocument,
  label: string,
): HTMLElement {
  const wrapper = el(doc, 'div', 'tlg__transcript tlg__sr-only');
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', label);
  wrapper.appendChild(el(doc, 'pre', 'tlg__transcript-text', toTranscript(document)));
  return wrapper;
}
