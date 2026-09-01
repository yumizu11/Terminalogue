import { parseTerminalogue } from '@terminalogue/core';
import { mountTerminalogue, type TerminalogueInstance } from '@terminalogue/renderer';
import { PLACEHOLDER_CLASS, SOURCE_ATTRIBUTE } from '../markdown-it-plugin.js';

/**
 * Preview script for VS Code's built-in Markdown preview.
 *
 * Since VS Code 1.63 the preview updates its DOM incrementally instead of
 * reloading the page, so this script runs once and then re-synchronises on the
 * `vscode.markdown.updateContent` event. Every sync destroys the instances
 * whose placeholder is gone and mounts the ones that are new or whose source
 * changed, which is what keeps edits from leaving stale timers behind.
 */

const SELECTOR = `.${PLACEHOLDER_CLASS}`;
const GLOBAL_KEY = '__terminalogueMarkdownPreview__';

interface MountRecord {
  source: string;
  instance: TerminalogueInstance;
}

interface Manager {
  sync(): void;
  destroyAll(): void;
}

function createManager(): Manager {
  const mounted = new Map<HTMLElement, MountRecord>();

  const readSource = (element: HTMLElement): string => {
    const raw = element.getAttribute(SOURCE_ATTRIBUTE) ?? '';
    try {
      return decodeURIComponent(raw);
    } catch {
      // A malformed attribute should degrade to an empty block, not an
      // exception that takes the whole preview script down.
      return '';
    }
  };

  const unmount = (element: HTMLElement, record: MountRecord): void => {
    record.instance.destroy();
    mounted.delete(element);
  };

  return {
    sync(): void {
      for (const [element, record] of Array.from(mounted)) {
        if (!element.isConnected) unmount(element, record);
      }

      for (const element of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
        const source = readSource(element);
        const existing = mounted.get(element);
        if (existing) {
          if (existing.source === source) continue;
          unmount(element, existing);
        }

        while (element.firstChild) element.removeChild(element.firstChild);
        const instance = mountTerminalogue(element, parseTerminalogue(source));
        mounted.set(element, { source, instance });
      }
    },

    destroyAll(): void {
      for (const [element, record] of Array.from(mounted)) unmount(element, record);
    },
  };
}

function bootstrap(): void {
  const scope = window as unknown as Record<string, Manager | undefined>;
  let manager = scope[GLOBAL_KEY];

  if (!manager) {
    manager = createManager();
    scope[GLOBAL_KEY] = manager;
    const current = manager;

    // sync() mutates the DOM inside each placeholder it hydrates, which the
    // MutationObserver below would otherwise treat as more content to sync.
    // This flag keeps that self-triggering from doing real, if harmless,
    // extra passes.
    let syncing = false;
    const safeSync = (): void => {
      if (syncing) return;
      syncing = true;
      try {
        current.sync();
      } catch {
        // A stray MutationObserver microtask can still fire after the
        // webview has started tearing down; nothing productive comes from
        // letting that surface as an uncaught error in the host.
      } finally {
        syncing = false;
      }
    };

    window.addEventListener('vscode.markdown.updateContent', safeSync);
    window.addEventListener('pagehide', () => current.destroyAll(), { once: true });

    // The preview's body content can still be arriving asynchronously the
    // first time this script runs: `document.readyState` alone is not a
    // reliable signal that a block's placeholder is already in the DOM. A
    // MutationObserver is the robust fallback that catches content appearing
    // after the initial sync attempt below finds nothing.
    const observer = new MutationObserver(safeSync);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', safeSync, { once: true });
    } else {
      safeSync();
    }
    return;
  }

  manager.sync();
}

bootstrap();
