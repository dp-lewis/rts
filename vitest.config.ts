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
    coverage: {
      provider: 'v8',
      // The explicit `include` is the whole point. Without it, v8 reports only
      // files a test imported — a file with NO tests is not reported as 0%, it is
      // not reported at all, and the headline percentage is an average over
      // exactly the files that were already covered. That is how
      // src/game/render/world.ts, src/game/scenes/Match.ts and src/sim/setup.ts
      // sat at 0% behind a "96.45%" summary. Reported this way the same run reads
      // 86.98%, which is the true number.
      // (Vitest 4 removed the old `all` flag; `include` now carries this.)
      include: ['src/**/*.ts'],
      // The browser entry point and the Phaser boot are pure wiring with no
      // branches; they are exercised by the app, not by Vitest.
      exclude: ['src/game/index.ts', 'src/game/main.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        // Constitution III sets >=90% for the SIMULATION, so the gate is scoped to
        // src/sim rather than applied globally — a global number would let a
        // well-covered simulation mask an untested presentation layer, which is
        // exactly what the default reporting was already doing.
        //
        // Aggregated across the glob, NOT per-file: `perFile: true` is the
        // stronger gate and was tried, but replay.ts sits at 79.48% branches
        // (M1 code, pre-existing) and would fail the build on work unrelated to
        // whatever change is being made. Raising replay.ts is its own task.
        'src/sim/**/*.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
});
