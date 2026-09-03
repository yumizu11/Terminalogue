---
marp: true
theme: default
paginate: true
---

# Installing Nginx

A Terminalogue block on a Marp slide: the same parser, the same renderer and the
same stylesheet as the VS Code Markdown preview and Obsidian's Reading View.

```termlogue
@theme ubuntu
@title RHEL 10
@prompt [root@rhel10 ~]#

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.

@pause Dependencies resolved

Installing:
 nginx

@wait 700ms
Complete!
```

---

# A slide-sized terminal

`@size 72x16` fixes the terminal body at seventy-two columns by sixteen rows, so the
slide is laid out before the animation starts and nothing on it moves while the
terminal types. Columns and rows are measured in the slide's own terminal font.

```termlogue
@theme ubuntu
@size 72x16
@title RHEL 10
@prompt [root@rhel10 ~]#

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx
Complete!
```

---

# More output than rows

The terminal below has room for ten rows and prints more than ten lines. It scrolls
inside itself, exactly as a real terminal does: the slide keeps its layout, and the
newest line stays in view.

```termlogue
@theme dark
@size 72x10
@title Scrolling
@prompt [root@rhel10 ~]#
@speed 20ms

$ dnf install -y nginx
Updating repositories...
Dependencies resolved.
Installing:
 nginx-1.26.2-1.el10.x86_64
 nginx-core-1.26.2-1.el10.x86_64
 nginx-filesystem-1.26.2-1.el10.noarch
Downloading packages...
Running transaction check
Running transaction test
Complete!
```

---

# Starting Nginx

Playback starts when this slide comes on screen, and stops there: a block on a
slide the reader has not reached yet stays quiet.

```termlogue
@theme dark
@prompt [root@rhel10 ~]#

$ systemctl enable --now nginx

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

---

# Answering a prompt

`@type` types onto the end of the line already on screen, so the question below
reads as one line. `@pause` stops playback where a presenter would stop to
explain something; press **Play** to carry on.

```termlogue
@theme light
@title Remote setup
@prompt [user@local ~]$

$ ssh root@rhel10
The authenticity of host 'rhel10' can't be established.
Are you sure you want to continue connecting (yes/no/[fingerprint])? 
@type yes

Warning: Permanently added 'rhel10' to the list of known hosts.
@pause SSH connection established

$ uname -sr
Linux 6.12.0-55.el10.x86_64
```

---

# Two consoles, two themes

A Marp theme and a Terminalogue theme are different things: this deck is
`theme: default` throughout, while each block picks its own terminal.

```termlogue
@theme powershell
@title Windows
@prompt PS C:\>
@speed 35ms

$ Get-Service -Name nginx

Status   Name    DisplayName
------   ----    -----------
Running  nginx   nginx
```

```termlogue
@theme cmd
@prompt C:\>

$ curl -s -o NUL -w "%{http_code}" http://localhost/
200
```

---

# Nothing here is executed

A `termlogue` block is prose that looks like a shell session. Terminalogue never
runs it — not in VS Code, not in Obsidian, and not in a Marp presentation.
Anything that looks like markup stays terminal text.

```termlogue
@theme dark
@title Escapes and safety

$ cat notes.txt
\$ this line is output, not a command
\@wait is shown literally
<script>alert(1)</script>
<img src=x onerror=alert(1)>
```

---

# Diagnostics stay in their block

One mistake does not break the presentation around it.

```termlogue
@title Diagnostics
@bogus something
@wait soon

$ echo the rest of the block still plays
the rest of the block still plays
```
