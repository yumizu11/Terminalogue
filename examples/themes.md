# Terminalogue themes

Open this file in the VS Code Markdown preview (`Ctrl+Shift+V` / `Cmd+Shift+V`) and in
Obsidian's Reading View. Every block below should look the same in both — nothing here is
ever executed.

A theme changes how a block is *painted* and nothing else. The prompt, the commands, the
output, the typing, `@wait`, `@pause`, the controls and the playback speed are identical in
all five. To see that for yourself, the first five blocks below run byte-for-byte the same
session, and differ only in their `@theme` line.

Watch the top-left corner of the title bar as you go down: `dark`, `light` and `ubuntu`
show the three window dots, while `powershell` and `cmd` show a console mark — `>_` and
`C:\` — because the terminals they stand for have no dots. It is a CSS glyph in the
terminal's own font, not an image or a vendor logo.

---

## Side by side

### `@theme dark` — the default

```termlogue
@theme dark
@title Deploying the site
@prompt user@host:~$

$ ./deploy.sh --production
Building bundle...
Uploading 42 files...
Overwrite existing release? [y/N] 
@type y
@wait 400ms
Done in 3.2s.
```

### `@theme light`

```termlogue
@theme light
@title Deploying the site
@prompt user@host:~$

$ ./deploy.sh --production
Building bundle...
Uploading 42 files...
Overwrite existing release? [y/N] 
@type y
@wait 400ms
Done in 3.2s.
```

### `@theme ubuntu`

```termlogue
@theme ubuntu
@title Deploying the site
@prompt user@host:~$

$ ./deploy.sh --production
Building bundle...
Uploading 42 files...
Overwrite existing release? [y/N] 
@type y
@wait 400ms
Done in 3.2s.
```

### `@theme powershell`

```termlogue
@theme powershell
@title Deploying the site
@prompt user@host:~$

$ ./deploy.sh --production
Building bundle...
Uploading 42 files...
Overwrite existing release? [y/N] 
@type y
@wait 400ms
Done in 3.2s.
```

### `@theme cmd`

```termlogue
@theme cmd
@title Deploying the site
@prompt user@host:~$

$ ./deploy.sh --production
Building bundle...
Uploading 42 files...
Overwrite existing release? [y/N] 
@type y
@wait 400ms
Done in 3.2s.
```

### No `@theme` at all

A block written before themes existed keeps exactly the look it always had: no `@theme`
means `dark`, so this block and the first one on this page are the same block.

```termlogue
@title Deploying the site
@prompt user@host:~$

$ ./deploy.sh --production
Building bundle...
Uploading 42 files...
Overwrite existing release? [y/N] 
@type y
@wait 400ms
Done in 3.2s.
```

---

## In context

Each theme paired with the prompt a reader would expect beside it. **The theme does not
choose the prompt** — `@theme powershell` renders a `$` prompt unless the block also says
`@prompt PS C:\Users\Administrator>`. The two directives are independent on purpose.

### Ubuntu

```termlogue
@theme ubuntu
@title Ubuntu Server
@prompt user@ubuntu:~$

$ sudo apt update
Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease
Reading package lists... Done

$ sudo apt install nginx
Reading package lists... Done
Building dependency tree... Done
@wait 600ms
Setting up nginx (1.24.0-2ubuntu7)...
Processing triggers for man-db (2.12.0-4build2)...
```

### Windows PowerShell

```termlogue
@theme powershell
@title Windows PowerShell
@prompt PS C:\Users\Administrator>

$ Get-Service WinRM
Status   Name               DisplayName
------   ----               -----------
Running  WinRM              Windows Remote Management (WS-Manag...

$ Get-Process -Name pwsh | Select-Object -First 1
 NPM(K)    PM(M)      WS(M)     CPU(s)      Id  SI ProcessName
 ------    -----      -----     ------      --  -- -----------
     72    82.11     104.23       4.09    7312   1 pwsh
```

### Command Prompt

```termlogue
@theme cmd
@title Command Prompt
@prompt C:\Users\Administrator>

$ ver

Microsoft Windows [Version 10.0.22631.4317]

$ ipconfig

Windows IP Configuration

Ethernet adapter Ethernet:

   Connection-specific DNS Suffix  . : localdomain
   IPv4 Address. . . . . . . . . . . : 192.168.1.10
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1
```

### Light

```termlogue
@theme light
@title Development Environment
@prompt ~/project $
@speed 35ms

$ npm install
added 125 packages, and audited 126 packages in 4s
@wait 500ms
found 0 vulnerabilities

$ npm test
 PASS  test/parser.test.ts
 PASS  test/renderer.test.ts
```

---

## Diagnostics

A theme name that does not exist is reported with its line number, and the block still
plays. Terminalogue never breaks the page over one.

```termlogue
@theme solarized
@title Unknown theme

$ echo the block still plays
the block still plays
```

A block has one theme, so a second `@theme` is reported too. The first one wins;
Terminalogue does not switch theme part-way through an animation.

```termlogue
@theme ubuntu
@theme dark
@title Duplicate theme

$ echo ubuntu wins
ubuntu wins
```
