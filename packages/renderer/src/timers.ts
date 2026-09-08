/**
 * The timers a block animates on.
 *
 * Always the ones belonging to the window the block is in, never the ambient
 * globals: Obsidian can move a note into a popout window, which is a window of
 * its own, and a timeout scheduled on the main window's `setTimeout` never
 * fires there. Every host hands the renderer an element, so that window is
 * simply the one owning that element's document.
 */
export interface Timers {
  /** Schedules `callback`, returning the handle {@link Timers.clear} cancels. */
  set(callback: () => void, ms: number): number;
  /** Cancels a pending callback. A `null` handle is nothing to cancel. */
  clear(handle: number | null): void;
}

/**
 * The timers of `view`.
 *
 * A document with no window at all — one built by `DOMParser`, never shown to
 * anyone — gets timers that do nothing, rather than the main window's: there is
 * no frame to paint an animation into, and the finished session is in the
 * transcript either way.
 */
export function timersOf(view: Window | null | undefined): Timers {
  if (!view) return INERT;
  return {
    set: (callback, ms) => view.setTimeout(callback, ms),
    clear: (handle) => {
      if (handle !== null) view.clearTimeout(handle);
    },
  };
}

const INERT: Timers = {
  set: () => 0,
  clear: () => {
    // Nothing was ever scheduled.
  },
};
