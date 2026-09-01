import { toTranscript, type TerminalogueDocument } from '@terminalogue/core';
import { PAUSE_ICON, PLAY_ICON, RESTART_ICON, clearChildren, el, icon } from './dom.js';
import { buildFrames } from './frames.js';
import { resolveOptions, type RendererOptions } from './options.js';
import { Player, type PlaybackState } from './player.js';
import { Screen } from './screen.js';

export type { RendererOptions, TerminalogueLabels, ResolvedOptions } from './options.js';
export type { PlaybackState } from './player.js';
export type { Frame } from './frames.js';
export { buildFrames } from './frames.js';

/** Handle returned by {@link mountTerminalogue}. */
export interface TerminalogueInstance {
  /** Root element created by the renderer, appended to the container. */
  readonly element: HTMLElement;
  /** Current playback state. */
  readonly state: PlaybackState;
  /** Starts or resumes playback. Restarts when playback has finished. */
  play(): void;
  /** Pauses playback, keeping the position within the current frame. */
  pause(): void;
  /** Replays from the beginning. */
  restart(): void;
  /** Cancels every timer and observer and removes the rendered DOM. */
  destroy(): void;
}

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

  const screen = new Screen(doc);
  const title = document.title ?? opts.labels.untitled;

  root.appendChild(buildTitleBar(doc, title));
  const body = el(doc, 'div', 'tlg__body');
  body.appendChild(screen.root);
  root.appendChild(body);

  if (document.diagnostics.length > 0) {
    root.appendChild(buildDiagnostics(doc, document, opts.labels.diagnostics));
  }

  root.appendChild(buildTranscript(doc, document, `${opts.labels.transcript}: ${title}`));

  const frames = buildFrames(document, opts);
  const player = new Player(frames, screen, document.finalPrompt, {
    onStateChange: (state) => {
      root.setAttribute('data-state', state);
      syncToggle(state);
    },
  });

  let observer: IntersectionObserver | null = null;
  const stopObserving = (): void => {
    observer?.disconnect();
    observer = null;
  };

  let toggleButton: HTMLButtonElement | null = null;

  function syncToggle(state: PlaybackState): void {
    if (!toggleButton) return;
    const playing = state === 'playing';
    clearChildren(toggleButton);
    toggleButton.appendChild(icon(doc, 'tlg__icon', playing ? PAUSE_ICON : PLAY_ICON));
    toggleButton.setAttribute('aria-label', playing ? opts.labels.pause : opts.labels.play);
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
    root.querySelector('.tlg__titlebar')?.appendChild(controls);
    syncToggle(player.state);
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
    destroy() {
      stopObserving();
      player.destroy();
      root.remove();
    },
  };
}

function buildTitleBar(doc: Document, title: string): HTMLElement {
  const bar = el(doc, 'div', 'tlg__titlebar');
  const dots = el(doc, 'span', 'tlg__dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.appendChild(el(doc, 'span', 'tlg__dot'));
  bar.appendChild(dots);
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
