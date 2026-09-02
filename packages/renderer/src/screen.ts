import { clearChildren, el } from './dom.js';

/** A single mutation of the terminal screen. */
export type ScreenOp =
  | { type: 'command-start'; prompt: string }
  | { type: 'input-start' }
  | { type: 'type'; char: string }
  | { type: 'submit' }
  | { type: 'output'; text: string }
  | { type: 'clear' }
  | { type: 'noop' };

/**
 * Owns the terminal screen DOM and applies {@link ScreenOp}s to it.
 *
 * The screen itself is `aria-hidden`; assistive technology reads the separate
 * transcript element instead, so typing does not produce per-character
 * announcements.
 */
export class Screen {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly cursor: HTMLElement;
  /** Where `type` characters currently land: a command or a typed answer. */
  private activeText: HTMLElement | null = null;

  constructor(doc: Document) {
    this.doc = doc;
    this.root = el(doc, 'div', 'tlg__screen');
    this.root.setAttribute('aria-hidden', 'true');
    this.cursor = el(doc, 'span', 'tlg__cursor');
    this.cursor.setAttribute('aria-hidden', 'true');
  }

  apply(op: ScreenOp): void {
    switch (op.type) {
      case 'command-start': {
        const line = el(this.doc, 'div', 'tlg__line tlg__line--command');
        if (op.prompt !== '') {
          line.appendChild(el(this.doc, 'span', 'tlg__prompt', op.prompt));
          line.appendChild(this.doc.createTextNode(' '));
        }
        const text = el(this.doc, 'span', 'tlg__command', '');
        line.appendChild(text);
        line.appendChild(this.cursor);
        this.root.appendChild(line);
        this.activeText = text;
        break;
      }
      case 'input-start': {
        // `@type` answers a prompt that is already on screen, so it continues
        // the last line instead of opening one of its own. With nothing on
        // screen yet there is nothing to answer, so a line is started.
        const line =
          this.root.lastElementChild ??
          this.root.appendChild(el(this.doc, 'div', 'tlg__line tlg__line--output', ''));
        const text = el(this.doc, 'span', 'tlg__input', '');
        line.appendChild(text);
        line.appendChild(this.cursor);
        this.activeText = text;
        break;
      }
      case 'type': {
        if (this.activeText) this.activeText.textContent += op.char;
        break;
      }
      case 'submit': {
        this.activeText = null;
        this.detachCursor();
        break;
      }
      case 'output': {
        this.root.appendChild(el(this.doc, 'div', 'tlg__line tlg__line--output', op.text));
        break;
      }
      case 'clear': {
        this.detachCursor();
        clearChildren(this.root);
        this.activeText = null;
        break;
      }
      case 'noop':
        // `@wait` only consumes time; the screen is untouched.
        break;
    }
    this.scrollToBottom();
  }

  /** Appends the resting prompt line with the blinking cursor. */
  showIdlePrompt(prompt: string): void {
    this.detachCursor();
    const line = el(this.doc, 'div', 'tlg__line tlg__line--idle');
    if (prompt !== '') {
      line.appendChild(el(this.doc, 'span', 'tlg__prompt', prompt));
      line.appendChild(this.doc.createTextNode(' '));
    }
    line.appendChild(this.cursor);
    this.root.appendChild(line);
    this.scrollToBottom();
  }

  reset(): void {
    this.detachCursor();
    clearChildren(this.root);
    this.activeText = null;
    this.root.scrollTop = 0;
  }

  /** The visible screen contents as plain text, used by tests. */
  get text(): string {
    return Array.from(this.root.children)
      .map((child) => child.textContent ?? '')
      .join('\n');
  }

  private detachCursor(): void {
    this.cursor.remove();
  }

  private scrollToBottom(): void {
    this.root.scrollTop = this.root.scrollHeight;
  }
}
