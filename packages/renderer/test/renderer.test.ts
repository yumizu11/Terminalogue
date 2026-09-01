import { parseTerminalogue } from '@terminalogue/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTerminalogue, type RendererOptions, type TerminalogueInstance } from '../src/index.js';

/**
 * Deterministic timings: no jitter, whole-millisecond frames. Autoplay is off
 * by default so each test drives playback explicitly.
 */
const BASE: RendererOptions = {
  autoplay: false,
  autoplayOnVisible: false,
  reducedMotion: false,
  typingSpeed: 100,
  jitterMin: 1,
  jitterMax: 1,
  random: () => 0.5,
  outputLineDelay: 100,
  commandSubmitDelay: 100,
  startDelay: 0,
};

let host: HTMLElement;
const instances: TerminalogueInstance[] = [];

function mount(source: string, options: RendererOptions = {}): TerminalogueInstance {
  const instance = mountTerminalogue(host, parseTerminalogue(source), { ...BASE, ...options });
  instances.push(instance);
  return instance;
}

function screenText(instance: TerminalogueInstance): string {
  const screen = instance.element.querySelector('.tlg__screen');
  return Array.from(screen?.children ?? [])
    .map((child) => child.textContent ?? '')
    .join('\n');
}

/** Number of timers vitest still has scheduled. */
function pendingTimers(): number {
  return vi.getTimerCount();
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  while (instances.length > 0) instances.pop()!.destroy();
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mountTerminalogue: structure', () => {
  it('renders the terminal chrome, controls and transcript', () => {
    const instance = mount('@title Demo\n$ ls');
    const root = instance.element;

    expect(root.classList.contains('tlg')).toBe(true);
    expect(root.querySelector('.tlg__title')?.textContent).toBe('Demo');
    expect(root.querySelector('.tlg__screen')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelectorAll('.tlg__button')).toHaveLength(2);
    expect(root.querySelector('.tlg__transcript-text')?.textContent).toBe('$ ls');
  });

  it('labels the controls for assistive technology', () => {
    const root = mount('$ ls').element;
    const labels = Array.from(root.querySelectorAll('.tlg__button')).map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Play terminal animation', 'Restart terminal animation']);
  });

  it('falls back to a generic window title', () => {
    expect(mount('$ ls').element.querySelector('.tlg__title')?.textContent).toBe('Terminal');
  });

  it('renders parse diagnostics inside the block instead of throwing', () => {
    const root = mount('@bogus\n@wait soon').element;
    const items = Array.from(root.querySelectorAll('.tlg__diagnostic')).map(
      (item) => item.textContent ?? '',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Line 1:');
    expect(items[1]).toContain('Line 2:');
  });

  it('omits the diagnostics box when the document is clean', () => {
    expect(mount('$ ls').element.querySelector('.tlg__diagnostics')).toBeNull();
  });
});

describe('mountTerminalogue: typing animation', () => {
  it('reveals the command one character at a time', () => {
    const instance = mount('$ abc');
    instance.play();

    expect(screenText(instance)).toBe('');

    vi.advanceTimersByTime(100); // command-start
    expect(screenText(instance)).toBe('$ ');

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('$ a');
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('$ ab');
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('$ abc');
  });

  it('uses the prompt from @prompt', () => {
    const instance = mount('@prompt [root@rhel10 ~]#\n$ id');
    instance.play();
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('[root@rhel10 ~]# ');
  });

  it('reveals output a whole line at a time', () => {
    const instance = mount('one\ntwo');
    instance.play();

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('one');
    vi.advanceTimersByTime(100);
    // The idle prompt appears as soon as the last frame has played.
    expect(screenText(instance)).toBe('one\ntwo\n$ ');
  });

  it('honours @wait between steps', () => {
    const instance = mount('one\n@wait 800ms\ntwo');
    instance.play();

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('one');

    vi.advanceTimersByTime(799);
    expect(screenText(instance)).toBe('one');

    vi.advanceTimersByTime(1 + 100);
    expect(screenText(instance)).toBe('one\ntwo\n$ ');
  });

  it('honours @speed for the commands that follow it', () => {
    const instance = mount('@speed 10ms\n$ ab');
    instance.play();

    vi.advanceTimersByTime(100); // command-start
    vi.advanceTimersByTime(10);
    expect(screenText(instance)).toBe('$ a');
    vi.advanceTimersByTime(10);
    expect(screenText(instance)).toBe('$ ab');
  });

  it('applies @clear to the screen', () => {
    const instance = mount('gone\n@clear\nkept');
    instance.play();
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('gone');
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('');
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('kept\n$ ');
  });

  it('adds jitter drawn from the injected random function', () => {
    const random = vi.fn(() => 0);
    const instance = mount('$ ab', { random, jitterMin: 0.5, jitterMax: 1.5, typingSpeed: 100 });
    // One draw per typed character, at build time, so playback stays reproducible.
    expect(random).toHaveBeenCalledTimes(2);

    instance.play();
    vi.advanceTimersByTime(100); // command-start
    vi.advanceTimersByTime(49);
    expect(screenText(instance)).toBe('$ ');
    vi.advanceTimersByTime(1);
    expect(screenText(instance)).toBe('$ a');
  });

  it('ends with an idle prompt line and reports the finished state', () => {
    const instance = mount('@prompt >\n$ ls\nfile');
    instance.play();
    vi.advanceTimersByTime(10_000);

    expect(instance.state).toBe('finished');
    expect(instance.element.getAttribute('data-state')).toBe('finished');
    expect(screenText(instance)).toBe('> ls\nfile\n> ');
    expect(pendingTimers()).toBe(0);
  });
});

