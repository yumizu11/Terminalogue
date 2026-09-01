import { parseTerminalogue } from '@terminalogue/core';
import { mountTerminalogue, type TerminalogueInstance } from '@terminalogue/renderer';
import { MarkdownRenderChild, Plugin } from 'obsidian';

/** Fenced code block language Terminalogue claims. */
const TERMINALOGUE_LANGUAGE = 'termlogue';

/**
 * Ties one mounted Terminalogue instance to Obsidian's render lifecycle.
 *
 * Obsidian unloads the child when its container leaves the DOM, which is what
 * stops a re-render of the note from leaving the previous animation's timers
 * running.
 */
class TerminalogueRenderChild extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly instance: TerminalogueInstance,
    private readonly forget: (child: TerminalogueRenderChild) => void,
  ) {
    super(containerEl);
  }

  override onunload(): void {
    this.instance.destroy();
    this.forget(this);
  }
}

export default class TerminaloguePlugin extends Plugin {
  /** Live blocks, so plugin unload can tear down anything still on screen. */
  private readonly children = new Set<TerminalogueRenderChild>();

  override onload(): void {
    this.registerMarkdownCodeBlockProcessor(TERMINALOGUE_LANGUAGE, (source, element, context) => {
      // Shared parser, shared renderer: this adapter adds no terminal DOM of
      // its own, so a block looks and animates exactly as it does in VS Code.
      const document = parseTerminalogue(source);
      const instance = mountTerminalogue(element, document);

      const child = new TerminalogueRenderChild(element, instance, (self) => {
        this.children.delete(self);
      });
      this.children.add(child);
      context.addChild(child);
    });
  }

  override onunload(): void {
    for (const child of Array.from(this.children)) child.unload();
    this.children.clear();
  }
}
