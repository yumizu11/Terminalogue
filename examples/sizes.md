# Terminal sizes

Open this file in the VS Code Markdown preview (`Ctrl+Shift+V` / `Cmd+Shift+V`) and in
Obsidian's Reading View. Every block below should look the same in both — nothing here is
ever executed.

`@size <columns>x<rows>` fixes the terminal body at that many characters. The first number
is columns, the second is rows, and both describe the **terminal body**: the title bar and
the controls sit outside it and are not part of the count.

Without `@size` a block is sized automatically, exactly as every block was before this
directive existed. Watch the difference as the blocks below play: the automatic one grows
downwards line by line, and the fixed ones stay exactly where they started.

---

## Automatic size

No `@size`: the terminal is as tall as its content, and everything under it moves down as
the output arrives.

```termlogue
@theme dark
@title Automatic
@prompt user@host:~$

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx
Complete!
```

## `@size 80x24`

Eighty columns by twenty-four rows — the size a terminal has had since the VT100. The
block below is the same session as the one above, in a viewport that is already there
before the first character is typed.

```termlogue
@theme dark
@size 80x24
@title 80 by 24
@prompt user@host:~$

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx
Complete!
```

## `@size 50x10`

A smaller viewport, the same session. Nothing about playback changes: `@size` is
presentation and nothing else.

```termlogue
@theme dark
@size 50x10
@title 50 by 10
@prompt user@host:~$

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx
Complete!
```

---

## Scrolling inside a fixed terminal

More output than rows scrolls **inside** the terminal, the way a real one does: the window
keeps its size and the newest line stays in view. Press **Restart** to watch it happen
again, and scroll the terminal by hand once it has finished.

```termlogue
@theme ubuntu
@size 64x8
@title Eight rows
@prompt [root@rhel10 ~]#
@speed 25ms

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx-1.26.2-1.el10.x86_64
 nginx-core-1.26.2-1.el10.x86_64
 nginx-filesystem-1.26.2-1.el10.noarch
 openssl-3.2.2-1.el10.x86_64
Downloading packages...
Running transaction check
Running transaction test
Installing : nginx-filesystem
Installing : nginx-core
Installing : nginx
Complete!
```

## `@clear`, Restart and Pause keep the viewport

The terminal below clears itself half-way through. An empty fixed terminal is the same
size as a full one — `@clear` clears the content, never the viewport — and so is the one
you get after pressing **Restart** or **Pause**.

```termlogue
@theme ubuntu
@size 64x8
@title Clearing
@prompt [root@rhel10 ~]#

$ journalctl -u nginx --no-pager
Sep 01 09:12:01 rhel10 systemd[1]: Starting nginx...
Sep 01 09:12:01 rhel10 systemd[1]: Started nginx.
@pause About to clear
@clear
$ echo "same size, empty"
same size, empty
```

---

## Long lines still wrap

`@size` changes nothing about wrapping. A command wider than the terminal wraps as it
always has, and a wrapped line takes up as many rows on screen as it occupies — rows are
visual lines, not directives.

```termlogue
@theme light
@size 40x12
@title Forty columns
@prompt $

$ kubectl create deployment nginx --image=nginx --namespace=production
deployment.apps/nginx created
$ kubectl rollout status deployment/nginx --namespace=production --timeout=90s
deployment "nginx" successfully rolled out
```

## Wider than its container

A terminal never spills out of the note or the preview around it. `@size 200x12` asks for
two hundred columns; in a pane too narrow for them the terminal stops at the container's
width and the text wraps. The font is never shrunk to make the columns fit.

```termlogue
@theme light
@size 200x12
@title Two hundred columns
@prompt $

$ echo "as wide as the pane allows, and no wider"
as wide as the pane allows, and no wider
```

---

## Every theme, one size

`@size 60x9` in all five themes. A theme paints a terminal; it never measures one, so the
five blocks below hold the same nine rows of the same sixty columns.

```termlogue
@theme dark
@size 60x9
@title dark
@prompt user@host:~$

$ uname -sr
Linux 6.12.0-55.el10.x86_64
$ uptime
 09:14:02 up 3 days,  2:41,  1 user
```

```termlogue
@theme light
@size 60x9
@title light
@prompt user@host:~$

$ uname -sr
Linux 6.12.0-55.el10.x86_64
$ uptime
 09:14:02 up 3 days,  2:41,  1 user
```

```termlogue
@theme ubuntu
@size 60x9
@title ubuntu
@prompt user@host:~$

$ uname -sr
Linux 6.12.0-55.el10.x86_64
$ uptime
 09:14:02 up 3 days,  2:41,  1 user
```

```termlogue
@theme powershell
@size 60x9
@title powershell
@prompt PS C:\>

$ Get-ComputerInfo -Property WindowsProductName
WindowsProductName : Windows 11 Pro
$ Get-Uptime -Since
Saturday, 30 August 2025 06:33:11
```

```termlogue
@theme cmd
@size 60x9
@title cmd
@prompt C:\>

$ ver
Microsoft Windows [Version 10.0.26100.2314]
$ dir /b
notes.txt
```

---

## Diagnostics

An unusable size is reported in the block rather than silently ignored, and the block
still plays — automatically sized, as if the directive had not been written.

```termlogue
@title Bad sizes
@size 80
@size 10x24
@size 80x200

$ echo the block still plays
the block still plays
```
