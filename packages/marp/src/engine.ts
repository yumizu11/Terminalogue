import { terminaloguePlugin, type MarkdownItLike } from './markdown-it-plugin.js';

/**
 * A Marp CLI functional engine.
 *
 * Marp CLI calls this with its prepared Marp Core instance, which is the whole
 * point: Terminalogue extends the deck's real engine instead of replacing it,
 * so the Marp theme, `paginate`, headers, footers, backgrounds, maths, Shiki
 * highlighting and every other Marp directive keep working exactly as they do
 * without Terminalogue.
 *
 * Use it from a configuration file:
 *
 * ```js
 * // marp.config.mjs
 * export default { engine: '@terminalogue/marp' };
 * ```
 *
 * or point `--engine` straight at the bundled copy shipped as
 * `@terminalogue/marp/engine`.
 */

/** The part of a Marpit instance the engine touches. */
export interface MarpitLike {
  use(plugin: (md: MarkdownItLike) => void): MarpitLike;
}

/** Constructor options Marp CLI passes in, with the prepared instance attached. */
export interface MarpEngineOptions {
  readonly marp: MarpitLike;
}

/**
 * Adds Terminalogue to the Marp instance Marp CLI prepared.
 *
 * Deliberately an arrow function: Marp CLI tells a *functional* engine from an
 * engine *class* by looking for a prototype, and only a function without one is
 * called with the prepared `marp` instance.
 */
export const terminalogueEngine = ({ marp }: MarpEngineOptions): MarpitLike =>
  marp.use(terminaloguePlugin);

export default terminalogueEngine;
