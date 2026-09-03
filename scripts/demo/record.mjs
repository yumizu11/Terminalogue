import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/**
 * Records the demo page frame by frame.
 *
 *   npx playwright install chromium      # once
 *   node scripts/demo/build-page.mjs
 *   node --experimental-strip-types scripts/demo/record.mjs
 *
 * Playwright is not a dependency of this repository: it is fetched for the rare
 * occasion the README animation is regenerated, which is why this script is run
 * by hand rather than from a package script.
 *
 * Each frame records when it was taken, and the frame list ffmpeg is given
 * carries those real durations. A screenshot is not instant, so timing the GIF
 * from a nominal frame rate would play it back at the wrong speed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const PAGE = resolve(root, 'dist-demo/page.html');
const FRAMES = resolve(root, 'dist-demo/frames');
/** How long to keep recording after the animation has finished, in ms. */
const TAIL = 1600;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  // Recorded at 2x and scaled down: text in a GIF is unreadable otherwise.
  deviceScaleFactor: 2,
});

await page.goto(`file:///${PAGE.replace(/\\/g, '/')}`);
await page.waitForSelector('.tlg');

const target = page.locator('#frame');
const shots = [];
const start = Date.now();
let finishedAt = null;

await page.evaluate(() => window.__demo.play());

for (let i = 0; i < 400; i++) {
  const at = Date.now();
  const file = resolve(FRAMES, `frame_${String(i).padStart(3, '0')}.png`);
  await target.screenshot({ path: file });
  shots.push({ file, at });

  if ((await page.evaluate(() => window.__demo.state())) === 'finished') {
    finishedAt ??= at;
    if (at - finishedAt >= TAIL) break;
  }
  if (at - start > 60_000) break;
}

await browser.close();

// ffmpeg's concat demuxer wants a duration per frame, and the last frame needs
// its file repeated for that duration to count.
const lines = [];
for (const [i, shot] of shots.entries()) {
  const next = shots[i + 1];
  lines.push(`file '${shot.file.replace(/\\/g, '/')}'`);
  lines.push(`duration ${(next ? (next.at - shot.at) / 1000 : 0.1).toFixed(3)}`);
}
lines.push(`file '${shots[shots.length - 1].file.replace(/\\/g, '/')}'`);
writeFileSync(resolve(FRAMES, 'frames.txt'), `${lines.join('\n')}\n`, 'utf8');

const seconds = ((shots[shots.length - 1].at - start) / 1000).toFixed(1);
console.log(`[demo] ${shots.length} frames over ${seconds}s -> ${FRAMES}`);
console.log('[demo] encode them with the ffmpeg command in the README');
