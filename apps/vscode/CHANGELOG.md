# Changelog

All notable changes to the Terminalogue VS Code extension are documented here.

## 0.6.0

### Added

- `@typo <probability>` — simulated typing mistakes, e.g. `@typo 0.02` for a 2% chance per
  typed character. When a character slips, the finger lands on the key immediately to its
  left or right on the same QWERTY row; the wrong character appears, is backspaced away,
  and the intended one is typed after all.
- It applies to `$ command` lines and `@type` input through the one typing engine both
  already shared. Terminal output is not typed, so it never slips.
- `@typo` is a typing setting like `@speed`: it applies from its own line onwards and can
  be changed part-way through a block, so `@typo 0` turns it off again.
- Uppercase letters slip to uppercase neighbours — `G` to `F` or `H`, never to a lowercase
  `h`. Characters the layout does not contain — spaces, shifted symbols, Japanese, emoji —
  are typed correctly.
- Diagnostics for a missing, unparsable or out-of-range probability. The valid range is 0
  to 1 inclusive; `2%` is not a supported spelling.

### Notes

- **The default is off.** A block without `@typo` has a probability of 0, draws no random
  number to decide otherwise, and builds exactly the timeline it built before — every
  document written against 0.5 and earlier types precisely as it always did.
- A typo is a playback effect and lives nowhere else. The parsed document keeps the command
  the author wrote, so **Copy commands**, the accessible transcript and the finished screen
  are untouched however much playback slipped. Nothing is ever executed, and the wrong
  character is drawn with the same `textContent` path as every other character.
- The slip is timed in typing beats rather than fixed milliseconds, so `@speed` scales it,
  the **1× / 2× / 4×** buttons scale it again, and the existing jitter applies to it too.
  **Instant** and `prefers-reduced-motion` show no typing animation and therefore no typos.
- Where the slips fall is drawn once, when a block is built, for the same reason jitter is:
  **Restart** replays the session rather than a new one, and pausing in the middle of a
  correction resumes it intact.
- Scope was kept deliberately narrow — one slip, horizontal only. No vertical neighbours,
  no key geometry, no other keyboard layout, no Shift or Caps Lock simulation, no doubled,
  dropped or transposed characters, and no mark on the finished transcript saying a typo
  happened. No dependency was added.
- All three hosts get it from the shared parser and renderer, so a block types the same way
  in the VS Code preview, in Obsidian's Reading View and on a Marp slide.

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
