import { parseTerminalogue } from '@terminalogue/core';
import { TERMINALOGUE_BROWSER_SCRIPT, TERMINALOGUE_CSS } from './generated/assets.js';
import {
  PAYLOAD_ATTRIBUTE,
  PLACEHOLDER_CLASS,
  RUNTIME_ELEMENT_ID,
  SIZE_ATTRIBUTE,
  STYLE_ELEMENT_ID,
  TERMINALOGUE_LANGUAGE,
  THEME_ATTRIBUTE,
  encodeDocument,
  fenceLanguage,
} from './placeholder.js';
import { TERMINALOGUE_SLIDE_CSS } from './slide-css.js';

/**
 * The Terminalogue markdown-it plugin, and the whole of the Marp integration.
 *
 * ```text
 * Markdown -> Marp / markdown-it -> termlogue fence -> Terminalogue core parser
 *          -> inert placeholder   -> browser-side Terminalogue renderer
 * ```
 *
 * Nothing here draws a terminal. The parser is `@terminalogue/core`, the
 * renderer is `@terminalogue/renderer` and the stylesheet is the shared one, so
 * a block converted by Marp is the same block VS Code and Obsidian render.
 */

/** The subset of markdown-it this plugin uses. Structural, so no dependency is needed. */
export interface MarkdownItLike {
  renderer: {
    rules: Record<string, RenderRuleLike | undefined>;
    renderToken(tokens: TokenLike[], index: number, options: unknown): string;
  };
  core: {
    ruler: {
      push(name: string, rule: CoreRuleLike): void;
      before(beforeName: string, name: string, rule: CoreRuleLike): void;
    };
  };
}

interface TokenLike {
  type: string;
  info: string;
  content: string;
  hidden?: boolean;
}

type RenderRuleLike = (
  tokens: TokenLike[],
  index: number,
  options: unknown,
  env: unknown,
  self: MarkdownItLike['renderer'],
) => string;

interface StateLike {
  inlineMode?: boolean;
  tokens: TokenLike[];
  Token: new (type: string, tag: string, nesting: number) => TokenLike;
}

type CoreRuleLike = (state: StateLike) => void;

/** Token type carrying the injected runtime. Rendered by the rule registered below. */
const ASSETS_TOKEN = 'terminalogue_assets';

/** Core rule names, kept distinct so a double `use()` is visible rather than silent. */
const ASSETS_RULE = 'terminalogue_assets';
const STYLE_RULE = 'terminalogue_style';

/**
 * Marpit's own rule for collecting global styles. Inserting a `marpit_style`
 * token ahead of it is how a plugin contributes CSS to the `<style>` element
 * Marp writes into the document head; see {@link registerStyle}.
 */
const MARPIT_STYLE_ASSIGN = 'marpit_style_assign';

/** Marks an instance Terminalogue has already been added to. */
const REGISTERED = Symbol.for('terminalogue.marp.registered');

/** Registers Terminalogue on a markdown-it (or Marp / Marpit) instance. */
export function terminaloguePlugin(md: MarkdownItLike): void {
  // Registering twice would inject the stylesheet and the runtime twice; the
  // second copy is harmless but pointless, so the second `use()` is a no-op.
  const marked = md as MarkdownItLike & { [REGISTERED]?: boolean };
  if (marked[REGISTERED] === true) return;
  marked[REGISTERED] = true;

  registerFence(md);
  const styleIsMarpits = registerStyle(md);
  registerAssets(md, styleIsMarpits);
}

/** Replaces ```termlogue fences with an inert placeholder carrying the parsed document. */
function registerFence(md: MarkdownItLike): void {
  const renderDefaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token && fenceLanguage(token.info) === TERMINALOGUE_LANGUAGE) {
      return renderPlaceholder(token.content);
    }
    // Every other fence belongs to whoever owned the rule before us: Marp Core
    // renders fences with Shiki, and a deck may add plugins of its own.
    return renderDefaultFence
      ? renderDefaultFence(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}

