import { createRuntime, type TerminalogueRuntime } from './runtime.js';

/**
 * Entry point of the script Marp injects into a converted presentation.
 *
 * The script tag is appended after the slides, so every placeholder is already
 * in the document when this runs and a block is on screen with the page rather
 * than one frame later. The `DOMContentLoaded` pass afterwards is only there
 * for a host that puts the script somewhere else.
 */

const GLOBAL_KEY = '__terminalogueMarp__';

declare global {
  interface Window {
    [GLOBAL_KEY]?: TerminalogueRuntime;
  }
}

function bootstrap(view: Window & typeof globalThis): void {
  // Injecting the runtime twice — two decks concatenated, a hot reload — must
  // not mount a second animation over the first.
  const existing = view[GLOBAL_KEY];
  if (existing) {
    existing.sync();
    return;
  }

  const runtime = createRuntime(view);
  view[GLOBAL_KEY] = runtime;
  runtime.sync();

  if (view.document.readyState === 'loading') {
    view.document.addEventListener('DOMContentLoaded', () => runtime.sync(), { once: true });
  }
  view.addEventListener('pagehide', () => runtime.destroyAll(), { once: true });
}

if (typeof window !== 'undefined') bootstrap(window);
