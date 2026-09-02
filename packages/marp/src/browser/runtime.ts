import { mountTerminalogue, prefersReducedMotion } from '@terminalogue/renderer';
import type { TerminalogueInstance } from '@terminalogue/renderer';
import {
  PAYLOAD_ATTRIBUTE,
  PLACEHOLDER_CLASS,
  decodeDocument,
  unreadableDocument,
} from '../placeholder.js';
import { onFirstPresented, type PresentationWatchOptions } from './visibility.js';

/**
 * The browser half of the Marp integration.
 *
 * It reads the documents Marp already parsed into the placeholders and hands
 * them to the shared renderer. There is no terminal DOM, no animation and no
 * playback logic here — a Terminalogue block in a Marp deck is rendered by
 * exactly the code that renders one in VS Code and in Obsidian.
 */

const UNREADABLE_MESSAGE =
  'Terminalogue could not read this block. The generated presentation may be incomplete.';

export interface RuntimeOptions extends PresentationWatchOptions {
  /** Overrides the reduced-motion decision. Defaults to the media query. */
  reducedMotion?: boolean;
}

/** Handle over every Terminalogue block in one document. */
export interface TerminalogueRuntime {
  /** Mounts every placeholder that is not mounted yet. Safe to call repeatedly. */
  sync(): void;
  /** Number of live blocks. */
  readonly size: number;
  /** Tears every block down, cancelling its timers and observers. */
  destroyAll(): void;
}

interface MountRecord {
  instance: TerminalogueInstance;
  unwatch: () => void;
}

/** Creates a runtime over one document. Nothing is mounted until `sync()` runs. */
export function createRuntime(
  view: Window & typeof globalThis,
  options: RuntimeOptions = {},
): TerminalogueRuntime {
  const doc = view.document;
  const mounted = new Map<Element, MountRecord>();
  // Under prefers-reduced-motion the renderer shows the finished session
  // immediately; arming autoplay on top of that would replay it.
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion(view);

  const unmount = (element: Element, record: MountRecord): void => {
    record.unwatch();
    record.instance.destroy();
    mounted.delete(element);
  };

  const mount = (element: HTMLElement): void => {
    const document = decodeDocument(element.getAttribute(PAYLOAD_ATTRIBUTE));
    while (element.firstChild) element.removeChild(element.firstChild);

    const instance = mountTerminalogue(
      element,
      document ?? unreadableDocument(UNREADABLE_MESSAGE),
      // Autoplay is this module's business: a slide the reader has not reached
      // yet must stay quiet, which no viewport test can decide on its own.
      // Reduced motion stays the renderer's: it shows the finished session.
      { autoplay: false, reducedMotion },
    );

    const unwatch = reducedMotion
      ? noop
      : onFirstPresented(element, view, () => autoplay(instance), options);

    mounted.set(element, { instance, unwatch });
  };

  return {
    sync(): void {
      for (const [element, record] of Array.from(mounted)) {
        if (!element.isConnected) unmount(element, record);
      }
      for (const element of Array.from(
        doc.querySelectorAll<HTMLElement>(`.${PLACEHOLDER_CLASS}`),
      )) {
        if (mounted.has(element)) continue;
        try {
          mount(element);
        } catch {
          // One unreadable block must never stop the rest of the deck from
          // working, and must never break the presentation around it.
        }
      }
    },

    get size(): number {
      return mounted.size;
    },

    destroyAll(): void {
      for (const [element, record] of Array.from(mounted)) unmount(element, record);
    },
  };
}

/**
 * Starts a block that has not been touched yet, and only such a block.
 *
 * Autoplay is a courtesy, never a correction: a block the reader has already
 * played, paused or finished stays exactly as they left it. Restart is the one
 * thing that plays a finished block again.
 */
function autoplay(instance: TerminalogueInstance): void {
  if (instance.state === 'idle') instance.play();
}

function noop(): void {
  // Nothing to cancel: this block was never armed for autoplay.
}