describe('mountTerminalogue: controls', () => {
  it('pauses and resumes mid-frame instead of restarting the frame', () => {
    const instance = mount('$ ab');
    instance.play();
    vi.advanceTimersByTime(100); // command-start
    vi.advanceTimersByTime(60); // 60ms into the 100ms first character

    instance.pause();
    expect(instance.state).toBe('paused');
    expect(pendingTimers()).toBe(0);

    vi.advanceTimersByTime(5_000);
    expect(screenText(instance)).toBe('$ ');

    instance.play();
    expect(instance.state).toBe('playing');
    vi.advanceTimersByTime(39);
    expect(screenText(instance)).toBe('$ ');
    vi.advanceTimersByTime(1);
    expect(screenText(instance)).toBe('$ a');
  });

  it('restarts from the beginning', () => {
    const instance = mount('$ ab');
    instance.play();
    vi.advanceTimersByTime(10_000);
    expect(instance.state).toBe('finished');

    instance.restart();
    expect(instance.state).toBe('playing');
    expect(screenText(instance)).toBe('');

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('$ ');
  });

  it('restarts when play is pressed after finishing', () => {
    const instance = mount('$ a');
    instance.play();
    vi.advanceTimersByTime(10_000);

    instance.play();
    expect(instance.state).toBe('playing');
    expect(screenText(instance)).toBe('');
  });

  it('drives playback from the toggle and restart buttons', () => {
    const instance = mount('$ ab');
    const [toggle, restart] = Array.from(
      instance.element.querySelectorAll<HTMLButtonElement>('.tlg__button'),
    );

    toggle!.click();
    expect(instance.state).toBe('playing');
    expect(toggle!.getAttribute('aria-label')).toBe('Pause terminal animation');

    toggle!.click();
    expect(instance.state).toBe('paused');
    expect(toggle!.getAttribute('aria-label')).toBe('Play terminal animation');

    vi.advanceTimersByTime(10_000);
    expect(screenText(instance)).toBe('');

    toggle!.click();
    vi.advanceTimersByTime(10_000);
    expect(instance.state).toBe('finished');

    restart!.click();
    expect(instance.state).toBe('playing');
    expect(screenText(instance)).toBe('');
  });

  it('can be rendered without controls', () => {
    expect(mount('$ ls', { controls: false }).element.querySelectorAll('.tlg__button')).toHaveLength(
      0,
    );
  });
});

describe('mountTerminalogue: independence and cleanup', () => {
  it('keeps multiple blocks completely independent', () => {
    const first = mount('$ ab');
    const second = mount('$ xy');

    first.play();
    vi.advanceTimersByTime(10_000);

    expect(first.state).toBe('finished');
    expect(second.state).toBe('idle');
    expect(screenText(second)).toBe('');

    second.play();
    vi.advanceTimersByTime(100);
    expect(screenText(second)).toBe('$ ');
    expect(screenText(first)).toBe('$ ab\n$ ');
  });

  it('leaves no timers behind after destroy', () => {
    const instance = mount('$ a long command\nand some output');
    instance.play();
    vi.advanceTimersByTime(150);
    expect(pendingTimers()).toBeGreaterThan(0);

    instance.destroy();
    expect(pendingTimers()).toBe(0);
    expect(instance.state).toBe('destroyed');
    expect(host.querySelector('.tlg')).toBeNull();
  });

  it('ignores playback calls after destroy', () => {
    const instance = mount('$ ab');
    instance.destroy();
    instance.play();
    instance.restart();
    instance.pause();
    expect(pendingTimers()).toBe(0);
    expect(instance.state).toBe('destroyed');
  });

  it('does not double-schedule when the same host is re-rendered', () => {
    const first = mount('$ ab');
    first.play();
    vi.advanceTimersByTime(100);
    first.destroy();

    const second = mount('$ ab');
    second.play();
    vi.advanceTimersByTime(100);

    // Exactly one animation is in flight.
    expect(pendingTimers()).toBe(1);
    expect(host.querySelectorAll('.tlg')).toHaveLength(1);
  });
});

