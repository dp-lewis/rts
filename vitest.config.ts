import { defineConfig } from 'vitest/config';

// The simulation is headless by construction (Constitution II), so the default
// environment is plain Node with no DOM. TC-INT-003 asserts this directly: a
// test that would pass under jsdom but fail under node is a test that has
// stopped guarding the boundary.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Playwright owns tests/e2e/ (Phase 8); Vitest must not try to collect it.
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