/**
 * Contributes the Terminalogue stylesheet.
 *
 * With Marpit driving, the CSS goes in as a `marpit_style` token: Marpit's
 * `marpit_style_assign` rule picks it up exactly as it picks up a `<style>`
 * block written in the Markdown, so the stylesheet lands in the `<style>`
 * element in the document head, scoped to the slide containers and ordered
 * after the deck's theme. That last part matters — it is what keeps a Marp
 * theme's rules from outranking Terminalogue's inside the terminal.
 *
 * Without Marpit — a bare markdown-it, or a test — there is no such rule, so
 * the stylesheet travels with the runtime instead. Returns whether Marpit took
 * it.
 */
function registerStyle(md: MarkdownItLike): boolean {
  const rule: CoreRuleLike = (state) => {
    if (state.inlineMode) return;
    if (!hasTerminalogueFence(state.tokens)) return;

    const token = new state.Token('marpit_style', '', 0);
    token.content = stylesheet();
    // Hidden: the token is a carrier for Marpit, never something to render.
    token.hidden = true;
    state.tokens.push(token);
  };

  try {
    md.core.ruler.before(MARPIT_STYLE_ASSIGN, STYLE_RULE, rule);
    return true;
  } catch {
    return false;
  }
}

/**
 * Appends the browser runtime, and the stylesheet when Marpit did not take it.
 *
 * The rule is pushed onto the end of the core chain, which runs after Marpit
 * has wrapped the slides, so the token lands outside every slide: the runtime
 * cannot affect a slide's layout, and a deck without a `termlogue` block gets
 * no runtime at all.
 *
 * Being outside every slide also means the runtime is not part of any one of
 * them, so it does not travel with a per-slide render. That is what an HTML
 * presentation wants, and it is the only output an animated terminal makes
 * sense in.
 */
function registerAssets(md: MarkdownItLike, styleIsMarpits: boolean): void {
  md.renderer.rules[ASSETS_TOKEN] = (tokens, index) => tokens[index]?.content ?? '';

  md.core.ruler.push(ASSETS_RULE, (state) => {
    if (state.inlineMode) return;
    if (!hasTerminalogueFence(state.tokens)) return;

    const token = new state.Token(ASSETS_TOKEN, '', 0);
    token.content = renderAssets(styleIsMarpits);
    state.tokens.push(token);
  });
}

/** True when the token stream contains at least one ```termlogue fence. */
function hasTerminalogueFence(tokens: readonly TokenLike[]): boolean {
  return tokens.some(
    (token) => token.type === 'fence' && fenceLanguage(token.info) === TERMINALOGUE_LANGUAGE,
  );
}

/** The shared stylesheet plus the one Marp-specific override. */
export function stylesheet(): string {
  return `${TERMINALOGUE_CSS}\n${TERMINALOGUE_SLIDE_CSS}`;
}

/**
 * Renders the hydration target for one block.
 *
 * The block source is parsed here, by the shared parser, and the resulting
 * document is percent-encoded into a data attribute. Nothing a block contains
 * reaches the page as markup: `encodeURIComponent` escapes `<`, `>`, `&` and
 * `"`, so `<script>alert(1)</script>` in a `termlogue` block is terminal text
 * and only ever terminal text.
 */
export function renderPlaceholder(source: string): string {
  const document = parseTerminalogue(source);
  const size = document.size;
  return (
    `<div class="${PLACEHOLDER_CLASS}"` +
    ` ${THEME_ATTRIBUTE}="${document.theme}"` +
    // Two validated integers and an `x`, or nothing at all for an
    // automatically sized block.
    (size === undefined ? '' : ` ${SIZE_ATTRIBUTE}="${size.columns}x${size.rows}"`) +
    ` ${PAYLOAD_ATTRIBUTE}="${encodeDocument(document)}"></div>\n`
  );
}

/** The `<style>` and `<script>` elements injected once per converted document. */
export function renderAssets(styleIsMarpits: boolean): string {
  const style = styleIsMarpits
    ? ''
    : `<style id="${STYLE_ELEMENT_ID}">${TERMINALOGUE_CSS}\n${TERMINALOGUE_SLIDE_CSS}</style>`;
  return `${style}<script id="${RUNTIME_ELEMENT_ID}">${TERMINALOGUE_BROWSER_SCRIPT}</script>\n`;
}