describe('mountTerminalogue: autoplay', () => {
  class FakeObserver implements IntersectionObserver {
    static instances: FakeObserver[] = [];
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observed: Element[] = [];
    disconnected = false;

    constructor(private readonly callback: IntersectionObserverCallback) {
      FakeObserver.instances.push(this);
    }

    observe(target: Element): void {
      this.observed.push(target);
    }
    unobserve(): void {}
    disconnect(): void {
      this.disconnected = true;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    enter(): void {
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
  }

  beforeEach(() => {
    FakeObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for the block to scroll into view before autoplaying', () => {
    const instance = mount('$ ab', { autoplay: true, autoplayOnVisible: true });
    expect(instance.state).toBe('idle');

    const observer = FakeObserver.instances[0]!;
    expect(observer.observed).toEqual([instance.element]);

    observer.enter();
    expect(instance.state).toBe('playing');
    expect(observer.disconnected).toBe(true);
  });

  it('never autoplays a second time when scrolled back into view', () => {
    const instance = mount('$ ab', { autoplay: true, autoplayOnVisible: true });
    const observer = FakeObserver.instances[0]!;

    observer.enter();
    vi.advanceTimersByTime(10_000);
    expect(instance.state).toBe('finished');

    observer.enter();
    expect(instance.state).toBe('finished');
    expect(screenText(instance)).toBe('$ ab\n$ ');
  });

  it('stops observing once the reader uses the controls', () => {
    const instance = mount('$ ab', { autoplay: true, autoplayOnVisible: true });
    const observer = FakeObserver.instances[0]!;

    instance.pause();
    expect(observer.disconnected).toBe(true);
  });

  it('plays immediately when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const instance = mount('$ ab', { autoplay: true, autoplayOnVisible: true });
    expect(instance.state).toBe('playing');
  });
});

describe('mountTerminalogue: reduced motion', () => {
  it('shows the final state immediately without animating', () => {
    const instance = mount('$ ls\nfile.txt', { autoplay: true, reducedMotion: true });

    expect(instance.state).toBe('finished');
    expect(pendingTimers()).toBe(0);
    expect(screenText(instance)).toBe('$ ls\nfile.txt\n$ ');
  });

  it('still lets the reader replay with animation on request', () => {
    const instance = mount('$ ab', { autoplay: true, reducedMotion: true });
    instance.restart();

    expect(instance.state).toBe('playing');
    expect(screenText(instance)).toBe('');
  });

  it('reads the prefers-reduced-motion media query by default', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const instance = mountTerminalogue(host, parseTerminalogue('$ ls'), {
      ...BASE,
      autoplay: true,
      reducedMotion: undefined,
    });
    instances.push(instance);

    expect(instance.state).toBe('finished');
    vi.unstubAllGlobals();
  });
});

describe('mountTerminalogue: security', () => {
  const hostile = [
    '$ echo "<script>alert(1)</script>"',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<!doctype html>',
    '</div><b>bold</b>',
  ].join('\n');

  it('renders HTML and JavaScript in block content as plain terminal text', () => {
    const instance = mount(hostile, { typingSpeed: 1, outputLineDelay: 1, commandSubmitDelay: 1 });
    instance.play();
    vi.advanceTimersByTime(60_000);

    const root = instance.element;
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();

    const lines = Array.from(root.querySelectorAll('.tlg__line')).map(
      (line) => line.textContent ?? '',
    );
    expect(lines).toContain('<script>alert(1)</script>');
    expect(lines).toContain('<img src=x onerror=alert(1)>');
    expect(lines).toContain('</div><b>bold</b>');
    expect(lines[0]).toBe('$ echo "<script>alert(1)</script>"');
  });

  it('keeps hostile content out of the transcript markup too', () => {
    const instance = mount(hostile, { reducedMotion: true });
    const transcript = instance.element.querySelector('.tlg__transcript-text');
    expect(transcript?.querySelector('*')).toBeNull();
    expect(transcript?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('never treats a title or prompt as markup', () => {
    const instance = mount('@title <b>x</b>\n@prompt <i>#</i>\n$ ls', { reducedMotion: true });
    const root = instance.element;
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('i')).toBeNull();
    expect(root.querySelector('.tlg__title')?.textContent).toBe('<b>x</b>');
    expect(root.querySelector('.tlg__prompt')?.textContent).toBe('<i>#</i>');
  });
});
