import { parseTerminalogue } from '../../packages/core/dist/index.js';
import { mountTerminalogue } from '../../packages/renderer/dist/index.js';

/**
 * The page recorded for a README animation: the real parser, the real renderer,
 * the real stylesheet, with the timings pinned so that two recordings of the
 * same block are the same recording.
 */

/**
 * mulberry32: three lines of arithmetic and the same sequence every run.
 *
 * The renderer takes its randomness as an argument, so seeding it here keeps a
 * recording reproducible without a seed library reaching the shipped code — and
 * without pinning the value to a constant, which `@typo` would read as the same
 * decision at every keystroke. Jitter is pinned by `jitterMin === jitterMax`
 * rather than by the number drawn, so this changes the typing rhythm of nothing:
 * a block without `@typo` records exactly as it always did.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const host = document.getElementById('host');
const instance = mountTerminalogue(host, parseTerminalogue(window.__TERMINALOGUE_SOURCE__), {
  autoplay: false,
  autoplayOnVisible: false,
  reducedMotion: false,
  // No jitter: a recording should differ only when the block does.
  jitterMin: 1,
  jitterMax: 1,
  random: mulberry32(window.__TERMINALOGUE_SEED__ ?? 1),
});

window.__demo = {
  play: () => instance.play(),
  state: () => instance.state,
};
