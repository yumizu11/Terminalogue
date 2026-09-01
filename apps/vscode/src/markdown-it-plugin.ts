import type { MarkdownIt, RendererRule } from 'markdown-it';

/** Fenced code block language Terminalogue claims. */
export const TERMINALOGUE_LANGUAGE = 'termlogue';

/** Class name the preview script looks for. */
export const PLACEHOLDER_CLASS = 'terminalogue-block';

/** Attribute carrying the percent-encoded block source. */
export const SOURCE_ATTRIBUTE = 'data-terminalogue';

/**
 * markdown-it plugin turning ```termlogue blocks into an inert placeholder.
 *
 * The block source is percent-encoded into a data attribute rather than being
 * written into the document as markup. `encodeURIComponent` escapes `<`, `>`,
 * `&` and `"`, so nothing a block contains can break out of the attribute, and
 * the preview script only ever reads it back with `getAttribute`.
 */
export function terminaloguePlugin(md: MarkdownIt): MarkdownIt {
  const renderDefaultFence: RendererRule | undefined = md.renderer.rules.fence;

  const renderFence: RendererRule = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token && fenceLanguage(token.info) === TERMINALOGUE_LANGUAGE) {
      return renderPlaceholder(token.content);
    }
    // Leave every other fence to whoever owned the rule before us; VS Code
    // chains markdown-it plugins from several extensions.
    return renderDefaultFence
      ? renderDefaultFence(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };

  md.renderer.rules.fence = renderFence;
  return md;
}

/** Reads the language word from a fence info string such as `termlogue {highlight}`. */
export function fenceLanguage(info: string): string {
  return info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '';
}

/** Renders the hydration target for a single block. */
export function renderPlaceholder(source: string): string {
  return `<div class="${PLACEHOLDER_CLASS}" ${SOURCE_ATTRIBUTE}="${encodeURIComponent(source)}"></div>\n`;
}
