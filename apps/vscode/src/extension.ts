import type { MarkdownIt } from 'markdown-it';
import { terminaloguePlugin } from './markdown-it-plugin.js';

/**
 * Terminalogue extends the built-in Markdown preview rather than shipping a
 * preview of its own: `contributes.markdown.markdownItPlugins` brings us here,
 * and `markdown.previewScripts` / `markdown.previewStyles` supply the renderer
 * and the shared stylesheet.
 *
 * The extension host never parses or executes anything. It only rewrites
 * ```termlogue fences into a placeholder element.
 */
export function activate(): { extendMarkdownIt(md: MarkdownIt): MarkdownIt } {
  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return md.use(terminaloguePlugin);
    },
  };
}

export function deactivate(): void {
  // Nothing to tear down: all state lives in the preview webview.
}
