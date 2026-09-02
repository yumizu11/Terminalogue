# Installing Nginx on RHEL 10

Open this file in the VS Code Markdown preview (`Ctrl+Shift+V` / `Cmd+Shift+V`) or in
Obsidian's Reading View. The block below is a plain code fence — nothing here is ever
executed.

```ugougo
Test
```

```termlogue
@title RHEL 10 — Install Nginx
@prompt [root@rhel10 ~]#

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx
@wait 700ms
Complete!

$ systemctl enable --now nginx

@wait 400ms

$ systemctl status nginx
● nginx.service - The nginx HTTP server
     Loaded: loaded
     Active: active (running)

$ curl http://localhost/
<!doctype html>
<html>
<head><title>Welcome to nginx!</title></head>
</html>
```

## Remote setup over SSH — `@type`, `@pause` and Copy Commands

This block demonstrates everything added in v0.2.

`@type` answers the interactive prompts that a plain `$ command` cannot express: the
text is typed onto the end of the line already on screen, so the confirmation question
below ends up reading `… (yes/no/[fingerprint])? yes` on one line. That output line ends
with a space on purpose — Terminalogue keeps trailing whitespace precisely so the answer
does not run into the question.

`@pause` stops playback where a presenter would stop to explain something. Press **Play**
to carry on from the breakpoint; its label appears in the title bar while it holds.

Then try the controls:

- **1× / 2× / 4×** scale every delay in the block, `@wait` included.
- **Instant** drops the delays but still honours `@pause`, so playback jumps to the next
  breakpoint rather than straight to the end.
- **Copy** puts only the four `$ command` lines on the clipboard — no prompts, no output,
  and not the `@type yes` either.

```termlogue
@title RHEL 10 — Remote Nginx Setup
@prompt [user@local ~]$

$ ssh root@rhel10
The authenticity of host 'rhel10' can't be established.
ED25519 key fingerprint is SHA256:8f2c9d1a4b6e0f37c5a8d92e1b04f76c3a5d8e91.
Are you sure you want to continue connecting (yes/no/[fingerprint])? 
@type yes

Warning: Permanently added 'rhel10' to the list of known hosts.
@pause SSH connection established

@prompt [root@rhel10 ~]#
$ dnf install -y nginx
Updating Subscription Management repositories.
Last metadata expiration check: 0:03:12 ago.
Dependencies resolved.
@pause Dependencies resolved

===============================================================================
 Package         Architecture  Version             Repository            Size
===============================================================================
Installing:
 nginx           x86_64        2:1.26.1-1.el10     rhel-10-appstream     41 k

@wait 800ms
Complete!

$ systemctl enable --now nginx

$ curl -s http://localhost/ | head -4
<!doctype html>
<html>
<head><title>Welcome to nginx!</title></head>
</html>
```

## A second, independent block

Each block plays on its own, playback speed included: pick **4×** above and this block
stays at 1×. It starts only when you scroll it into view, and it uses `@speed` to type
faster and `@clear` to wipe the screen partway through. `@speed` and the speed buttons
combine, so `@speed 35ms` played at 2× types a character every 17.5ms.

```termlogue
@title Checking the service
@prompt user@laptop:~$
@speed 35ms

$ curl -sI http://rhel10.example.com/ | head -1
HTTP/1.1 200 OK

@wait 500ms

@clear
$ echo "same renderer in VS Code and Obsidian"
same renderer in VS Code and Obsidian
```

## Escaping and literals

A leading `\` keeps a line as plain output, so a `$` or `@` can be shown verbatim.
Anything that looks like markup stays terminal text.

```termlogue
@title Escapes and safety

$ cat notes.txt
\$ this line is output, not a command
\@wait is shown literally
<script>alert(1)</script>
<img src=x onerror=alert(1)>
$HOME is left alone because there is no space after the dollar sign
```

## Parse errors stay inside the block

A mistake produces a diagnostic with a line number instead of breaking the page.

```termlogue
@title Diagnostics
@bogus something
@wait soon
@type

$ echo the rest of the block still plays
the rest of the block still plays
```
