import { parseTerminalogue } from '../../packages/core/dist/index.js';
import { mountTerminalogue } from '../../packages/renderer/dist/index.js';

/**
 * The page recorded for the README animation: the real parser, the real
 * renderer, the real stylesheet, with the timings pinned so that two recordings
 * of the same block are the same recording.
 */

const host = document.getElementById('host');
const instance = mountTerminalogue(host, parseTerminalogue(window.__TERMINALOGUE_SOURCE__), {
  autoplay: false,
  autoplayOnVisible: false,
  reducedMotion: false,
  // No jitter: a recording should differ only when the block does.
  jitterMin: 1,
  jitterMax: 1,
  random: () => 0.5,
});

window.__demo = {
  play: () => instance.play(),
  state: () => instance.state,
};
