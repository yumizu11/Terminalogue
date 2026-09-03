# Changelog

All notable changes to the Terminalogue VS Code extension are documented here.

## 0.5.2

### Fixed

- Terminalogue Presenter set two styles on its settings tab from JavaScript, which
  Obsidian's plugin review rejects (`obsidianmd/no-static-styles-assignment`): a theme
  cannot restyle what a plugin writes inline. The status line now uses Obsidian's own
  `setting-item-description` class, so it follows the theme like every other description
  in the settings.

### Changed

- The Marketplace listing opens with an animation of a `termlogue` block becoming a
  terminal, because "animated terminal sessions" is hard to picture from words alone.

### Notes

- The extension's behaviour is unchanged, as are the parser, the renderer, the stylesheet
  and the Marp integration. It is versioned in lockstep with them; 0.5.2 is the first
  version of this release line published to the Marketplace, since 0.5.2 itself changed
  only the companion Obsidian plugin.
- Inline styles in a host adapter are now a lint error rather than something to notice in
  review. The shared renderer is deliberately exempt: `@size` writes two validated numbers
  into CSS custom properties with `style.setProperty`, which is the only way that works in
  all three hosts, and which Obsidian's own rule does not object to either — it flags
  literal values, not computed ones.

## 0.5.1

### Changed

- The `powershell` theme is 20% darker: every colour in its palette dimmed to 80% of its
  previous value, with hue and saturation untouched, so it is the same console with the
  brightness turned down rather than a different palette.

### Notes

- Contrast was re-checked after the change and every pair still clears WCAG AA comfortably:
  terminal text 8.96:1, the window title and controls 5.80:1, the selected speed 6.13:1 and
  the diagnostics box 5.87:1, with the focus outline at 5.18:1 and the cursor at 8.96:1
  against the 3:1 non-text threshold.
- Presentation only, and only for `powershell`: no other theme changed, and nothing about the
  DSL, the controls, playback or the security model did either.

## 0.5.0

### Added

- `@size <columns>x<rows>` — a fixed terminal viewport, e.g. `@size 80x24`. The size applies
  to the terminal body: the title bar and the controls are not counted in the rows.
- The area is reserved from the first render, so a block no longer grows as it plays and
  nothing under it moves. `@clear`, Pause, Restart and every playback speed keep it.
- Output taller than the rows scrolls inside the terminal, following the newest line while
  a block is playing.
- Diagnostics for a malformed size, a size outside the supported range (columns 20–240,
  rows 5–100) and a duplicate `@size` in one block.

### Notes

- A block with no `@size` is sized automatically, exactly as every block was before this
  release. Documents written for 0.1 through 0.4 render identically.
- `@size` is presentation metadata for the whole block: it changes no prompt, no command,
  no timing and no playback behaviour, and there is no way to resize a terminal part-way
  through one. All five themes share the same terminal metrics, so a size means the same
  thing in each of them.
- The terminal never grows wider than the preview pane. Long lines keep the wrapping they
  have always had; the font is not scaled to fit the columns.

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
