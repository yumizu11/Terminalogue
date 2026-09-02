# Terminalogue

**Terminalogue turns Markdown code blocks into animated terminal sessions. Write commands
and sample output as plain text; Terminalogue makes them look like a real terminal
demonstration.**

Write a `termlogue` fenced code block:

````markdown
```termlogue
@title Installing Nginx on RHEL 10
@prompt [root@rhel10 ~]#

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
@wait 800ms
Complete!

$ systemctl enable --now nginx
```
````

…and the preview shows a terminal window in which the command is typed one character at a
time, with a little human-looking jitter, followed by its output appearing line by line.
The reader can play, pause, restart, pick a playback speed of **1× / 2× / 4× / Instant**,
and copy the block's commands to the clipboard.

Terminalogue targets two hosts, and deliberately shares almost everything between them:

| Host | Integration | Status |
| --- | --- | --- |
| Visual Studio Code | Built-in Markdown preview (`markdown-it` plugin + preview script) | Supported |
| Obsidian | `registerMarkdownCodeBlockProcessor("termlogue", …)` | Reading View supported; full Live Preview support is future work |

Both hosts run the same parser, the same renderer and the same stylesheet, so a block looks
and animates the same way in either one.

> **Commands are never executed.** See [Security](#security).

---

## Contents

- [Install](#install)
- [DSL](#dsl)
- [Controls](#controls)
- [Example](#example)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Accessibility](#accessibility)
- [Security](#security)
- [Not in v0.2](#not-in-v02)

---

## Install

### VS Code

Terminalogue extends the **built-in** Markdown preview; there is no custom preview or
webview to open. Install the extension, then press `Ctrl+Shift+V` (`Cmd+Shift+V` on macOS)
on any Markdown file containing a `termlogue` block.

From source:

```bash
pnpm install && pnpm build
```

Then either press <kbd>F5</kbd> in VS Code (the **Run Terminalogue VS Code extension**
launch configuration opens an Extension Development Host on `examples/nginx.md`), or
package and install a `.vsix`:

```bash
cd apps/vscode && npx @vscode/vsce package
```

### Obsidian

Until Terminalogue is in the community plugin browser, install it manually. Build it, then
copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/terminalogue/`:

```bash
pnpm install && pnpm build
pnpm --filter terminalogue-obsidian deploy -- "/path/to/your/vault"
```

Reload Obsidian and enable **Terminalogue** under *Settings → Community plugins*. Open a
note with a `termlogue` block in **Reading View**.

Live Preview renders the block as an ordinary code fence. Reading View is supported; full
Live Preview support is future work.

---

## DSL

The DSL is intentionally tiny. Every line in a `termlogue` block is one of four things.

### `$ command` — a typed command

```termlogue
$ dnf install -y nginx
```

The current prompt is printed, then the command is typed one character at a time. A command
line starts with `$` followed by a space (a bare `$` is an empty command line). The `$ ` is
DSL syntax, not part of what is displayed — with `@prompt [root@rhel10 ~]#` the line above
renders as `[root@rhel10 ~]# dnf install -y nginx`.

### Ordinary text — terminal output

Any other line is output. Output appears a whole line at a time, never character by
character. Blank lines are blank output lines. Whitespace is preserved exactly, **leading
and trailing** — a trailing space is what separates an interactive question from the
answer `@type` writes onto the same line.

### `@directive` — a directive

| Directive | Effect |
| --- | --- |
| `@title <text>` | Sets the terminal window title. |
| `@prompt <text>` | Prompt used by every command after this line. Defaults to `$`. |
| `@type <text>` | Types text onto the end of the line already on screen. |
| `@wait <duration>` | Waits for a fixed time before continuing. |
| `@pause [label]` | Stops playback until the reader presses Play. The label is optional. |
| `@speed <duration>` | Base per-character typing speed for the typing after this line. Defaults to `55ms`. |
| `@clear` | Clears the terminal screen. |

Durations are a number followed by `ms` or `s`: `800ms`, `1.5s`, `0.25s`. The unit is
required, so `@wait 500` is an error rather than a guess.

Directive names are matched case-insensitively. `@prompt` and `@speed` apply from their own
line onwards; `@title` applies to the whole block, and the last one wins.

#### `@type` — answering an interactive prompt

`$ command` models a fresh shell prompt, which is the wrong shape for the questions a
session asks along the way. `@type` types its text onto the end of whatever is currently
the last line on screen, one character at a time:

```termlogue
$ ssh server01
The authenticity of host 'server01' can't be established.
Are you sure you want to continue connecting (yes/no/[fingerprint])? 
@type yes
```

plays as the question growing an answer, and ends as a single line:

```
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
```

`@type` starts no line and prints no prompt of its own, so the spacing is yours to control
from the output line above it. `Password:` followed by `@type secret` gives
`Password:secret`; `Password: ` — with a trailing space — gives `Password: secret`.

It uses the same typing engine as `$ command`, jitter and all, so `@speed` applies to it
too. A bare `@type` with nothing to type is a diagnostic rather than a silent no-op.

#### `@pause` — a playback breakpoint

`@pause` stops playback where a presenter would stop to explain something. The reader
presses **Play** to continue from that point:

```termlogue
$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
@pause Dependencies resolved

Installing:
 nginx
Complete!
```

The label is optional (`@pause` on its own is fine); when present it is shown in the title
bar for as long as the breakpoint holds playback. `@pause` is a control event rather than a
duration, so playback speed does not shorten it, and **Instant** stops at it just the same.
**Restart** replays from the beginning and stops at the same breakpoints again.

### `\` — escapes

A leading backslash makes the rest of the line plain output, so lines that really do start
with `$ ` or `@` can be shown:

| Written | Displayed as output |
| --- | --- |
| `\$ not a command` | `$ not a command` |
| `\@title` | `@title` |
| `\\@title` | `\@title` |

A backslash that is not followed by `$`, `@` or `\` is just a backslash: `\path\to\file`
needs no escaping.

### Diagnostics

Unknown directives and malformed durations are not ignored. They produce a diagnostic with
a line number, rendered inside the block, and the rest of the block still plays:

```
Line 2: Unknown directive "@bogus". Supported directives are @title, @prompt, @type, @wait, @pause, @speed and @clear.
Line 3: @wait: invalid duration "soon" (expected a number followed by "ms" or "s", e.g. 500ms or 1.5s).
Line 4: @type expects the text to type, e.g. "@type yes"; a bare "@type" would type nothing at all.
```

A malformed block never throws, and never takes down the preview or the plugin.

---

## Controls

```
▶  ↻       1×  2×  4×  Instant       Copy
```

### Playback

Blocks start playing when they first scroll into view, not when the document opens, so a
long page does not fire off every animation at once. A block that has finished is not
replayed by scrolling away and back. **Play/Pause** resumes where it left off; **Restart**
plays from the beginning. Every block on a page has entirely independent state, playback
speed included.

Pressing **Pause** and reaching an `@pause` put the block in the same paused state; they
differ only in a reason (`manual` or `directive`) that the block exposes as
`data-pause-reason`. **Play** resumes from wherever playback stopped either way.

### Playback speed

| Speed | Effect |
| --- | --- |
| `1×` | The document's own timings. |
| `2×` | Every delay halved. |
| `4×` | Every delay quartered. |
| `Instant` | No delays at all. |

The multiplier divides every delay the document asks for — typing speed and its jitter,
output line delays, the pause before a command is submitted, and `@wait`:

```
effectiveDelay = documentDelay / multiplier      // and 0 for Instant
```

So `@speed 80ms` played at `2×` types a character every 40ms. `@pause` is the exception,
because it is a control event and not a duration.

**Instant ignores time, not control flow.** `@pause` still stops playback, `@clear` still
clears the screen, and pressing **Play** jumps to the next breakpoint rather than to the
end. Speed can be changed at any time, including mid-animation and while paused; the new
speed applies from the next step onwards, and survives **Restart**.

### Copy commands

**Copy** puts the block's `$ command` lines on the clipboard, one per line:

```
dnf install -y nginx
systemctl enable --now nginx
curl http://localhost/
```

Prompts, terminal output, `@type` input and every other directive are demonstration
material rather than something to paste into a shell, so none of it is included. The button
shows `Copied` for a moment, and is disabled for a block that contains no commands.

Copying uses the standard asynchronous Clipboard API, which both hosts provide. A host that
needs its own clipboard can inject one instead — `mountTerminalogue(…, { clipboard })` — so
the renderer stays host-agnostic.

**Terminalogue never executes commands.** Copy puts a string on the clipboard and stops
there; what happens to it afterwards is entirely up to the reader.

---

## Example

See [`examples/nginx.md`](examples/nginx.md) for a full demonstration: an SSH-and-Nginx
session exercising `@type`, `@pause`, Copy commands and all four speeds, plus a second
independent block, escapes, hostile-looking output and a block with deliberate parse
errors. Open it in the VS Code Markdown preview and in Obsidian's Reading View — the
terminal should look and behave the same in both.

---

## Repository layout

```
terminalogue/
  packages/
    core/          @terminalogue/core     — DSL parser, AST, durations, diagnostics
    renderer/      @terminalogue/renderer — DOM rendering, animation, the stylesheet
  apps/
    vscode/        markdown-it plugin + Markdown preview script
    obsidian/      registerMarkdownCodeBlockProcessor adapter
  examples/
```

`packages/core` is pure TypeScript: no DOM, no VS Code, no Obsidian. Its entry point is

```ts
parseTerminalogue(source: string): TerminalogueDocument
```

`packages/renderer` turns that document into DOM and animates it. It depends on the DOM but
on neither host:

```ts
const instance = mountTerminalogue(container, document, options);
instance.play();
instance.pause();
instance.restart();
instance.setSpeed(4); // 1 | 2 | 4 | 'instant'
await instance.copyCommands();
instance.destroy();

instance.state; // 'idle' | 'playing' | 'paused' | 'finished' | 'destroyed'
instance.pauseReason; // 'manual' | 'directive' | null
instance.speed;
```

`RendererOptions` covers timing (`typingSpeed`, `outputLineDelay`, `commandSubmitDelay`,
`startDelay`), jitter (`jitterMin`, `jitterMax`, and an injectable `random` so animation is
testable and reproducible), `autoplay` / `autoplayOnVisible`, the initial `speed`,
`copyFeedbackDelay`, an injectable `clipboard`, `reducedMotion`, `controls` and `labels`.

Both new directives stay inside the shared packages. `@type` and `@pause` become
`TypeStep` and `PauseStep` in the core AST; the renderer turns a `TypeStep` into frames
from the *same* typing engine `$ command` uses, and a `PauseStep` into a frame the one
player treats as a breakpoint. `toCommands(document)` — also in core — is what Copy
commands copies. Neither host adapter reimplements any of it.

The two apps are thin adapters. Neither reimplements any terminal DOM, CSS or animation:
the VS Code preview script and the Obsidian code block processor both call the same
`mountTerminalogue`, and both ship a byte-identical copy of
`packages/renderer/src/terminalogue.css` (a test asserts this).

---

## Development

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm build      # builds core, renderer, then both apps
pnpm test       # vitest for core and renderer, node:test for the two adapters
pnpm lint
pnpm check      # build + lint + test
```

Watch mode for the hosts:

```bash
pnpm --filter terminalogue-vscode watch
pnpm --filter terminalogue-obsidian watch
```

The test suite covers the parser (commands, output, all seven directives, escapes, unknown
directives, malformed durations, preserved trailing whitespace, blank lines, CRLF,
transcript and command extraction), the renderer under fake timers (typing progression for
both `$ command` and `@type`, pause/resume mid-frame, restart, `@wait`, `@pause` at every
speed, the 1× / 2× / 4× / Instant multipliers, clipboard copying through an injected
adapter, and that `destroy()` leaves behind no timer — animation or copy-feedback — and no
observer), the markdown-it plugin, and both host adapters running their real built bundles
in jsdom — including that re-rendering a document does not stack a second animation.

The architecture is enforced by lint rules, not just convention: `packages/core` may not
reference `window`/`document`, neither shared package may import `vscode` or `obsidian`,
and `innerHTML`/`outerHTML`/`insertAdjacentHTML` are banned outright.

---

## Accessibility

- When `prefers-reduced-motion: reduce` is set, nothing autoplays and the finished terminal
  state is shown immediately. The reader can still start the animation explicitly.
- The animated screen is `aria-hidden`. Assistive technology reads a separate, complete
  transcript instead, so typing never produces a stream of per-character announcements.
- Every control is a real `<button>`, so all of them — Play/Pause, Restart, the four
  speeds and Copy — are reachable by keyboard and activate on Enter and Space with no
  extra wiring.
- Controls carry `aria-label`s, and the Play/Pause and Copy labels track the current state.
  The speed buttons are one `role="group"` labelled *Playback speed*, and the selected
  speed is marked with `aria-pressed="true"` rather than by colour alone.
- The label of an `@pause` currently holding playback is announced through a
  `role="status"` region, so a reader who cannot see the title bar still learns why
  playback stopped.
- The stylesheet sets every visual property on Terminalogue's own elements, and falls back
  across `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` rather than
  depending on one platform's font.

---

## Security

**Terminalogue never executes anything.** It is a display-only Markdown extension: a
`termlogue` block is prose that happens to look like a shell session.

- No shell, no `child_process`, no terminal API, no VS Code task or terminal integration.
- No `eval`, no `new Function`.
- No network requests. Terminalogue is entirely client-side and works offline.
- Copy commands only ever writes a string to the clipboard. It does not read the clipboard,
  and nothing in Terminalogue runs what it copied.
- Block content is never treated as trusted HTML. Text reaches the DOM through
  `textContent`; the VS Code placeholder carries the block source percent-encoded in a data
  attribute, so `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` render as
  literal terminal text — from an output line, a title, a prompt or an `@type` alike. There
  are tests for exactly this, and the markup sinks are banned by lint.

If you are looking for a tool that *runs* the commands in your document, Terminalogue is
deliberately not it.

---

## Not in v0.2

Left out on purpose, to keep the DSL and the code small: real shell execution, terminal
recording, asciinema/VHS import, GIF or MP4 export, AI integration, syntax highlighting,
multiple themes, fullscreen, masked passwords and `@type --masked`, typo and backspace
simulation, mouse animation, key simulation such as `@key`, `Ctrl+C`, arrow keys or Tab
completion, marker navigation over `@pause` labels, a seek bar, timeline, progress bar or
spinner, an Obsidian-specific editor UI, and a custom VS Code webview.

No speculative abstractions were added for these either — but nothing is tightly coupled in
a way that would prevent adding them later.

---

## License

MIT. See [LICENSE](LICENSE).
