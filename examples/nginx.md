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

## A second, independent block

Each block plays on its own. This one starts only when you scroll it into view, and it
uses `@speed` to type faster and `@clear` to wipe the screen partway through.

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

$ echo the rest of the block still plays
the rest of the block still plays
```
