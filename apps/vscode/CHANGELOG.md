# Changelog

All notable changes to the Terminalogue VS Code extension are documented here.

## 0.4.0

Terminalogue gained a third host in this release: `termlogue` blocks now animate inside
Marp HTML presentations, through a new `@terminalogue/marp` package and a companion
Obsidian plugin, **Terminalogue Presenter**.

### Notes

- The VS Code extension itself is unchanged. It is versioned in lockstep with the shared
  parser, renderer and stylesheet, which gained no new behaviour either: Marp reuses them
  exactly as this extension does, which is the whole point of the release.
- Nothing about the DSL, the themes, the controls or the security model changed. A block
  written for 0.1, 0.2 or 0.3 renders identically.

## 0.3.0

### Added

- `@theme` — five built-in themes: `light`, `dark`, `ubuntu`, `powershell` and `cmd`.
  Theme names are matched case-insensitively.
- The `powershell` and `cmd` themes wear a console mark (`>_` and `C:\`) in the title bar
  instead of the three window dots. It is drawn in CSS, with no image or vendor logo.
- Diagnostics for an unknown theme name and for a duplicate `@theme` in one block.

### Notes

- A theme is presentation only: it changes no prompt, no command, no timing and no playback
  behaviour.
- A block with no `@theme` renders as `dark`, which is exactly how every block looked
  before this release. Documents written for 0.1 and 0.2 are unchanged.

## 0.2.0

### Added

- `@type` — types text onto the end of the line already on screen, for answering an
  interactive question such as `Proceed? [y/N]`.
- `@pause` — a playback breakpoint with an optional label, shown in the title bar while it
  holds playback.
- **Copy commands** — copies the block's `$ command` lines to the clipboard, and nothing
  else.
- A playback speed selector: **1× / 2× / 4× / Instant**. Instant skips time, not control
  flow, so `@pause` still stops playback.

## 0.1.0

Initial release: `termlogue` fenced code blocks rendered into the built-in Markdown preview
as an animated terminal session, with `$ command`, terminal output, `@title`, `@prompt`,
`@wait`, `@speed` and `@clear`, Play / Pause / Restart controls, autoplay when a block
first scrolls into view, `prefers-reduced-motion` support and parse diagnostics rendered
inside the block.
