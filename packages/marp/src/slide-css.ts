/**
 * The only Terminalogue CSS that is specific to Marp.
 *
 * A Marp slide is a fixed 1280x720 canvas that the browser scales to the
 * viewport, so the shared stylesheet's editor-sized 13px terminal would end up
 * roughly a third of the size of a slide's body text. This block re-values the
 * one custom property the shared stylesheet already exposes for exactly this
 * purpose and changes nothing else: no colour, no theme, no layout rule and no
 * playback behaviour, so a block still looks like the same terminal it does in
 * VS Code and in Obsidian.
 *
 * Every selector here is inside `.tlg`. Terminalogue never styles `section`,
 * `body`, `pre` or `code`, so a Marp theme — built-in or custom — keeps the
 * whole slide to itself.
 */
export const TERMINALOGUE_SLIDE_CSS = `/* Terminalogue: slide-sized terminal (Marp only). */
.tlg {
  --tlg-font-size: 18px;
  margin: 0.6em 0;
}
`;
