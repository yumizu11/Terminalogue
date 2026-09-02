// @vitest-environment jsdom
import { parseTerminalogue } from '@terminalogue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createRuntime, type TerminalogueRuntime } from '../src/browser/runtime.js';
import { ACTIVE_SLIDE_CLASS, SLIDE_CLASS } from '../src/browser/visibility.js';
import { PAYLOAD_ATTRIBUTE, PLACEHOLDER_CLASS, encodeDocument } from '../src/placeholder.js';

/**
 * The browser half of the integration, against the DOM Marp actually produces:
 * every slide in the document at once, with a class marking the one on screen.
 */

const view = window as unknown as Window & typeof globalThis;

let runtime: TerminalogueRuntime | null = null;

afterEach(() => {
  runtime?.destroyAll();
  runtime = null;
  document.body.replaceChildren();
});

/** Builds a deck of `sources.length` slides, one Terminalogue block each. */
function deck(sources: string[], { slides = true } = {}): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  for (const source of sources) {
    const block = document.createElement('div');
    block.className = PLACEHOLDER_CLASS;
    block.setAttribute(PAYLOAD_ATTRIBUTE, encodeDocument(parseTerminalogue(source)));

    if (slides) {
      const slide = document.createElement('div');
      slide.className = SLIDE_CLASS;
      slide.appendChild(block);
      document.body.appendChild(slide);
    } else {
      document.body.appendChild(block);
    }
    blocks.push(block);
  }
  return blocks;
}

const activate = (block: Element): void => {
  block.closest(`.${SLIDE_CLASS}`)?.classList.add(ACTIVE_SLIDE_CLASS);
};
const deactivate = (block: Element): void => {
  block.closest(`.${SLIDE_CLASS}`)?.classList.remove(ACTIVE_SLIDE_CLASS);
};
const state = (block: Element): string | null =>
  block.querySelector('.tlg')?.getAttribute('data-state') ?? null;

/** MutationObserver callbacks are microtasks; let them run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the Marp browser runtime', () => {
  it('mounts the shared renderer into every placeholder', () => {
    const [block] = deck(['@title RHEL 10\n$ ls\nfile.txt']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    expect(block!.querySelector('.tlg')).not.toBeNull();
    expect(block!.querySelector('.tlg__title')?.textContent).toBe('RHEL 10');
    // Play/Pause, Restart, four speeds and Copy commands: the same controls as
    // in VS Code and in Obsidian.
    expect(block!.querySelectorAll('.tlg__button')).toHaveLength(7);
    expect(block!.querySelector('.tlg__transcript-text')?.textContent).toBe('$ ls\nfile.txt');
  });

  it('leaves a block on a slide the reader has not reached alone', () => {
    const blocks = deck(['$ one', '$ two']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    expect(blocks.map((block) => state(block))).toEqual(['idle', 'idle']);
  });

  it('starts a block when its slide comes on screen', async () => {
    const blocks = deck(['$ one', '$ two']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    activate(blocks[1]!);
    await settle();

    expect(state(blocks[0]!)).toBe('idle');
    expect(state(blocks[1]!)).toBe('playing');
  });

  it('does not replay a block when the reader comes back to its slide', async () => {
    const [block] = deck(['$ ls']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    activate(block!);
    await settle();
    block!.querySelector<HTMLElement>('.tlg')!.setAttribute('data-state', 'finished');

    deactivate(block!);
    await settle();
    activate(block!);
    await settle();

    // Only Restart replays a finished block; a slide change never does.
    expect(state(block!)).toBe('finished');
  });

  it('never overrides what the reader already did with a block', async () => {
    const [block] = deck(['$ ls']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    // Played and then paused by hand before the slide ever came up.
    const toggle = block!.querySelectorAll<HTMLButtonElement>('.tlg__titlebar .tlg__button')[0]!;
    toggle.click();
    expect(state(block!)).toBe('playing');
    toggle.click();
    expect(state(block!)).toBe('paused');

    activate(block!);
    await settle();

    // Autoplay starts a block; it never resumes, restarts or overrides one.
    expect(state(block!)).toBe('paused');
  });

  it('falls back to viewport visibility when there are no slides', () => {
    const [block] = deck(['$ ls'], { slides: false });
    runtime = createRuntime(view, { defer: (callback) => callback() });
    runtime.sync();

    expect(state(block!)).toBe('playing');
  });

  it('honours prefers-reduced-motion by showing the finished session', () => {
    const [block] = deck(['$ ls\nfile.txt']);
    runtime = createRuntime(view, { reducedMotion: true, defer: () => {} });
    runtime.sync();

    expect(state(block!)).toBe('finished');
    expect(block!.querySelector('.tlg__screen')?.textContent).toContain('file.txt');
  });

  it('renders block content as text, never as markup', () => {
    const [block] = deck(['<img src=x onerror=alert(1)>\n<script>alert(1)</script>']);
    runtime = createRuntime(view, { reducedMotion: true, defer: () => {} });
    runtime.sync();

    expect(block!.querySelector('img')).toBeNull();
    expect(block!.querySelector('script')).toBeNull();
    expect(block!.querySelector('.tlg__transcript-text')?.textContent).toContain('onerror');
  });

  it('shows a diagnostic for an unreadable placeholder instead of failing', () => {
    const [block] = deck(['$ ls']);
    block!.setAttribute(PAYLOAD_ATTRIBUTE, 'not a document');
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    expect(block!.querySelector('.tlg')).not.toBeNull();
    expect(block!.querySelector('.tlg__diagnostic')?.textContent).toContain('could not read');
  });

  it('mounts each placeholder once, however often it is synchronised', () => {
    const [block] = deck(['$ ls']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();
    runtime.sync();
    runtime.sync();

    expect(block!.querySelectorAll('.tlg')).toHaveLength(1);
    expect(runtime.size).toBe(1);
  });

  it('gives every block its own playback', async () => {
    const blocks = deck(['@theme ubuntu\n$ one', '@theme cmd\n$ two']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    expect(blocks.map((block) => block.querySelector('.tlg')?.getAttribute('data-theme'))).toEqual([
      'ubuntu',
      'cmd',
    ]);

    activate(blocks[0]!);
    await settle();
    expect(blocks.map((block) => state(block))).toEqual(['playing', 'idle']);
  });

  it('tears every block down, leaving no DOM and no live block behind', () => {
    const blocks = deck(['$ one', '$ two']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();
    expect(runtime.size).toBe(2);

    runtime.destroyAll();

    expect(runtime.size).toBe(0);
    for (const block of blocks) expect(block.querySelector('.tlg')).toBeNull();
  });

  it('drops a block whose placeholder has left the document', () => {
    const blocks = deck(['$ one', '$ two']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    blocks[0]!.closest(`.${SLIDE_CLASS}`)!.remove();
    runtime.sync();

    expect(runtime.size).toBe(1);
  });

  it('stops watching a slide once its block has played', async () => {
    const [block] = deck(['$ ls']);
    runtime = createRuntime(view, { defer: () => {} });
    runtime.sync();

    activate(block!);
    await settle();
    runtime.destroyAll();

    // Nothing left observing: a later class change touches no timer at all.
    deactivate(block!);
    activate(block!);
    await settle();
    expect(block!.querySelector('.tlg')).toBeNull();
  });
});
