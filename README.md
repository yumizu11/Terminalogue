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
- [Example](#example)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Accessibility](#accessibility)
- [Security](#security)
- [Not in v0.1](#not-in-v01)

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

Live Preview renders the block as an ordinary code fence in v0.1. Reading View is
supported; full Live Preview support is future work.

---

## DSL

The v0.1 DSL is intentionally tiny. Every line in a `termlogue` block is one of four
things.

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
character. Blank lines are blank output lines. Leading whitespace is preserved.

### `@directive` — a directive

| Directive | Effect |
| --- | --- |
| `@title <text>` | Sets the terminal window title. |
| `@prompt <text>` | Prompt used by every command after this line. Defaults to `$`. |
| `@wait <duration>` | Pauses playback at this point. |
| `@speed <duration>` | Base per-character typing speed for the commands after this line. Defaults to `55ms`. |
| `@clear` | Clears the terminal screen. |

Durations are a number followed by `ms` or `s`: `800ms`, `1.5s`, `0.25s`. The unit is
required, so `@wait 500` is an error rather than a guess.

Directive names are matched case-insensitively. `@prompt` and `@speed` apply from their own
line onwards; `@title` applies to the whole block, and the last one wins.

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
Line 2: Unknown directive "@bogus". Supported directives are @title, @prompt, @wait, @speed and @clear.
Line 3: @wait: invalid duration "soon" (expected a number followed by "ms" or "s", e.g. 500ms or 1.5s).
```

A malformed block never throws, and never takes down the preview or the plugin.

### Playback

Blocks start playing when they first scroll into view, not when the document opens, so a
long page does not fire off every animation at once. A block that has finished is not
replayed by scrolling away and back. **Play/Pause** resumes where it left off; **Restart**
plays from the beginning. Every block on a page has entirely independent state.

---

## Example

See [`examples/nginx.md`](examples/nginx.md) for a full demonstration, including a second
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
instance.destroy();
```

`RendererOptions` covers timing (`typingSpeed`, `outputLineDelay`, `commandSubmitDelay`,
`startDelay`), jitter (`jitterMin`, `jitterMax`, and an injectable `random` so animation is
testable and reproducible), `autoplay` / `autoplayOnVisible`, `reducedMotion`, `controls`
and `labels`.

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

The test suite covers the parser (commands, output, all five directives, escapes, unknown
directives, malformed durations, blank lines, CRLF), the renderer under fake timers (typing
progression, pause/resume mid-frame, restart, `@wait`, and that `destroy()` leaves no
timers behind), the markdown-it plugin, and both host adapters running their real built
bundles in jsdom — including that re-rendering a document does not stack a second
animation.

The architecture is enforced by lint rules, not just convention: `packages/core` may not
reference `window`/`document`, neither shared package may import `vscode` or `obsidian`,
and `innerHTML`/`outerHTML`/`insertAdjacentHTML` are banned outright.

---

## Accessibility

- When `prefers-reduced-motion: reduce` is set, nothing autoplays and the finished terminal
  state is shown immediately. The reader can still start the animation explicitly.
- The animated screen is `aria-hidden`. Assistive technology reads a separate, complete
  transcript instead, so typing never produces a stream of per-character announcements.
- Controls carry `aria-label`s, and the Play/Pause label tracks the current state.
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
- Block content is never treated as trusted HTML. Text reaches the DOM through
  `textContent`; the VS Code placeholder carries the block source percent-encoded in a data
  attribute, so `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` render as
  literal terminal text. There are tests for exactly this, and the markup sinks are banned
  by lint.

If you are looking for a tool that *runs* the commands in your document, Terminalogue is
deliberately not it.

---

## Not in v0.1

Left out on purpose, to keep the DSL and the code small: real shell execution, terminal
recording, asciinema/VHS import, GIF or MP4 export, AI integration, syntax highlighting,
multiple themes, typo simulation, mouse animation, key simulation such as `Ctrl+C`, a
progress-bar DSL, SSH, an Obsidian-specific editor UI, and a custom VS Code webview.

No speculative abstractions were added for these either — but nothing is tightly coupled in
a way that would prevent adding them later.

---

## License

MIT. See [LICENSE](LICENSE).
