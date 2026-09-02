import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test against the shared sources so the suite does not depend on build order.
      '@terminalogue/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@terminalogue/renderer': fileURLToPath(new URL('../renderer/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
