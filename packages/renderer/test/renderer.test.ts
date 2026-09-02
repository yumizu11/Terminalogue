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

const SOURCE_WITH_COMMAND = '$ ls\nfile.txt';

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
    // Play/Pause, Restart, four speeds and Copy commands.
    expect(root.querySelectorAll('.tlg__button')).toHaveLength(7);
    expect(root.querySelector('.tlg__transcript-text')?.textContent).toBe('$ ls');
  });

  it('labels the controls for assistive technology', () => {
    const root = mount('$ ls').element;
    const labels = Array.from(root.querySelectorAll('.tlg__button'))
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label !== null);
    expect(labels).toEqual([
      'Play terminal animation',
      'Restart terminal animation',
      'Copy commands',
    ]);
  });

  it('names the speed buttons by their own text inside a labelled group', () => {
    const root = mount('$ ls').element;
    expect(root.querySelector('.tlg__group')?.getAttribute('aria-label')).toBe('Playback speed');
    const faces = Array.from(root.querySelectorAll('.tlg__speed')).map(
      (button) => button.textContent,
    );
    expect(faces).toEqual(['1×', '2×', '4×', 'Instant']);
  });

  it('keeps every control reachable from the keyboard', () => {
    const root = mount('$ ls').element;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tlg__button'));
    // Native buttons that are neither removed from the tab order nor disabled
    // are focusable and activate on Enter and Space without any extra code.
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
      expect(button.hasAttribute('tabindex')).toBe(false);
      expect(button.disabled).toBe(false);
    }
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

describe('mountTerminalogue: @type', () => {
  it('appends to the end of the last line, one character at a time', () => {
    const instance = mount('Continue? \n@type ab');
    instance.play();

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('Continue? ');

    vi.advanceTimersByTime(100); // input-start: no new line, no new text
    expect(screenText(instance)).toBe('Continue? ');

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('Continue? a');
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('Continue? ab');
  });

  it('keeps the answer on the same line as the question', () => {
    const instance = mount('Proceed? [y/N] \n@type y');
    instance.play();
    vi.advanceTimersByTime(10_000);

    const lines = Array.from(instance.element.querySelectorAll('.tlg__line')).map(
      (line) => line.textContent,
    );
    expect(lines).toEqual(['Proceed? [y/N] y', '$ ']);
  });

  it('starts a line of its own when there is nothing on screen to answer', () => {
    const instance = mount('@type yes');
    instance.play();
    vi.advanceTimersByTime(10_000);
    expect(screenText(instance)).toBe('yes\n$ ');
  });

  it('shares the typing engine with commands, so @speed applies', () => {
    const instance = mount('@speed 10ms\nContinue? \n@type ab');
    instance.play();

    vi.advanceTimersByTime(200); // output, then input-start
    vi.advanceTimersByTime(10);
    expect(screenText(instance)).toBe('Continue? a');
    vi.advanceTimersByTime(10);
    expect(screenText(instance)).toBe('Continue? ab');
  });

  it('shares the jitter engine too', () => {
    const random = vi.fn(() => 0);
    mount('Continue? \n@type ab', { random, jitterMin: 0.5, jitterMax: 1.5 });
    // One draw per typed character, exactly as for a command.
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('does not type on while playback is paused, and resumes where it stopped', () => {
    const instance = mount('Continue? \n@type ab');
    instance.play();
    vi.advanceTimersByTime(300);
    expect(screenText(instance)).toBe('Continue? a');

    instance.pause();
    vi.advanceTimersByTime(5_000);
    expect(screenText(instance)).toBe('Continue? a');

    instance.play();
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('Continue? ab');
  });

  it('replays from the beginning after a restart', () => {
    const instance = mount('Continue? \n@type ab');
    instance.play();
    vi.advanceTimersByTime(10_000);
    expect(screenText(instance)).toBe('Continue? ab\n$ ');

    instance.restart();
    expect(screenText(instance)).toBe('');
    vi.advanceTimersByTime(300);
    expect(screenText(instance)).toBe('Continue? a');
  });

  it('renders typed text as text, never as markup', () => {
    const instance = mount('Answer: \n@type <script>alert(1)</script>', { typingSpeed: 1 });
    instance.play();
    vi.advanceTimersByTime(10_000);

    expect(instance.element.querySelector('script')).toBeNull();
    expect(screenText(instance)).toContain('Answer: <script>alert(1)</script>');
  });
});

describe('mountTerminalogue: @pause', () => {
  const SOURCE = 'one\n@pause Dependencies resolved\ntwo';

  it('stops playback when the directive is reached', () => {
    const instance = mount(SOURCE);
    instance.play();

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('one');
    expect(instance.state).toBe('paused');
    expect(instance.pauseReason).toBe('directive');
    expect(pendingTimers()).toBe(0);

    vi.advanceTimersByTime(10_000);
    expect(screenText(instance)).toBe('one');
  });

  it('shares one state machine with the Pause button, telling them apart by reason', () => {
    const instance = mount(SOURCE);
    instance.play();
    vi.advanceTimersByTime(100);
    expect(instance.element.getAttribute('data-state')).toBe('paused');
    expect(instance.element.getAttribute('data-pause-reason')).toBe('directive');

    instance.play();
    instance.pause();
    expect(instance.state).toBe('paused');
    expect(instance.pauseReason).toBe('manual');
    expect(instance.element.getAttribute('data-pause-reason')).toBe('manual');
  });

  it('shows the label while it holds playback and drops it on resume', () => {
    const instance = mount(SOURCE);
    const badge = instance.element.querySelector('.tlg__breakpoint');
    expect(badge?.textContent).toBe('');

    instance.play();
    vi.advanceTimersByTime(100);
    expect(badge?.textContent).toBe('Dependencies resolved');

    instance.play();
    expect(badge?.textContent).toBe('');
  });

  it('continues from the breakpoint when Play is pressed', () => {
    const instance = mount(SOURCE);
    instance.play();
    vi.advanceTimersByTime(100);

    instance.play();
    expect(instance.state).toBe('playing');
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('one\ntwo\n$ ');
    expect(instance.state).toBe('finished');
  });

  it('stops at the same breakpoint again after a restart', () => {
    const instance = mount(SOURCE);
    instance.play();
    vi.advanceTimersByTime(100);
    instance.play();
    vi.advanceTimersByTime(10_000);
    expect(instance.state).toBe('finished');

    instance.restart();
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('one');
    expect(instance.pauseReason).toBe('directive');
  });

  it('flips the toggle button back to Play when it stops', () => {
    const instance = mount(SOURCE);
    const [toggle] = Array.from(
      instance.element.querySelectorAll<HTMLButtonElement>('.tlg__button'),
    );

    toggle!.click();
    expect(toggle!.getAttribute('aria-label')).toBe('Pause terminal animation');
    vi.advanceTimersByTime(100);
    expect(toggle!.getAttribute('aria-label')).toBe('Play terminal animation');

    toggle!.click();
    vi.advanceTimersByTime(10_000);
    expect(instance.state).toBe('finished');
  });

  it('carries a label-less @pause too', () => {
    const instance = mount('one\n@pause\ntwo');
    instance.play();
    vi.advanceTimersByTime(100);
    expect(instance.pauseReason).toBe('directive');
    expect(instance.element.querySelector('.tlg__breakpoint')?.textContent).toBe('');
  });

  it('stops immediately when a block opens with @pause', () => {
    const instance = mount('@pause\none', { startDelay: 5_000 });
    instance.play();
    expect(instance.state).toBe('paused');
    expect(screenText(instance)).toBe('');
  });
});

describe('mountTerminalogue: playback speed', () => {
  it('starts at 1x and marks the pressed speed for assistive technology', () => {
    const instance = mount('$ ab');
    expect(instance.speed).toBe(1);
    const pressed = Array.from(
      instance.element.querySelectorAll('.tlg__speed'),
    ).map((button) => button.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['true', 'false', 'false', 'false']);
  });

  it('halves every delay at 2x', () => {
    const instance = mount('$ ab', { speed: 2 });
    instance.play();

    vi.advanceTimersByTime(49);
    expect(screenText(instance)).toBe('');
    vi.advanceTimersByTime(1);
    expect(screenText(instance)).toBe('$ ');
    vi.advanceTimersByTime(50);
    expect(screenText(instance)).toBe('$ a');
  });

  it('quarters every delay at 4x', () => {
    const instance = mount('$ ab', { speed: 4 });
    instance.play();

    vi.advanceTimersByTime(24);
    expect(screenText(instance)).toBe('');
    vi.advanceTimersByTime(1);
    expect(screenText(instance)).toBe('$ ');
    vi.advanceTimersByTime(25);
    expect(screenText(instance)).toBe('$ a');
  });

  it('scales @wait as well as typing', () => {
    const instance = mount('one\n@wait 800ms\ntwo', { speed: 4 });
    instance.play();

    vi.advanceTimersByTime(25);
    expect(screenText(instance)).toBe('one');
    vi.advanceTimersByTime(199);
    expect(screenText(instance)).toBe('one');
    vi.advanceTimersByTime(1 + 25);
    expect(screenText(instance)).toBe('one\ntwo\n$ ');
  });

  it('combines @speed with the multiplier', () => {
    // 80ms per character in the document, played at 2x, is 40ms on the clock.
    const instance = mount('@speed 80ms\n$ ab', { speed: 2 });
    instance.play();
    vi.advanceTimersByTime(50); // command-start
    vi.advanceTimersByTime(39);
    expect(screenText(instance)).toBe('$ ');
    vi.advanceTimersByTime(1);
    expect(screenText(instance)).toBe('$ a');
  });

  it('drops every delay at instant, without leaving a timer behind', () => {
    const instance = mount('$ ab\nout', { speed: 'instant' });
    instance.play();

    expect(screenText(instance)).toBe('$ ab\nout\n$ ');
    expect(instance.state).toBe('finished');
    expect(pendingTimers()).toBe(0);
  });

  it('honours @pause at instant: it skips time, not control flow', () => {
    const instance = mount('$ a\nout1\n@pause\n$ b\nout2', { speed: 'instant' });
    instance.play();

    expect(screenText(instance)).toBe('$ a\nout1');
    expect(instance.state).toBe('paused');
    expect(instance.pauseReason).toBe('directive');

    instance.play();
    expect(screenText(instance)).toBe('$ a\nout1\n$ b\nout2\n$ ');
    expect(instance.state).toBe('finished');
  });

  it('honours @clear at instant too', () => {
    const instance = mount('gone\n@clear\nkept', { speed: 'instant' });
    instance.play();
    expect(screenText(instance)).toBe('kept\n$ ');
  });

  it('can be changed mid-animation, taking effect from the next frame', () => {
    const instance = mount('$ ab');
    instance.play();
    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('$ ');

    instance.setSpeed(4);
    expect(instance.state).toBe('playing');
    vi.advanceTimersByTime(24);
    expect(screenText(instance)).toBe('$ ');
    vi.advanceTimersByTime(1);
    expect(screenText(instance)).toBe('$ a');
  });

  it('fast-forwards to the next breakpoint when switched to instant mid-animation', () => {
    const instance = mount('one\n@pause\ntwo');
    instance.play();
    instance.setSpeed('instant');

    expect(screenText(instance)).toBe('one');
    expect(instance.pauseReason).toBe('directive');
  });

  it('uses the new speed on resume when it changed during a pause', () => {
    const instance = mount('$ ab');
    instance.play();
    vi.advanceTimersByTime(100);
    instance.pause();

    instance.setSpeed(4);
    expect(instance.state).toBe('paused');

    instance.play();
    vi.advanceTimersByTime(25);
    expect(screenText(instance)).toBe('$ a');
  });

  it('keeps the chosen speed across a restart', () => {
    const instance = mount('$ ab');
    instance.setSpeed(4);
    instance.play();
    vi.advanceTimersByTime(10_000);

    instance.restart();
    expect(instance.speed).toBe(4);
    vi.advanceTimersByTime(25);
    expect(screenText(instance)).toBe('$ ');
  });

  it('drives the speed from the buttons and tracks the pressed state', () => {
    const instance = mount('$ ab');
    const buttons = Array.from(
      instance.element.querySelectorAll<HTMLButtonElement>('.tlg__speed'),
    );

    buttons[2]!.click();
    expect(instance.speed).toBe(4);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);

    buttons[3]!.click();
    expect(instance.speed).toBe('instant');
    expect(buttons[3]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps speed state per block', () => {
    const first = mount('$ ab');
    const second = mount('$ ab');

    first.setSpeed(4);
    expect(first.speed).toBe(4);
    expect(second.speed).toBe(1);

    second.play();
    vi.advanceTimersByTime(99);
    expect(screenText(second)).toBe('');
    vi.advanceTimersByTime(1);
    expect(screenText(second)).toBe('$ ');
  });

  it('leaves a speed choice from the buttons free to autoplay later', () => {
    const instance = mount('$ ab', { autoplay: false });
    instance.element.querySelector<HTMLButtonElement>('.tlg__speed')!.click();
    expect(instance.state).toBe('idle');
  });
});

describe('mountTerminalogue: copy commands', () => {
  const SOURCE = ['$ command1', 'output', '@type yes', '$ command2'].join('\n');

  const copyButton = (instance: TerminalogueInstance): HTMLButtonElement =>
    instance.element.querySelector<HTMLButtonElement>('.tlg__copy')!;

  it('passes only the $ command lines to the clipboard adapter', async () => {
    const clipboard = vi.fn(() => Promise.resolve());
    const instance = mount(SOURCE, { clipboard });

    await expect(instance.copyCommands()).resolves.toBe(true);
    expect(clipboard).toHaveBeenCalledTimes(1);
    expect(clipboard).toHaveBeenCalledWith('command1\ncommand2');
  });

  it('leaves prompts out of the copied text', async () => {
    const clipboard = vi.fn(() => Promise.resolve());
    const instance = mount('@prompt [root@rhel10 ~]#\n$ dnf install -y nginx', { clipboard });

    await instance.copyCommands();
    expect(clipboard).toHaveBeenCalledWith('dnf install -y nginx');
  });

  it('copies from the button and flashes the result for a moment', async () => {
    const clipboard = vi.fn(() => Promise.resolve());
    const instance = mount(SOURCE, { clipboard, copyFeedbackDelay: 1_500 });
    const button = copyButton(instance);

    expect(button.getAttribute('aria-label')).toBe('Copy commands');
    expect(button.textContent).toBe('Copy');

    button.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(clipboard).toHaveBeenCalledWith('command1\ncommand2');
    expect(button.getAttribute('data-copy')).toBe('copied');
    expect(button.getAttribute('aria-label')).toBe('Commands copied');
    expect(button.textContent).toBe('Copied');

    vi.advanceTimersByTime(1_500);
    expect(button.getAttribute('data-copy')).toBe('idle');
    expect(button.textContent).toBe('Copy');
  });

  it('reports a clipboard that refuses instead of throwing', async () => {
    const instance = mount(SOURCE, { clipboard: () => Promise.reject(new Error('denied')) });

    await expect(instance.copyCommands()).resolves.toBe(false);
    expect(copyButton(instance).getAttribute('data-copy')).toBe('failed');
  });

  it('degrades quietly when the host has no Clipboard API at all', async () => {
    // jsdom provides no navigator.clipboard, which is exactly the case the
    // default writer has to survive.
    const instance = mount(SOURCE);
    await expect(instance.copyCommands()).resolves.toBe(false);
    expect(copyButton(instance).getAttribute('data-copy')).toBe('failed');
  });

  it('disables the button when the block contains no commands', async () => {
    const clipboard = vi.fn(() => Promise.resolve());
    const instance = mount('just output\n@type yes', { clipboard });

    expect(copyButton(instance).disabled).toBe(true);
    await expect(instance.copyCommands()).resolves.toBe(false);
    expect(clipboard).not.toHaveBeenCalled();
  });

  it('never touches playback', async () => {
    const instance = mount(SOURCE, { clipboard: () => Promise.resolve() });
    await instance.copyCommands();
    expect(instance.state).toBe('idle');
    expect(screenText(instance)).toBe('');
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

  it('clears the copied-feedback timer on destroy', async () => {
    const instance = mount(SOURCE_WITH_COMMAND, { clipboard: () => Promise.resolve() });
    await instance.copyCommands();

    // Only the feedback timer is outstanding: this block has not started.
    expect(pendingTimers()).toBe(1);

    instance.destroy();
    expect(pendingTimers()).toBe(0);
  });

  it('never flashes copy feedback after destroy', async () => {
    const instance = mount(SOURCE_WITH_COMMAND, { clipboard: () => Promise.resolve() });
    instance.destroy();

    await expect(instance.copyCommands()).resolves.toBe(false);
    expect(pendingTimers()).toBe(0);
  });

  it('ignores playback calls after destroy', () => {
    const instance = mount('$ ab');
    instance.destroy();
    instance.play();
    instance.restart();
    instance.pause();
    instance.setSpeed(4);
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

  it('shows the whole session even when it contains an @pause', () => {
    // Reduced motion asks for the finished state, not for a quick playthrough:
    // stopping at a breakpoint would hide content the reader asked to see.
    const instance = mount('one\n@pause here\ntwo', { autoplay: true, reducedMotion: true });

    expect(instance.state).toBe('finished');
    expect(screenText(instance)).toBe('one\ntwo\n$ ');
    expect(instance.element.querySelector('.tlg__breakpoint')?.textContent).toBe('');
  });

  it('shows @type input in full', () => {
    const instance = mount('Proceed? [y/N] \n@type y', { autoplay: true, reducedMotion: true });
    expect(screenText(instance)).toBe('Proceed? [y/N] y\n$ ');
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

describe('mountTerminalogue: v0.1 compatibility', () => {
  // A block written against v0.1 must keep behaving exactly as it did.
  const V01 = ['@title Hello', '@prompt $', '', '$ echo hello', 'hello', '', '@wait 500ms', '', '$ echo world', 'world'].join(
    '\n',
  );

  // `echo hello` is nine ordinary characters at 100ms plus one space, which the
  // typing engine has always weighted at 1.8x.
  const TYPE_ECHO = 9 * 100 + 180;

  it('plays an untouched v0.1 block on exactly the v0.1 timeline', () => {
    const instance = mount(V01, { typingSpeed: 100 });
    instance.play();

    vi.advanceTimersByTime(100);
    expect(screenText(instance)).toBe('$ ');

    vi.advanceTimersByTime(TYPE_ECHO);
    expect(screenText(instance)).toBe('$ echo hello');

    vi.advanceTimersByTime(100 + 100); // submit, then the output line
    expect(screenText(instance)).toBe('$ echo hello\nhello');

    vi.advanceTimersByTime(100); // the blank line before @wait
    expect(screenText(instance)).toBe('$ echo hello\nhello\n');

    vi.advanceTimersByTime(499); // @wait 500ms must still be holding
    expect(screenText(instance)).toBe('$ echo hello\nhello\n');

    vi.advanceTimersByTime(1 + 100 + 100); // @wait done, blank line, second prompt
    expect(screenText(instance)).toBe('$ echo hello\nhello\n\n\n$ ');

    vi.advanceTimersByTime(60_000);
    expect(screenText(instance)).toBe('$ echo hello\nhello\n\n\n$ echo world\nworld\n$ ');
    expect(instance.state).toBe('finished');
    expect(pendingTimers()).toBe(0);
  });

  it('adds no breakpoints of its own to a v0.1 block', () => {
    const instance = mount(V01);
    instance.play();
    vi.advanceTimersByTime(60_000);
    expect(instance.state).toBe('finished');
    expect(instance.pauseReason).toBeNull();
  });

  it('starts at 1x, so v0.1 timings are the defaults', () => {
    expect(mount(V01).speed).toBe(1);
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

  it('never treats @type input or an @pause label as markup', () => {
    const instance = mount('Answer: \n@type <img src=x onerror=alert(1)>\n@pause <b>label</b>', {
      typingSpeed: 1,
      outputLineDelay: 1,
      commandSubmitDelay: 1,
    });
    instance.play();
    vi.advanceTimersByTime(60_000);

    const root = instance.element;
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(screenText(instance)).toContain('Answer: <img src=x onerror=alert(1)>');
    expect(root.querySelector('.tlg__breakpoint')?.textContent).toBe('<b>label</b>');
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
