/**
 * Deciding when a Terminalogue block in a Marp presentation may start playing.
 *
 * A Marp deck is not a scrolling document: with the default `bespoke` template
 * every slide is in the DOM at once, stacked in the same place, and the one on
 * screen is marked with a class. An `IntersectionObserver` alone would report
 * all of them as visible and every block in the deck would play at once, so the
 * slide's own state is what this module watches — falling back to intersection
 * for the `bare` template, where the slides really do lay out down the page.
 *
 * Either way the callback fires at most once. Coming back to a slide does not
 * replay a block that has already played; only Restart does, exactly as in
 * VS Code and Obsidian.
 */

/** Class bespoke puts on every slide. */
export const SLIDE_CLASS = 'bespoke-marp-slide';

/** Class bespoke puts on the slide currently on screen. */
export const ACTIVE_SLIDE_CLASS = 'bespoke-marp-active';

export interface PresentationWatchOptions {
  /**
   * Schedules the deferred part of the setup: watching intersection is only
   * meaningful once the deck's own script has had a chance to turn the page
   * into slides. Injectable so tests do not depend on frame timing.
   */
  defer?: (callback: () => void) => void;
}

/**
 * Calls `onPresented` the first time `element` is actually being shown to a
 * reader. Returns a function that cancels the watch.
 */
export function onFirstPresented(
  element: Element,
  view: Window & typeof globalThis,
  onPresented: () => void,
  options: PresentationWatchOptions = {},
): () => void {
  let done = false;
  let intersecting = false;
  let mutations: MutationObserver | null = null;
  let intersections: IntersectionObserver | null = null;

  const dispose = (): void => {
    mutations?.disconnect();
    mutations = null;
    intersections?.disconnect();
    intersections = null;
  };

  const presented = (): boolean => {
    // A slide ancestor means a real presentation: the deck, not the viewport,
    // decides what the reader can see.
    const slide = element.closest(`.${SLIDE_CLASS}`);
    if (slide) return slide.classList.contains(ACTIVE_SLIDE_CLASS);
    return intersecting;
  };

  const check = (): void => {
    if (done || !presented()) return;
    done = true;
    dispose();
    onPresented();
  };

  const Mutations = view.MutationObserver;
  if (typeof Mutations === 'function') {
    // Slides are marked active by a class, so a class change anywhere is the
    // signal that the reader has moved to another slide.
    const observer = new Mutations(check);
    observer.observe(view.document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    mutations = observer;
  }

  const armIntersections = (): void => {
    if (done) return;
    const Intersections = view.IntersectionObserver;
    if (typeof Intersections !== 'function') {
      // Without an IntersectionObserver a non-slide document cannot report
      // visibility at all, so a block there plays as soon as it is mounted.
      intersecting = true;
      check();
      return;
    }
    const observer = new Intersections(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          intersecting = true;
          check();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    intersections = observer;
  };

  check();
  if (!done) (options.defer ?? ((callback) => defaultDefer(view, callback)))(armIntersections);

  return dispose;
}

/** Waits for the document to be parsed, then for the deck's script to have run. */
function defaultDefer(view: Window & typeof globalThis, callback: () => void): void {
  const afterAFrame = (): void => {
    const frame = view.requestAnimationFrame?.bind(view);
    if (frame) frame(() => frame(callback));
    else view.setTimeout(callback, 0);
  };

  if (view.document.readyState === 'loading') {
    view.document.addEventListener('DOMContentLoaded', afterAFrame, { once: true });
  } else {
    afterAFrame();
  }
}
