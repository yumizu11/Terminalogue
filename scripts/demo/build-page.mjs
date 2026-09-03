import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

/**
 * Builds the page the README animation is recorded from.
 *
 *   pnpm build && node scripts/demo/build-page.mjs
 *
 * It shows the block as it is written next to the terminal it becomes, which is
 * the one thing a still screenshot cannot say. Everything on the right is the
 * shared renderer and the shared stylesheet — the animation in the README is
 * the animation the plugin produces, not a mock-up of it.
 *
 * See "Regenerating the README animation" in the README for the two commands
 * that turn this page into `docs/images/terminalogue.gif`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const source = readFileSync(resolve(here, 'demo.termlogue'), 'utf8')
  .replace(/\r\n?/g, '\n')
  .trim();

const bundle = await esbuild.build({
  entryPoints: [resolve(here, 'entry.mjs')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  write: false,
});

const css = readFileSync(resolve(root, 'packages/renderer/src/terminalogue.css'), 'utf8');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Terminalogue</title>
<style>${css}</style>
<style>
  /* GitHub's dark canvas: the corners outside the terminal's own radius read as
     part of the card on a light page, and disappear on a dark one. */
  html, body { margin: 0; padding: 0; background: #0d1117; color: #c9d1d9; }
  #frame {
    display: inline-flex;
    align-items: flex-start;
    gap: 22px;
    padding: 18px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .pane { display: flex; flex-direction: column; gap: 8px; }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #7d8590;
    padding-left: 2px;
  }
  .source {
    margin: 0;
    padding: 12px 14px;
    width: 32ch;
    border: 1px solid #30363d;
    border-radius: 8px;
    background: #161b22;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre;
    color: #8b949e;
  }
  .fence { color: #6e7681; }
  .directive { color: #79c0ff; }
  .command { color: #e6edf3; font-weight: 600; }
  /* Bigger than an editor's 13px: a README is read at arm's length. */
  #frame .tlg { --tlg-font-size: 15px; margin: 0; }
</style>
</head><body>
<div id="frame">
  <div class="pane">
    <div class="label">In your Markdown</div>
    <pre class="source" id="source"></pre>
  </div>
  <div class="pane">
    <div class="label">In the preview</div>
    <div id="host"></div>
  </div>
</div>
<script>window.__TERMINALOGUE_SOURCE__ = ${JSON.stringify(source)};</script>
<script>
  // The block as it is written, coloured the way an editor would colour it.
  const pre = document.getElementById('source');
  for (const line of ['\`\`\`termlogue', ...window.__TERMINALOGUE_SOURCE__.split('\\n'), '\`\`\`']) {
    const span = document.createElement('span');
    if (line.startsWith('\`\`\`')) span.className = 'fence';
    else if (line.startsWith('@')) span.className = 'directive';
    else if (line.startsWith('$ ')) span.className = 'command';
    span.textContent = line + '\\n';
    pre.appendChild(span);
  }
</script>
<script>${bundle.outputFiles[0].text}</script>
</body></html>
`;

const out = resolve(root, 'dist-demo/page.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page, 'utf8');
console.log(`[demo] page -> ${out}`);
console.log('[demo] record it with: node scripts/demo/record.mjs');
