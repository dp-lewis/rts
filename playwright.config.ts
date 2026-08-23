import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration — M7.
 *
 * Chromium only, and deliberately so: Constitution IV verifies determinism across
 * Node on ubuntu and macOS plus Chromium, and the browser's job in that matrix is
 * to prove the simulation produces identical hashes under a THIRD engine. Adding
 * Firefox and WebKit would multiply run time without adding a determinism claim,
 * because the simulation is pure TypeScript with no engine-specific surface.
 *
 * The dev server is started by Playwright rather than assumed, so `npm run e2e`
 * works from a clean checkout and in CI without a separate orchestration step.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // A fixed viewport: the playfield is a fixed 1280x704 that Phaser scales to
    // fit, so a varying viewport would make canvas-relative coordinates in the
    // journey steps unreproducible.
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The PRODUCTION build, not the dev server. M5 shipped a bundle with no
    // sprites while `npm run dev` looked perfect, because the dev server serves
    // the project root; testing the preview is what makes that class of defect
    // visible to E2E rather than only to a human checking dist/.
    command: 'npm run build && npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
