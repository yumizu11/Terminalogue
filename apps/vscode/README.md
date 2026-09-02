# Terminalogue

**Turn Markdown code blocks into animated terminal sessions.** Write commands and sample
output as plain text; Terminalogue plays them back in the built-in Markdown preview as if
someone were typing at a real terminal.

Write a `termlogue` fenced code block:

````markdown
```termlogue
@theme ubuntu
@title Installing Nginx
@prompt user@ubuntu:~$

$ sudo apt install nginx
Reading package lists... Done
Building dependency tree... Done
@wait 800ms
Setting up nginx...
```
````

…and the preview shows a terminal window in which the command is typed one character at a
time, with a little human-looking jitter, followed by its output appearing line by line.
The reader can play, pause, restart, pick a playback speed of **1× / 2× / 4× / Instant**,
and copy the block's commands to the clipboard.

> **Commands are never executed.** Terminalogue is display-only — see [Security](#security).

## Getting started

Terminalogue extends the **built-in** Markdown preview; there is no custom preview or
webview to open. Install the extension, then press `Ctrl+Shift+V` (`Cmd+Shift+V` on macOS)
on any Markdown file containing a `termlogue` block.

Blocks start playing when they first scroll into view, so a long page does not fire off
every animation at once.

## The DSL

Every line in a `termlogue` block is one of four things.

| Line | Meaning |
| --- | --- |
| `$ command` | A command, typed one character at a time. The `$ ` is syntax, not output. |
| Anything else | Terminal output, revealed a whole line at a time. Whitespace is preserved exactly. |
| `@directive` | A directive (below). |
| `\…` | An escape: `\$ x` and `\@title` show a literal `$` or `@`. |

| Directive | Effect |
| --- | --- |
| `@title <text>` | Sets the terminal window title. |
| `@theme <name>` | Visual theme: `light`, `dark`, `ubuntu`, `powershell`, `cmd`. Defaults to `dark`. |
| `@prompt <text>` | Prompt used by every command after this line. Defaults to `$`. |
| `@type <text>` | Types text onto the end of the line already on screen — how you answer an interactive question. |
| `@wait <duration>` | Waits for a fixed time before continuing. |
| `@pause [label]` | Stops playback until the reader presses Play. The label is optional. |
| `@speed <duration>` | Base per-character typing speed. Defaults to `55ms`. |
| `@clear` | Clears the terminal screen. |

Durations are a number followed by `ms` or `s`: `800ms`, `1.5s`. Unknown directives,
malformed durations and unknown theme names produce a diagnostic with a line number,
rendered inside the block — a mistake never breaks the preview.

## Themes

| Theme | Looks like |
| --- | --- |
| `dark` | A modern developer terminal. **The default.** |
| `light` | A white screen with near-black text, for light documents and printed pages. |
| `ubuntu` | Ubuntu's terminal: deep aubergine screen, warm orange accent. |
| `powershell` | Classic Windows PowerShell: solid blue console, console-yellow prompt. |
| `cmd` | The classic Windows Command Prompt: black screen, silver text, no ornament. |

A theme changes colours and nothing else. In particular it does not touch the prompt —
`@theme powershell` still renders a `$` unless the block also says
`@prompt PS C:\Users\Administrator>`. All five themes clear WCAG AA contrast, and none of
them depends on a platform-specific font, so `powershell` and `cmd` render correctly on
macOS and Linux too.

## Controls

```
▶  ↻       1×  2×  4×  Instant       Copy
```

**Play/Pause** resumes where it left off; **Restart** plays from the beginning. The speed
multiplier divides every delay the document asks for, and **Instant** drops delays
altogether — but it ignores *time*, not control flow, so `@pause` still stops playback.
Every block on a page has entirely independent state.

**Copy** puts the block's `$ command` lines on the clipboard, one per line. Prompts,
terminal output and `@type` input are demonstration material, so none of it is included.

## Accessibility

- With `prefers-reduced-motion: reduce`, nothing autoplays and the finished terminal state
  is shown immediately.
- The animated screen is `aria-hidden`; assistive technology reads a separate, complete
  transcript instead, so typing never produces per-character announcements.
- Every control is a real `<button>` with an `aria-label`, reachable by keyboard. The
  selected speed is marked with `aria-pressed`, not by colour alone.

## Security

**Terminalogue never executes anything.** A `termlogue` block is prose that happens to look
like a shell session.

- No shell, no `child_process`, no terminal or task integration. No `eval`. No network
  requests — it is entirely client-side and works offline.
- Copy only ever writes a string to the clipboard. It does not read the clipboard, and
  nothing runs what it copied.
- Block content is never treated as trusted HTML: text reaches the DOM through
  `textContent`, so `<script>alert(1)</script>` renders as literal terminal text.

The extension is enabled in untrusted workspaces and in virtual workspaces, because it only
ever renders text.

## Also for Obsidian

The same parser, renderer and stylesheet ship as an Obsidian plugin, so a block looks and
animates identically in both. See the
[repository](https://github.com/yumizu11/Terminalogue).

## License

MIT. See [LICENSE](https://github.com/yumizu11/Terminalogue/blob/main/LICENSE).
